#!/usr/bin/env python3
"""
Fleet Client Service
Maintains a persistent WebSocket connection to the Fleet Manager.
Also maintains a WebSocket connection to local Moonraker for JSON-RPC proxying.
Reads configuration from /etc/fleet-client/config.json (created by fleet_register.py).

This script is meant to run as a systemd service.
Supports OTA (Over-The-Air) updates from fleet-manager.
"""

import asyncio
import json
import logging
import time
import signal
import sys
import os
import hashlib
import shutil
import subprocess
import socket
from datetime import datetime
from typing import Optional, Dict, Any
import websockets
import aiohttp

# Client version - update this when releasing new versions
CLIENT_VERSION = "3.5.0"

# Configuration
CONFIG_FILE = os.environ.get("FLEET_CONFIG_FILE", "/etc/fleet-client/config.json")
LOG_LEVEL = os.environ.get("FLEET_LOG_LEVEL", "INFO")
UPDATE_CHECK_INTERVAL = int(os.environ.get("FLEET_UPDATE_INTERVAL", "3600"))  # Default: 1 hour

# Setup logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_local_hostname():
    """Get the local hostname for webcam access"""
    try:
        return socket.gethostname()
    except Exception:
        return None


def get_local_ip():
    """Get the local IP address that can be used to reach this machine"""
    try:
        # Create a socket to determine the local IP
        # This works even if we can't actually connect
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0)
        # Use a non-routable address to find the interface IP
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


