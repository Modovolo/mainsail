#!/usr/bin/env python3
# This module implements a WebSocket-based fleet management service for distributed printers.
# It handles reverse WebSocket connections from printers, manages their registration and status,
# and provides a WebSocket and HTTP API for web clients (such as Mainsail) to monitor and control the fleet.
# Key Components:
# - FleetManager class: Manages printer and web client connections, registration, status updates, and message routing.
# - Printer registration: Printers must send a registration message (with a 'printer_id' key) as their first message.
# - Web client interface: Allows web clients to receive fleet status and send commands to printers.
# - HTTP API: Provides endpoints for health checks and fleet status, with authentication.
# - Signal handling: Graceful shutdown on SIGINT and SIGTERM.
# Registry Key Usage:
# - The "registry key" in this context is the 'printer_id' field.
# - It is first used in the `register_printer` method, where the incoming registration message from a printer must include a 'printer_id'.
# - The 'printer_id' is used as the key in the `connected_printers` and `printer_status` dictionaries to track each printer's connection and status.
# - All subsequent interactions with a printer (status updates, commands, disconnects) reference this 'printer_id' as the registry key.

"""
Fleet Manager WebSocket Service
Handles reverse WebSocket connections from distributed printers
"""
import asyncio
import json
import logging
import os
import time
import uuid
import re
from datetime import datetime
from typing import Dict, Set, Optional, Tuple
import websockets
from websockets.server import serve
import signal
import sys

from auth_postgres import setup_auth_routes, AuthDatabase

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Global database instance (initialized in start_servers)
auth_db: Optional[AuthDatabase] = None


