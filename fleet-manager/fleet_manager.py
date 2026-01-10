#!/usr/bin/env python3
"""
Fleet Manager WebSocket Service
Handles reverse WebSocket connections from distributed printers
"""
import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Dict, Set
import websockets
from websockets.server import serve
import signal
import sys

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FleetManager:
    def __init__(self):
        self.connected_printers: Dict[str, websockets.WebSocketServerProtocol] = {}
        self.printer_status: Dict[str, dict] = {}
        self.web_clients: Set[websockets.WebSocketServerProtocol] = set()

    async def register_printer(self, websocket, printer_data):
        """Register a printer connection"""
        printer_id = printer_data.get('printer_id')
        if not printer_id:
            await websocket.send(json.dumps({
                'type': 'error',
                'message': 'Missing printer_id'
            }))
            return False

        self.connected_printers[printer_id] = websocket
        self.printer_status[printer_id] = {
            'connected_at': datetime.now().isoformat(),
            'last_seen': datetime.now().isoformat(),
            'status': 'connected',
            'data': printer_data
        }

        logger.info(f"Printer {printer_id} registered")
        await self.broadcast_to_web_clients({
            'type': 'printer_connected',
            'printer_id': printer_id,
            'status': self.printer_status[printer_id]
        })

        await websocket.send(json.dumps({
            'type': 'registered',
            'printer_id': printer_id,
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

            if message_type == 'status_update':
                self.printer_status[printer_id].update({
                    'last_seen': datetime.now().isoformat(),
                    'printer_data': data.get('data', {})
                })
                
                # Broadcast to web clients
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
        self.web_clients.add(websocket)
        try:
            logger.info(f"New web client connection from {websocket.remote_address}, path: {path}")
            
            # Send current printer status
            await websocket.send(json.dumps({
                'type': 'fleet_status',
                'printers': self.printer_status
            }))

            async for message in websocket:
                try:
                    data = json.loads(message)
                    logger.info(f"Web client message: {data}")
                    await self.handle_web_command(data)
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON from web client: {message}")

        except websockets.exceptions.ConnectionClosed:
            logger.info("Web client disconnected")
        except Exception as e:
            logger.error(f"Error handling web client connection: {e}")
        finally:
            self.web_clients.discard(websocket)

    async def handle_web_command(self, command):
        """Handle commands from web interface"""
        command_type = command.get('type')
        printer_id = command.get('printer_id')

        if printer_id in self.connected_printers:
            printer_ws = self.connected_printers[printer_id]
            await printer_ws.send(json.dumps(command))

    async def broadcast_to_web_clients(self, message):
        """Broadcast message to all connected web clients"""
        if self.web_clients:
            await asyncio.gather(
                *[client.send(json.dumps(message)) for client in self.web_clients],
                return_exceptions=True
            )

    async def start_servers(self):
        """Start WebSocket servers"""
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

        await asyncio.gather(
            printer_server.wait_closed(),
            web_server.wait_closed()
        )

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