class FleetClient:
    """Fleet Manager WebSocket Client with Moonraker JSON-RPC Proxy"""
    
    def __init__(self, config: dict):
        self.printer_id = config["printer_id"]
        self.printer_name = config.get("name", "Unknown")
        self.fleet_ws_url = config["fleet_ws_url"]
        self.moonraker_url = config.get("moonraker_url", "http://127.0.0.1:7125")
        self.moonraker_ws_url = config.get("moonraker_ws_url", "ws://127.0.0.1:7125/websocket")
        
        # Fleet manager connection
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.running = True
        self.connected = False
        self.reconnect_delay = 5  # Start with 5 seconds
        self.max_reconnect_delay = 300  # Max 5 minutes
        
        # Moonraker WebSocket connection for JSON-RPC proxy
        self.moonraker_ws: Optional[websockets.WebSocketClientProtocol] = None
        self.moonraker_connected = False
        self.moonraker_reconnect_delay = 2
        self.moonraker_connection_id = None  # Set after identifying with Moonraker
        
        # Track pending requests from fleet to moonraker
        # Maps moonraker request id -> fleet_id for response routing
        self.pending_moonraker_requests: Dict[int, str] = {}
        self.moonraker_request_id = 1000  # Start high to avoid conflicts
        
    async def get_printer_status(self) -> dict:
        """Get current printer status from Moonraker"""
        try:
            async with aiohttp.ClientSession() as session:
                # Get printer info
                async with session.get(
                    f"{self.moonraker_url}/printer/info",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        printer_info = await resp.json()
                    else:
                        printer_info = {"state": "error", "error": f"HTTP {resp.status}"}
                
                # Get printer objects (temperatures, print status, etc.)
                query = "print_stats&toolhead&extruder&heater_bed&display_status"
                async with session.get(
                    f"{self.moonraker_url}/printer/objects/query?{query}",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    if resp.status == 200:
                        objects_data = await resp.json()
                        printer_objects = objects_data.get("result", {}).get("status", {})
                    else:
                        printer_objects = {}
                
                return {
                    "timestamp": datetime.now().isoformat(),
                    "printer_info": printer_info,
                    "print_stats": printer_objects.get("print_stats", {}),
                    "toolhead": printer_objects.get("toolhead", {}),
                    "extruder": printer_objects.get("extruder", {}),
                    "heater_bed": printer_objects.get("heater_bed", {}),
                    "display_status": printer_objects.get("display_status", {}),
                    "moonraker_connected": True
                }
                
        except asyncio.TimeoutError:
            logger.warning("Timeout getting printer status from Moonraker")
            return {"moonraker_connected": False, "error": "timeout"}
        except aiohttp.ClientError as e:
            logger.warning(f"Error connecting to Moonraker: {e}")
            return {"moonraker_connected": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Unexpected error getting printer status: {e}")
            return {"moonraker_connected": False, "error": str(e)}
    
    # ===== Moonraker WebSocket Proxy Methods =====
    
    async def connect_moonraker(self) -> bool:
        """Connect to local Moonraker WebSocket"""
        try:
            logger.info(f"Connecting to Moonraker WebSocket: {self.moonraker_ws_url}")
            
            self.moonraker_ws = await websockets.connect(
                self.moonraker_ws_url,
                ping_interval=20,
                ping_timeout=10,
                close_timeout=5
            )
            
            self.moonraker_connected = True
            self.moonraker_reconnect_delay = 2  # Reset delay
            logger.info("Connected to Moonraker WebSocket")
            
            # Identify ourselves to Moonraker
            await self._identify_with_moonraker()
            
            return True
            
        except Exception as e:
            logger.error(f"Moonraker WebSocket connection failed: {e}")
            self.moonraker_connected = False
            return False
    
    async def _identify_with_moonraker(self):
        """Identify ourselves to Moonraker and get connection_id"""
        try:
            identify_msg = {
                "jsonrpc": "2.0",
                "method": "server.connection.identify",
                "params": {
                    "client_name": "fleet_client",
                    "version": CLIENT_VERSION,
                    "type": "agent",
                    "url": "https://fleet.modovolo.com"
                },
                "id": 1
            }
            await self.moonraker_ws.send(json.dumps(identify_msg))
            
            # Wait for response
            response = await asyncio.wait_for(self.moonraker_ws.recv(), timeout=5.0)
            data = json.loads(response)
            
            if "result" in data and "connection_id" in data["result"]:
                self.moonraker_connection_id = data["result"]["connection_id"]
                logger.info(f"Identified with Moonraker, connection_id: {self.moonraker_connection_id}")
            else:
                logger.warning(f"Unexpected identify response: {data}")
                self.moonraker_connection_id = 1
                
        except asyncio.TimeoutError:
            logger.warning("Timeout waiting for identify response")
            self.moonraker_connection_id = 1
        except Exception as e:
            logger.error(f"Error identifying with Moonraker: {e}")
            self.moonraker_connection_id = 1
    
    async def moonraker_message_loop(self):
        """Handle messages from Moonraker WebSocket"""
        while self.running:
            if not self.moonraker_connected:
                if await self.connect_moonraker():
                    pass  # Connected, continue to message loop
                else:
                    await asyncio.sleep(self.moonraker_reconnect_delay)
                    self.moonraker_reconnect_delay = min(
                        self.moonraker_reconnect_delay * 2, 30
                    )
                    continue
            
            try:
                message = await self.moonraker_ws.recv()
                await self.handle_moonraker_message(message)
            except websockets.exceptions.ConnectionClosed as e:
                logger.warning(f"Moonraker WebSocket closed: {e}")
                self.moonraker_connected = False
            except Exception as e:
                logger.error(f"Moonraker message error: {e}")
                self.moonraker_connected = False
    
    async def handle_moonraker_message(self, message: str):
        """Handle incoming messages from Moonraker"""
        try:
            data = json.loads(message)
            
            # Check if it's a response to a request we sent
            if "id" in data and data["id"] in self.pending_moonraker_requests:
                fleet_id = self.pending_moonraker_requests.pop(data["id"])
                await self.forward_moonraker_response(data, fleet_id)
                
            # Check if it's a notification (no id, has method)
            elif "method" in data and "id" not in data:
                await self.forward_moonraker_notification(data)
                
            else:
                logger.debug(f"Unhandled Moonraker message: {data}")
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON from Moonraker")
    
    async def forward_moonraker_response(self, response: dict, fleet_id: str):
        """Forward Moonraker response back to fleet manager"""
        if self.websocket and self.connected:
            try:
                # Add fleet_id so fleet manager can route to the right client
                response["_fleet_id"] = fleet_id
                await self.websocket.send(json.dumps(response))
                logger.debug(f"Forwarded response to fleet (fleet_id={fleet_id})")
            except Exception as e:
                logger.error(f"Failed to forward response to fleet: {e}")
    
    async def forward_moonraker_notification(self, notification: dict):
        """Forward Moonraker notification to fleet manager"""
        if self.websocket and self.connected:
            try:
                # Mark it as a proxy notification
                notification["_proxy"] = True
                await self.websocket.send(json.dumps(notification))
                logger.debug(f"Forwarded notification to fleet: {notification.get('method')}")
            except Exception as e:
                logger.error(f"Failed to forward notification to fleet: {e}")
    
    async def forward_to_moonraker(self, jsonrpc_message: dict):
        """Forward JSON-RPC message from fleet to Moonraker"""
        method = jsonrpc_message.get("method", "")
        fleet_id = jsonrpc_message.get("_fleet_id")
        original_id = jsonrpc_message.get("id")
        
        # Handle server.connection.identify locally - Moonraker only allows one identify per connection
        # Since we share one Moonraker connection, we fake success for additional identify calls
        if method == "server.connection.identify":
            logger.debug("Intercepting server.connection.identify - returning synthetic success")
            if fleet_id and original_id is not None:
                await self.websocket.send(json.dumps({
                    "jsonrpc": "2.0",
                    "id": original_id,
                    "_fleet_id": fleet_id,
                    "result": {
                        "connection_id": self.moonraker_connection_id or 1
                    }
                }))
            return
        
        if not self.moonraker_ws or not self.moonraker_connected:
            logger.warning("Cannot forward to Moonraker - not connected")
            # Send error response back
            if fleet_id and original_id is not None:
                await self.websocket.send(json.dumps({
                    "jsonrpc": "2.0",
                    "id": jsonrpc_message["id"],
                    "_fleet_id": fleet_id,
                    "error": {
                        "code": -32000,
                        "message": "Moonraker not connected"
                    }
                }))
            return
        
        try:
            # Extract and track fleet_id for response routing
            fleet_id = jsonrpc_message.pop("_fleet_id", None)
            
            # Use our own request ID for Moonraker
            original_id = jsonrpc_message.get("id")
            if original_id is not None and fleet_id:
                moonraker_id = self.moonraker_request_id
                self.moonraker_request_id += 1
                jsonrpc_message["id"] = moonraker_id
                
                # Map moonraker_id -> fleet_id for response routing
                self.pending_moonraker_requests[moonraker_id] = fleet_id
            
            await self.moonraker_ws.send(json.dumps(jsonrpc_message))
            logger.debug(f"Forwarded to Moonraker: {jsonrpc_message.get('method')}")
            
        except Exception as e:
            logger.error(f"Failed to forward to Moonraker: {e}")
            self.moonraker_connected = False

    # ===== Fleet Server Methods =====
    
    async def send_heartbeat(self):
        """Send heartbeat to fleet server"""
        if self.websocket and self.connected:
            try:
                await self.websocket.send(json.dumps({
                    "type": "heartbeat",
                    "printer_id": self.printer_id,
                    "timestamp": datetime.now().isoformat()
                }))
                logger.debug("Heartbeat sent")
            except Exception as e:
                logger.error(f"Failed to send heartbeat: {e}")
                self.connected = False
    
    async def send_status_update(self):
        """Send status update to fleet server"""
        if self.websocket and self.connected:
            try:
                status = await self.get_printer_status()
                await self.websocket.send(json.dumps({
                    "type": "status_update",
                    "printer_id": self.printer_id,
                    "data": status
                }))
                logger.debug("Status update sent")
            except Exception as e:
                logger.error(f"Failed to send status update: {e}")
                self.connected = False
    
    async def handle_message(self, message: str):
        """Handle incoming messages from fleet server"""
        try:
            data = json.loads(message)
            
            # Check if it's a JSON-RPC message (has method and _fleet_id from proxy)
            if "jsonrpc" in data or ("method" in data and "_fleet_id" in data):
                # This is a proxied JSON-RPC request from Mainsail - forward to Moonraker
                logger.debug(f"Received JSON-RPC from fleet: {data.get('method')}")
                await self.forward_to_moonraker(data)
                return
            
            msg_type = data.get("type")
            
            if msg_type == "registered":
                logger.info(f"Registered with fleet: {data.get('message')}")
                self.reconnect_delay = 5  # Reset reconnect delay on successful registration
                
            elif msg_type == "heartbeat_ack":
                logger.debug("Heartbeat acknowledged")
                
            elif msg_type == "command":
                await self.execute_command(data.get("command", {}))
                
            elif msg_type == "upload_file":
                await self.handle_file_upload(data)
                
            elif msg_type == "webcam_request":
                await self.handle_webcam_request(data)
                
            elif msg_type == "error":
                logger.error(f"Fleet server error: {data.get('message')}")
                
            else:
                logger.debug(f"Received message type: {msg_type}")
                
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON from fleet server")
    
    async def execute_command(self, command: dict):
        """Execute a command from fleet server"""
        cmd_type = command.get("type", command.get("action"))
        logger.info(f"Executing command: {cmd_type}")
        
        try:
            async with aiohttp.ClientSession() as session:
                if cmd_type == "emergency_stop":
                    await session.post(f"{self.moonraker_url}/printer/emergency_stop")
                    logger.info("Emergency stop executed")
                    
                elif cmd_type in ("pause_print", "pause"):
                    await session.post(f"{self.moonraker_url}/printer/print/pause")
                    logger.info("Print paused")
                    
                elif cmd_type in ("resume_print", "resume"):
                    await session.post(f"{self.moonraker_url}/printer/print/resume")
                    logger.info("Print resumed")
                    
                elif cmd_type in ("cancel_print", "cancel"):
                    await session.post(f"{self.moonraker_url}/printer/print/cancel")
                    logger.info("Print cancelled")
                    
                elif cmd_type == "gcode":
                    gcode = command.get("gcode", "")
                    if gcode:
                        await session.post(
                            f"{self.moonraker_url}/printer/gcode/script",
                            json={"script": gcode}
                        )
                        logger.info(f"Executed gcode: {gcode}")
                    
                elif cmd_type == "status_request":
                    await self.send_status_update()
                    
                else:
                    logger.warning(f"Unknown command: {cmd_type}")
                    
        except Exception as e:
            logger.error(f"Failed to execute command {cmd_type}: {e}")
    
    async def handle_file_upload(self, data: dict):
        """Handle file upload from fleet server"""
        import base64
        
        filename = data.get("filename", "uploaded.gcode")
        content_b64 = data.get("content", "")
        file_id = data.get("file_id", "unknown")
        
        try:
            # Decode base64 content
            content = base64.b64decode(content_b64)
            logger.info(f"Receiving file: {filename} ({len(content)} bytes)")
            
            # Upload to Moonraker using the file upload API
            async with aiohttp.ClientSession() as session:
                # Create multipart form data
                form = aiohttp.FormData()
                form.add_field(
                    'file',
                    content,
                    filename=filename,
                    content_type='application/octet-stream'
                )
                
                # Upload to Moonraker's gcodes directory
                upload_url = f"{self.moonraker_url}/server/files/upload"
                async with session.post(upload_url, data=form) as resp:
                    if resp.status == 201:
                        result = await resp.json()
                        logger.info(f"File uploaded successfully: {result}")
                        
                        # Send success response back to fleet
                        if self.websocket:
                            await self.websocket.send(json.dumps({
                                "type": "file_upload_complete",
                                "file_id": file_id,
                                "filename": filename,
                                "success": True,
                                "printer_id": self.printer_id
                            }))
                    else:
                        error_text = await resp.text()
                        logger.error(f"Failed to upload file to Moonraker: {resp.status} - {error_text}")
                        
                        if self.websocket:
                            await self.websocket.send(json.dumps({
                                "type": "file_upload_complete",
                                "file_id": file_id,
                                "filename": filename,
                                "success": False,
                                "error": f"Moonraker error: {resp.status}",
                                "printer_id": self.printer_id
                            }))
                            
        except Exception as e:
            logger.error(f"Failed to handle file upload: {e}")
            if self.websocket:
                try:
                    await self.websocket.send(json.dumps({
                        "type": "file_upload_complete",
                        "file_id": file_id,
                        "filename": filename,
                        "success": False,
                        "error": str(e),
                        "printer_id": self.printer_id
                    }))
                except:
                    pass
    
    async def handle_webcam_request(self, data: dict):
        """
        Handle webcam request from fleet server.
        
        This fetches webcam data from the local camera-streamer and relays
        the response back through the WebSocket connection.
        """
        import base64
        
        request_id = data.get("request_id", "unknown")
        method = data.get("method", "GET")
        path = data.get("path", "/webcam/webrtc")
        headers = data.get("headers", {})
        body_b64 = data.get("body")
        query_string = data.get("query_string", "")
        
        # Local webcam URL (camera-streamer runs on port 8080 or via reverse proxy at /webcam)
        # The path already includes /webcam prefix
        webcam_base = "http://127.0.0.1"
        url = f"{webcam_base}{path}"
        if query_string:
            url = f"{url}?{query_string}"
        
        logger.debug(f"Webcam request {request_id}: {method} {url}")
        
        try:
            # Decode body if present
            body = None
            if body_b64:
                body = base64.b64decode(body_b64)
            
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method=method,
                    url=url,
                    headers=headers,
                    data=body,
                    timeout=aiohttp.ClientTimeout(total=25)
                ) as resp:
                    # Read response
                    response_body = await resp.read()
                    
                    # Build response headers
                    response_headers = {}
                    for key, value in resp.headers.items():
                        # Skip hop-by-hop headers
                        if key.lower() not in ['content-length', 'transfer-encoding', 'connection', 'content-encoding']:
                            response_headers[key] = value
                    
                    # Send response back to fleet
                    if self.websocket:
                        await self.websocket.send(json.dumps({
                            "type": "webcam_response",
                            "request_id": request_id,
                            "status": resp.status,
                            "headers": response_headers,
                            "body": base64.b64encode(response_body).decode('utf-8')
                        }))
                        logger.debug(f"Webcam response {request_id}: status {resp.status}, {len(response_body)} bytes")
                        
        except aiohttp.ClientError as e:
            logger.error(f"Webcam request failed: {e}")
            if self.websocket:
                try:
                    await self.websocket.send(json.dumps({
                        "type": "webcam_response",
                        "request_id": request_id,
                        "error": f"Failed to connect to webcam: {str(e)}",
                        "status": 502
                    }))
                except:
                    pass
                    
        except Exception as e:
            logger.error(f"Webcam request error: {e}")
            if self.websocket:
                try:
                    await self.websocket.send(json.dumps({
                        "type": "webcam_response",
                        "request_id": request_id,
                        "error": str(e),
                        "status": 500
                    }))
                except:
                    pass

    async def connect(self) -> bool:
        """Connect to fleet server"""
        try:
            logger.info(f"Connecting to {self.fleet_ws_url}")
            
            self.websocket = await websockets.connect(
                self.fleet_ws_url,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5
            )
            
            # Get local network info for webcam access
            local_hostname = get_local_hostname()
            local_ip = get_local_ip()
            logger.info(f"Local hostname: {local_hostname}, Local IP: {local_ip}")
            
            # Send registration with local host info
            await self.websocket.send(json.dumps({
                "type": "register",
                "printer_id": self.printer_id,
                "name": self.printer_name,
                "hostname": local_hostname,
                "local_ip": local_ip,
                "capabilities": ["status_reporting", "remote_control", "gcode", "jsonrpc_proxy", "ota_update"],
                "version": CLIENT_VERSION
            }))
            
            self.connected = True
            logger.info("Connected to fleet server")
            return True
            
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            self.connected = False
            return False
    
    async def heartbeat_loop(self):
        """Background heartbeat task"""
        while self.running:
            if self.connected:
                await self.send_heartbeat()
            await asyncio.sleep(30)
    
    async def status_loop(self):
        """Background status update task"""
        while self.running:
            if self.connected:
                await self.send_status_update()
            await asyncio.sleep(60)
    
    async def update_check_loop(self):
        """Background task to check for updates"""
        # Wait a bit before first check
        await asyncio.sleep(60)
        
        while self.running:
            try:
                await self.check_for_updates()
            except Exception as e:
                logger.error(f"Update check failed: {e}")
            
            await asyncio.sleep(UPDATE_CHECK_INTERVAL)
    
    async def check_for_updates(self):
        """Check fleet-manager for available updates"""
        # Extract base URL from WebSocket URL
        ws_url = self.fleet_ws_url
        if ws_url.startswith('wss://'):
            base_url = 'https://' + ws_url[6:].split('/')[0]
        elif ws_url.startswith('ws://'):
            base_url = 'http://' + ws_url[5:].split('/')[0]
        else:
            logger.error(f"Invalid WebSocket URL format: {ws_url}")
            return
        
        version_url = f"{base_url}/api/client/version"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(version_url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status != 200:
                        logger.warning(f"Version check failed: HTTP {resp.status}")
                        return
                    
                    version_info = await resp.json()
                    remote_version = version_info.get('version', '0.0.0')
                    min_version = version_info.get('min_version', '0.0.0')
                    
                    logger.info(f"Current version: {CLIENT_VERSION}, Remote version: {remote_version}")
                    
                    # Compare versions
                    if self._version_compare(remote_version, CLIENT_VERSION) > 0:
                        logger.info(f"Update available: {CLIENT_VERSION} -> {remote_version}")
                        await self.perform_update(base_url, version_info)
                    elif self._version_compare(CLIENT_VERSION, min_version) < 0:
                        logger.warning(f"Client version {CLIENT_VERSION} is below minimum {min_version}, forcing update")
                        await self.perform_update(base_url, version_info)
                    else:
                        logger.debug("Client is up to date")
                        
        except asyncio.TimeoutError:
            logger.warning("Version check timed out")
        except aiohttp.ClientError as e:
            logger.warning(f"Version check network error: {e}")
    
    def _version_compare(self, v1: str, v2: str) -> int:
        """Compare two version strings. Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal"""
        def parse_version(v):
            return [int(x) for x in v.split('.')]
        
        v1_parts = parse_version(v1)
        v2_parts = parse_version(v2)
        
        # Pad with zeros
        while len(v1_parts) < len(v2_parts):
            v1_parts.append(0)
        while len(v2_parts) < len(v1_parts):
            v2_parts.append(0)
        
        for a, b in zip(v1_parts, v2_parts):
            if a > b:
                return 1
            elif a < b:
                return -1
        return 0
    
    async def perform_update(self, base_url: str, version_info: dict):
        """Download and install the update"""
        download_url = f"{base_url}/api/client/download"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(download_url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    if resp.status != 200:
                        logger.error(f"Failed to download update: HTTP {resp.status}")
                        return
                    
                    new_content = await resp.text()
                    
                    # Verify the downloaded file has the version constant
                    if f'CLIENT_VERSION = "{version_info["version"]}"' not in new_content:
                        logger.error("Downloaded file version mismatch, aborting update")
                        return
                    
                    # Get current script path
                    current_script = os.path.abspath(__file__)
                    backup_script = current_script + '.backup'
                    temp_script = current_script + '.new'
                    
                    logger.info(f"Updating {current_script}")
                    
                    # Write new content to temp file
                    with open(temp_script, 'w') as f:
                        f.write(new_content)
                    
                    # Make it executable
                    os.chmod(temp_script, 0o755)
                    
                    # Backup current script
                    if os.path.exists(current_script):
                        shutil.copy2(current_script, backup_script)
                    
                    # Replace current with new
                    shutil.move(temp_script, current_script)
                    
                    logger.info(f"Update installed successfully: {CLIENT_VERSION} -> {version_info['version']}")
                    logger.info("Restarting service...")
                    
                    # Notify fleet-manager about the update
                    if self.websocket and self.connected:
                        try:
                            await self.websocket.send(json.dumps({
                                "type": "client_updated",
                                "printer_id": self.printer_id,
                                "old_version": CLIENT_VERSION,
                                "new_version": version_info['version']
                            }))
                        except:
                            pass
                    
                    # Restart the systemd service
                    self.running = False
                    subprocess.Popen(['sudo', 'systemctl', 'restart', 'fleet-client'])
                    
        except Exception as e:
            logger.error(f"Update failed: {e}")
            # Try to restore backup if exists
            backup_script = os.path.abspath(__file__) + '.backup'
            if os.path.exists(backup_script):
                logger.info("Restoring backup...")
                shutil.copy2(backup_script, os.path.abspath(__file__))

    async def run(self):
        """Main run loop"""
        # Start background tasks
        heartbeat_task = asyncio.create_task(self.heartbeat_loop())
        status_task = asyncio.create_task(self.status_loop())
        moonraker_task = asyncio.create_task(self.moonraker_message_loop())
        update_task = asyncio.create_task(self.update_check_loop())
        
        try:
            while self.running:
                if await self.connect():
                    try:
                        async for message in self.websocket:
                            await self.handle_message(message)
                    except websockets.exceptions.ConnectionClosed as e:
                        logger.warning(f"Connection closed: {e}")
                    except Exception as e:
                        logger.error(f"Error in message loop: {e}")
                    
                    self.connected = False
                
                if self.running:
                    logger.info(f"Reconnecting in {self.reconnect_delay} seconds...")
                    await asyncio.sleep(self.reconnect_delay)
                    # Exponential backoff
                    self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)
                    
        finally:
            heartbeat_task.cancel()
            status_task.cancel()
            moonraker_task.cancel()
            update_task.cancel()
            try:
                await heartbeat_task
                await status_task
                await moonraker_task
                await update_task
            except asyncio.CancelledError:
                pass
    
    def stop(self):
        """Stop the client"""
        logger.info("Stopping fleet client...")
        self.running = False
        if self.websocket:
            asyncio.create_task(self.websocket.close())
        if self.moonraker_ws:
            asyncio.create_task(self.moonraker_ws.close())


def load_config(config_file: str) -> dict:
    """Load configuration from file"""
    if not os.path.exists(config_file):
        return None  # Return None to trigger pairing mode
    
    try:
        with open(config_file, 'r') as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid config file: {e}")
        sys.exit(1)
    except PermissionError:
        logger.error(f"Cannot read config file: {config_file}")
        logger.error("Check file permissions or run as root")
        sys.exit(1)
    
    # Validate required fields
    if not config.get("printer_id"):
        return None  # Return None to trigger pairing mode
    
    if not config.get("fleet_ws_url"):
        logger.error("Config file missing 'fleet_ws_url'")
        sys.exit(1)
    
    return config


async def pairing_mode(fleet_url: str, printer_name: str = None, moonraker_url: str = "http://127.0.0.1:7125"):
    """
    Device-style pairing mode: Generate a 6-digit code, display it, and wait for user to claim it.
    Once claimed, save the config and exit (systemd will restart us in normal mode).
    """
    import socket
    
    # Get printer name from Moonraker if not provided
    if not printer_name:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{moonraker_url}/printer/info", timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        info = await resp.json()
                        printer_name = info.get("result", {}).get("hostname", socket.gethostname())
                    else:
                        printer_name = socket.gethostname()
        except:
            printer_name = socket.gethostname()
    
    # Get local IP
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except:
        local_ip = "unknown"
    
    api_url = fleet_url.replace("wss://", "https://").replace("ws://", "http://")
    if api_url.endswith("/ws/printer"):
        api_url = api_url.replace("/ws/printer", "")
    
    logger.info("=" * 50)
    logger.info("PAIRING MODE")
    logger.info("=" * 50)
    logger.info(f"Printer: {printer_name}")
    logger.info(f"Local IP: {local_ip}")
    logger.info("")
    
    # Request a pairing code from the server
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{api_url}/api/pairing/code",
                json={
                    "printerName": printer_name,
                    "host": local_ip,
                    "port": "7125"
                },
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status != 201:
                    error = await resp.text()
                    logger.error(f"Failed to get pairing code: {error}")
                    sys.exit(1)
                
                data = await resp.json()
                pairing_code = data["code"]
                expires_in = data.get("expiresInMinutes", 10)
    except Exception as e:
        logger.error(f"Failed to connect to fleet server: {e}")
        sys.exit(1)
    
    # Display the code prominently
    logger.info("=" * 50)
    logger.info("")
    logger.info(f"    PAIRING CODE:  {pairing_code[:3]} {pairing_code[3:]}")
    logger.info("")
    logger.info(f"    Enter this code at {api_url}")
    logger.info(f"    Code expires in {expires_in} minutes")
    logger.info("")
    logger.info("=" * 50)
    
    # Also try to display via Moonraker console
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(
                f"{moonraker_url}/printer/gcode/script",
                json={"script": f"M117 PAIR: {pairing_code[:3]} {pairing_code[3:]}"}
            )
    except:
        pass  # Non-critical
    
    # Poll for pairing status
    poll_interval = 3  # seconds
    start_time = time.time()
    timeout = expires_in * 60  # Convert to seconds
    
    while time.time() - start_time < timeout:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{api_url}/api/pairing/status/{pairing_code}",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status != 200:
                        logger.warning("Failed to check pairing status")
                        await asyncio.sleep(poll_interval)
                        continue
                    
                    data = await resp.json()
                    status = data.get("status")
                    
                    if status == "paired":
                        printer_id = data.get("printerId")
                        ws_url = data.get("wsUrl")
                        fleet_url_final = data.get("fleetUrl", api_url)
                        
                        logger.info("")
                        logger.info("=" * 50)
                        logger.info("PAIRING SUCCESSFUL!")
                        logger.info("=" * 50)
                        logger.info(f"Printer ID: {printer_id}")
                        
                        # Save config
                        config = {
                            "printer_id": printer_id,
                            "name": printer_name,
                            "fleet_url": fleet_url_final,
                            "fleet_ws_url": ws_url,
                            "moonraker_url": moonraker_url,
                            "moonraker_ws_url": moonraker_url.replace("http://", "ws://") + "/websocket",
                            "registered_at": datetime.now().isoformat()
                        }
                        
                        config_dir = os.path.dirname(CONFIG_FILE)
                        os.makedirs(config_dir, exist_ok=True)
                        
                        with open(CONFIG_FILE, 'w') as f:
                            json.dump(config, f, indent=2)
                        os.chmod(CONFIG_FILE, 0o600)
                        
                        logger.info(f"Config saved to {CONFIG_FILE}")
                        logger.info("Restarting in normal mode...")
                        
                        # Clear LCD
                        try:
                            async with aiohttp.ClientSession() as session:
                                await session.post(
                                    f"{moonraker_url}/printer/gcode/script",
                                    json={"script": "M117 Fleet Connected!"}
                                )
                        except:
                            pass
                        
                        return True
                    
                    elif status == "expired":
                        logger.error("Pairing code expired")
                        return False
                    
                    # Still pending, continue polling
                    
        except Exception as e:
            logger.warning(f"Error polling status: {e}")
        
        await asyncio.sleep(poll_interval)
    
    logger.error("Pairing timeout - code expired")
    return False


def main():
    """Main entry point"""
    logger.info("Fleet Client starting...")
    logger.info(f"Version: {CLIENT_VERSION}")
    logger.info(f"Config file: {CONFIG_FILE}")
    
    # Check for --pair flag or missing config
    import argparse
    parser = argparse.ArgumentParser(description="Fleet Client")
    parser.add_argument("--pair", action="store_true", help="Force pairing mode")
    parser.add_argument("--fleet-url", default="https://fleet.modovolo.com", help="Fleet manager URL")
    parser.add_argument("--printer-name", help="Printer name (auto-detected if not provided)")
    parser.add_argument("--moonraker-url", default="http://127.0.0.1:7125", help="Local Moonraker URL")
    args = parser.parse_args()
    
    # Load config
    config = load_config(CONFIG_FILE)
    
    # Enter pairing mode if no config or --pair flag
    if config is None or args.pair:
        logger.info("No configuration found - entering pairing mode")
        fleet_ws_url = args.fleet_url.replace("https://", "wss://").replace("http://", "ws://") + "/ws/printer"
        success = asyncio.run(pairing_mode(fleet_ws_url, args.printer_name, args.moonraker_url))
        if success:
            # Reload config after pairing
            config = load_config(CONFIG_FILE)
            if config is None:
                logger.error("Config not found after pairing")
                sys.exit(1)
        else:
            sys.exit(1)
    
    logger.info(f"Printer ID: {config['printer_id']}")
    logger.info(f"Printer Name: {config.get('name', 'Unknown')}")
    logger.info(f"Fleet URL: {config['fleet_ws_url']}")
    logger.info(f"Moonraker URL: {config.get('moonraker_url', 'http://127.0.0.1:7125')}")
    
    # Create client
    client = FleetClient(config)
    
    # Setup signal handlers
    def handle_signal(signum, frame):
        logger.info(f"Received signal {signum}")
        client.stop()
    
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    
    # Run
    try:
        asyncio.run(client.run())
    except KeyboardInterrupt:
        pass
    finally:
        logger.info("Fleet client stopped")


if __name__ == "__main__":
    main()