class FleetManager:
    def __init__(self):
        self.connected_printers: Dict[str, websockets.WebSocketServerProtocol] = {}
        self.printer_status: Dict[str, dict] = {}
        self.web_clients: Set[websockets.WebSocketServerProtocol] = set()
        
        # Phase 1: Bidirectional proxying support
        # Track which web clients are subscribed to which printer
        self.printer_subscriptions: Dict[str, Set[websockets.WebSocketServerProtocol]] = {}
        # Track pending requests for response routing: fleet_id -> {web_client, original_id, printer_id, timestamp}
        self.pending_requests: Dict[str, dict] = {}
        # Cleanup interval for stale requests (seconds)
        self.request_timeout = 60

    async def register_printer(self, websocket, printer_data):
        """Register a printer connection - validates printer_id against database"""
        global auth_db
        
        printer_id = printer_data.get('printer_id')
        if not printer_id:
            await websocket.send(json.dumps({
                'type': 'error',
                'message': 'Missing printer_id'
            }))
            return False

        # Validate printer_id against the database
        if auth_db:
            printer = auth_db.validate_printer_credential(printer_id)
            if not printer:
                logger.warning(f"Invalid printer_id: {printer_id}")
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': 'Invalid or unregistered printer_id'
                }))
                return False
            printer_name = printer.name
            owner_id = printer.owner_id
        else:
            # Fallback if db not available (shouldn't happen in production)
            logger.warning("Database not available for printer validation")
            printer_name = printer_data.get('name', 'Unknown')
            owner_id = None

        self.connected_printers[printer_id] = websocket
        self.printer_status[printer_id] = {
            'connected_at': datetime.now().isoformat(),
            'last_seen': datetime.now().isoformat(),
            'status': 'connected',
            'name': printer_name,
            'owner_id': owner_id,
            'data': printer_data
        }

        logger.info(f"Printer {printer_id} ({printer_name}) registered")
        await self.broadcast_to_web_clients({
            'type': 'printer_connected',
            'printer_id': printer_id,
            'status': self.printer_status[printer_id]
        })

        await websocket.send(json.dumps({
            'type': 'registered',
            'printer_id': printer_id,
            'name': printer_name,
            'message': 'Successfully registered with fleet'
        }))
        return True

    async def handle_printer_message(self, websocket, message, printer_id):
        """Handle messages from printer"""
        try:
            data = json.loads(message)
            
            # Handle null/non-dict JSON values
            if not isinstance(data, dict):
                logger.warning(f"Non-object JSON from {printer_id}: {message}")
                return
                
            message_type = data.get('type')

            # Check if printer is registered
            if printer_id not in self.printer_status:
                logger.warning(f"Message from unregistered printer {printer_id}")
                return

            # Handle proxied Moonraker notifications (has _proxy flag)
            if data.get('_proxy'):
                # Remove the proxy flag and forward to subscribers
                data.pop('_proxy', None)
                method = data.get('method', 'unknown')
                logger.info(f"Forwarding proxy notification to subscribers: {method}")
                await self.broadcast_to_printer_subscribers(printer_id, data)
                return

            # Handle proxied Moonraker responses (has _fleet_id)
            if '_fleet_id' in data:
                fleet_id = data.pop('_fleet_id')
                pending = self.pending_requests.pop(fleet_id, None)
                if pending:
                    # Restore original request ID and send to web client
                    if 'id' in data:
                        data['id'] = pending['original_id']
                    try:
                        await pending['web_client'].send(json.dumps(data))
                        logger.info(f"Routed response {fleet_id} back to web client")
                    except Exception as e:
                        logger.error(f"Failed to route response to web client: {e}")
                else:
                    logger.warning(f"No pending request for fleet_id: {fleet_id}")
                return

            # Handle Moonraker notifications (forward to subscribed clients)
            if message_type == 'moonraker_notification':
                notification = data.get('notification', {})
                await self.broadcast_to_printer_subscribers(printer_id, notification)
                return

            # Handle status updates
            if message_type == 'status_update':
                self.printer_status[printer_id].update({
                    'last_seen': datetime.now().isoformat(),
                    'printer_data': data.get('data', {})
                })
                
                # Broadcast to all web clients (fleet status) and printer subscribers
                await self.broadcast_to_web_clients({
                    'type': 'printer_status',
                    'printer_id': printer_id,
                    'data': data.get('data', {})
                })

            elif message_type == 'heartbeat':
                self.printer_status[printer_id]['last_seen'] = datetime.now().isoformat()
                await websocket.send(json.dumps({'type': 'heartbeat_ack'}))

            else:
                logger.warning(f"Unknown message type from {printer_id}: {message_type}")

        except json.JSONDecodeError:
            logger.error(f"Invalid JSON from printer {printer_id}: {message}")

    async def handle_printer_connection(self, websocket, path):
        """Handle WebSocket connection from printer"""
        printer_id = None
        try:
            logger.info(f"New printer connection from {websocket.remote_address}, path: {path}")
            
            # Wait for registration with timeout
            registration = await asyncio.wait_for(websocket.recv(), timeout=30.0)
            logger.info(f"Received registration: {registration}")
            
            reg_data = json.loads(registration)

            if reg_data.get('type') != 'register':
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': 'First message must be registration'
                }))
                return

            if not await self.register_printer(websocket, reg_data):
                return

            printer_id = reg_data.get('printer_id')

            # Handle ongoing messages
            async for message in websocket:
                await self.handle_printer_message(websocket, message, printer_id)

        except asyncio.TimeoutError:
            logger.warning(f"Registration timeout for connection from {websocket.remote_address}")
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Printer {printer_id} disconnected")
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in registration: {e}")
        except Exception as e:
            logger.error(f"Error handling printer connection: {e}")
        finally:
            if printer_id and printer_id in self.connected_printers:
                del self.connected_printers[printer_id]
                if printer_id in self.printer_status:
                    self.printer_status[printer_id]['status'] = 'disconnected'
                await self.broadcast_to_web_clients({
                    'type': 'printer_disconnected',
                    'printer_id': printer_id
                })

    async def handle_web_client(self, websocket, path):
        """Handle WebSocket connection from web clients (Mainsail)"""
        subscribed_printer_id = None
        
        # Check if this is a per-printer connection: /ws/client/{printer_id}
        match = re.match(r'^/ws/client/([a-f0-9]+)$', path)
        if match:
            subscribed_printer_id = match.group(1)
            logger.info(f"Web client subscribing to printer: {subscribed_printer_id}")
            
            # Add to printer subscriptions
            if subscribed_printer_id not in self.printer_subscriptions:
                self.printer_subscriptions[subscribed_printer_id] = set()
            self.printer_subscriptions[subscribed_printer_id].add(websocket)
            logger.info(f"Added subscriber, now have {len(self.printer_subscriptions[subscribed_printer_id])} subscribers for {subscribed_printer_id}")
            
            # Check if printer is connected
            if subscribed_printer_id not in self.connected_printers:
                await websocket.send(json.dumps({
                    'jsonrpc': '2.0',
                    'error': {'code': -1, 'message': 'Printer not connected'},
                    'id': None
                }))
        else:
            # General fleet status connection
            self.web_clients.add(websocket)
        
        try:
            logger.info(f"New web client connection from {websocket.remote_address}, path: {path}")
            
            if subscribed_printer_id:
                # For printer-specific connections, send initial connection status
                is_connected = subscribed_printer_id in self.connected_printers
                await websocket.send(json.dumps({
                    'type': 'connection_status',
                    'printer_id': subscribed_printer_id,
                    'connected': is_connected,
                    'status': self.printer_status.get(subscribed_printer_id, {})
                }))
            else:
                # Send current fleet status for general connections
                await websocket.send(json.dumps({
                    'type': 'fleet_status',
                    'printers': self.printer_status
                }))

            logger.info(f"Starting message loop for web client {subscribed_printer_id}")
            async for message in websocket:
                try:
                    data = json.loads(message)
                    logger.debug(f"Web client message: {data}")
                    # Handle batched requests (array of commands)
                    if isinstance(data, list):
                        for command in data:
                            await self.handle_web_command(websocket, command, subscribed_printer_id)
                    else:
                        await self.handle_web_command(websocket, data, subscribed_printer_id)
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON from web client: {message}")
            logger.info(f"Message loop exited normally for web client {subscribed_printer_id}")

        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f"Web client disconnected: code={e.code}, reason={e.reason}")
        except Exception as e:
            logger.error(f"Error handling web client connection: {e}", exc_info=True)
        finally:
            logger.info(f"Cleaning up web client for printer {subscribed_printer_id}")
            self.web_clients.discard(websocket)
            if subscribed_printer_id and subscribed_printer_id in self.printer_subscriptions:
                self.printer_subscriptions[subscribed_printer_id].discard(websocket)
                logger.info(f"Removed subscriber, now have {len(self.printer_subscriptions[subscribed_printer_id])} subscribers for {subscribed_printer_id}")

    async def handle_web_command(self, websocket, command, subscribed_printer_id=None):
        """Handle commands from web interface - supports JSON-RPC proxying"""
        
        # Determine target printer
        printer_id = subscribed_printer_id or command.get('printer_id')
        
        # Check if this is a JSON-RPC request (Moonraker protocol)
        if command.get('jsonrpc') == '2.0' and 'method' in command:
            if not printer_id:
                await websocket.send(json.dumps({
                    'jsonrpc': '2.0',
                    'error': {'code': -32600, 'message': 'No printer specified'},
                    'id': command.get('id')
                }))
                return
            
            if printer_id not in self.connected_printers:
                await websocket.send(json.dumps({
                    'jsonrpc': '2.0',
                    'error': {'code': -32001, 'message': 'Printer not connected'},
                    'id': command.get('id')
                }))
                return
            
            # Generate unique fleet request ID
            fleet_id = f"{printer_id}:{command.get('id', 'none')}:{uuid.uuid4().hex[:8]}"
            
            # Store pending request for response routing
            self.pending_requests[fleet_id] = {
                'web_client': websocket,
                'original_id': command.get('id'),
                'printer_id': printer_id,
                'timestamp': time.time()
            }
            
            # Add fleet ID marker and forward to printer
            command['_fleet_id'] = fleet_id
            
            try:
                printer_ws = self.connected_printers[printer_id]
                await printer_ws.send(json.dumps(command))
                logger.debug(f"Proxied request {fleet_id} to printer {printer_id}")
            except Exception as e:
                logger.error(f"Failed to forward command to printer {printer_id}: {e}")
                # Remove pending request and send error
                self.pending_requests.pop(fleet_id, None)
                await websocket.send(json.dumps({
                    'jsonrpc': '2.0',
                    'error': {'code': -32002, 'message': f'Failed to send to printer: {e}'},
                    'id': command.get('id')
                }))
            return
        
        # Handle legacy command format
        command_type = command.get('type')
        if printer_id and printer_id in self.connected_printers:
            printer_ws = self.connected_printers[printer_id]
            await printer_ws.send(json.dumps(command))

    async def broadcast_to_web_clients(self, message):
        """Broadcast message to all connected web clients"""
        if self.web_clients:
            await asyncio.gather(
                *[client.send(json.dumps(message)) for client in self.web_clients],
                return_exceptions=True
            )

    async def broadcast_to_printer_subscribers(self, printer_id: str, message: dict):
        """Broadcast message to all web clients subscribed to a specific printer"""
        subscribers = self.printer_subscriptions.get(printer_id, set())
        logger.debug(f"broadcast_to_printer_subscribers: printer={printer_id}, subscribers={len(subscribers)}, all_subscriptions={list(self.printer_subscriptions.keys())}")
        if subscribers:
            msg_str = json.dumps(message)
            await asyncio.gather(
                *[client.send(msg_str) for client in subscribers],
                return_exceptions=True
            )

    async def cleanup_stale_requests(self):
        """Periodically clean up stale pending requests"""
        while True:
            try:
                await asyncio.sleep(30)  # Run every 30 seconds
                now = time.time()
                stale_ids = [
                    fleet_id for fleet_id, req in self.pending_requests.items()
                    if now - req['timestamp'] > self.request_timeout
                ]
                for fleet_id in stale_ids:
                    pending = self.pending_requests.pop(fleet_id, None)
                    if pending:
                        logger.warning(f"Request {fleet_id} timed out")
                        try:
                            await pending['web_client'].send(json.dumps({
                                'jsonrpc': '2.0',
                                'error': {'code': -32003, 'message': 'Request timeout'},
                                'id': pending['original_id']
                            }))
                        except:
                            pass
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup task: {e}")

    async def start_servers(self):
        """Start WebSocket servers and HTTP API"""
        global auth_db
        
        from aiohttp import web
        from auth_postgres import setup_auth_routes, require_auth, AuthDatabase
        from printer_registration import setup_printer_registration_routes
        from file_repository import setup_file_routes
        
        # Initialize database
        auth_db = AuthDatabase()
        logger.info("Database initialized for printer validation")
        
        # Setup HTTP API server with auth
        app = web.Application()
        setup_auth_routes(app)
        setup_printer_registration_routes(app)
        setup_file_routes(app, fleet_manager=self)
        
        # Add health check endpoint
        async def health_check(request):
            return web.json_response({
                'status': 'healthy',
                'connected_printers': len(self.connected_printers),
                'web_clients': len(self.web_clients)
            })
        
        app.router.add_get('/api/health', health_check)
        
        # Add fleet status endpoint (authenticated)
        from auth_postgres import require_auth
        
        @require_auth
        async def get_fleet_status(request):
            return web.json_response({
                'printers': self.printer_status,
                'connected_count': len(self.connected_printers)
            })
        
        app.router.add_get('/api/fleet/status', get_fleet_status)
        
        # OTA Update endpoints for fleet clients
        async def get_client_version(request):
            """Return the latest fleet_client version info"""
            try:
                version_file = os.path.join(os.path.dirname(__file__), 'client_version.json')
                with open(version_file, 'r') as f:
                    version_info = json.load(f)
                return web.json_response(version_info)
            except Exception as e:
                logger.error(f"Error reading client version: {e}")
                return web.json_response({'error': str(e)}, status=500)
        
        async def download_client(request):
            """Serve the latest fleet_client.py for OTA updates"""
            try:
                client_file = os.path.join(os.path.dirname(__file__), 'printer_client', 'fleet_client.py')
                if not os.path.exists(client_file):
                    return web.json_response({'error': 'Client file not found'}, status=404)
                
                with open(client_file, 'r') as f:
                    content = f.read()
                
                return web.Response(
                    text=content,
                    content_type='text/x-python',
                    headers={
                        'Content-Disposition': 'attachment; filename="fleet_client.py"'
                    }
                )
            except Exception as e:
                logger.error(f"Error serving client file: {e}")
                return web.json_response({'error': str(e)}, status=500)
        
        app.router.add_get('/api/client/version', get_client_version)
        app.router.add_get('/api/client/download', download_client)
        
        # Serve install script
        async def serve_install_script(request):
            """Serve the fleet client install script"""
            try:
                install_file = os.path.join(os.path.dirname(__file__), 'printer_client', 'install.sh')
                if not os.path.exists(install_file):
                    return web.Response(
                        text='#!/bin/bash\necho "Install script not found on server"\nexit 1\n',
                        content_type='text/x-shellscript',
                        status=404
                    )
                
                with open(install_file, 'r') as f:
                    content = f.read()
                
                return web.Response(
                    text=content,
                    content_type='text/x-shellscript',
                    headers={
                        'Content-Disposition': 'inline; filename="install.sh"'
                    }
                )
            except Exception as e:
                logger.error(f"Error serving install script: {e}")
                return web.Response(
                    text=f'#!/bin/bash\necho "Error: {e}"\nexit 1\n',
                    content_type='text/x-shellscript',
                    status=500
                )
        
        async def serve_fleet_client(request):
            """Serve the fleet client Python script"""
            try:
                client_file = os.path.join(os.path.dirname(__file__), 'printer_client', 'fleet_client.py')
                if not os.path.exists(client_file):
                    return web.Response(
                        text='# Fleet client not found on server\nimport sys; sys.exit(1)',
                        content_type='text/x-python',
                        status=404
                    )
                
                with open(client_file, 'r') as f:
                    content = f.read()
                
                return web.Response(
                    text=content,
                    content_type='text/x-python',
                    headers={
                        'Content-Disposition': 'inline; filename="fleet_client.py"'
                    }
                )
            except Exception as e:
                logger.error(f"Error serving fleet client: {e}")
                return web.Response(
                    text=f'# Error: {e}\nimport sys; sys.exit(1)',
                    content_type='text/x-python',
                    status=500
                )
        
        app.router.add_get('/install.sh', serve_install_script)
        app.router.add_get('/api/client/fleet_client.py', serve_fleet_client)
        
        # Start HTTP server
        runner = web.AppRunner(app)
        await runner.setup()
        http_site = web.TCPSite(runner, '0.0.0.0', 8080)
        await http_site.start()
        logger.info("HTTP API server: http://0.0.0.0:8080")
        
        # Printer connections on port 9080
        printer_server = await serve(
            self.handle_printer_connection,
            "0.0.0.0",
            9080,
            ping_interval=30,
            ping_timeout=10
        )

        # Web client connections on port 9081
        web_server = await serve(
            self.handle_web_client,
            "0.0.0.0", 
            9081,
            ping_interval=30,
            ping_timeout=10
        )

        logger.info("Fleet Manager started")
        logger.info("Printer WebSocket server: ws://0.0.0.0:9080")
        logger.info("Web client WebSocket server: ws://0.0.0.0:9081")
        logger.info("Web client proxy endpoint: ws://0.0.0.0:9081/ws/client/{printer_id}")

        # Start cleanup task for stale pending requests
        cleanup_task = asyncio.create_task(self.cleanup_stale_requests())

        try:
            await asyncio.gather(
                printer_server.wait_closed(),
                web_server.wait_closed()
            )
        finally:
            cleanup_task.cancel()

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, shutting down...")
    sys.exit(0)

if __name__ == "__main__":
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    fleet_manager = FleetManager()
    asyncio.run(fleet_manager.start_servers())