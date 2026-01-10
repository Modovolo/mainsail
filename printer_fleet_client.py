#!/usr/bin/env python3
"""
Printer Fleet Client
Reverse WebSocket connection from printer to fleet management server
"""

import asyncio
import json
import logging
import time
import signal
import sys
import os
from datetime import datetime
import websockets
import aiohttp
import argparse

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class PrinterFleetClient:
    def __init__(self, fleet_url, printer_id, moonraker_url="http://127.0.0.1:7125"):
        self.fleet_url = fleet_url
        self.printer_id = printer_id
        self.moonraker_url = moonraker_url
        self.websocket = None
        self.running = True
        self.last_heartbeat = time.time()
        
    async def get_printer_status(self):
        """Get current printer status from Moonraker"""
        try:
            async with aiohttp.ClientSession() as session:
                # Get printer info
                async with session.get(f"{self.moonraker_url}/printer/info") as resp:
                    if resp.status == 200:
                        printer_info = await resp.json()
                    else:
                        printer_info = {"state": "error", "error": f"HTTP {resp.status}"}
                
                # Get printer objects
                async with session.get(f"{self.moonraker_url}/printer/objects/query?print_stats&toolhead&extruder&heater_bed") as resp:
                    if resp.status == 200:
                        objects_data = await resp.json()
                        printer_objects = objects_data.get("result", {}).get("status", {})
                    else:
                        printer_objects = {}
                
                return {
                    "timestamp": datetime.now().isoformat(),
                    "printer_info": printer_info,
                    "printer_objects": printer_objects,
                    "moonraker_connected": True
                }
                
        except Exception as e:
            logger.error(f"Failed to get printer status: {e}")
            return {
                "timestamp": datetime.now().isoformat(),
                "error": str(e),
                "moonraker_connected": False
            }
    
    async def send_heartbeat(self):
        """Send periodic heartbeat"""
        if self.websocket and not self.websocket.closed:
            try:
                await self.websocket.send(json.dumps({
                    "type": "heartbeat",
                    "printer_id": self.printer_id,
                    "timestamp": datetime.now().isoformat()
                }))
                self.last_heartbeat = time.time()
            except Exception as e:
                logger.error(f"Failed to send heartbeat: {e}")
    
    async def send_status_update(self):
        """Send status update to fleet server"""
        if self.websocket and not self.websocket.closed:
            try:
                status = await self.get_printer_status()
                await self.websocket.send(json.dumps({
                    "type": "status_update",
                    "printer_id": self.printer_id,
                    "data": status
                }))
                logger.debug("Sent status update")
            except Exception as e:
                logger.error(f"Failed to send status update: {e}")
    
    async def handle_fleet_message(self, message):
        """Handle messages from fleet server"""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            if message_type == "registered":
                logger.info(f"Successfully registered with fleet: {data.get('message')}")
            
            elif message_type == "heartbeat_ack":
                logger.debug("Heartbeat acknowledged")
            
            elif message_type == "command":
                # Handle commands from fleet server
                command = data.get("command")
                logger.info(f"Received command: {command}")
                await self.execute_command(command)
            
            elif message_type == "error":
                logger.error(f"Fleet server error: {data.get('message')}")
            
            else:
                logger.warning(f"Unknown message type: {message_type}")
                
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON from fleet server: {message}")
    
    async def execute_command(self, command):
        """Execute command on printer"""
        try:
            command_type = command.get("type")
            
            if command_type == "emergency_stop":
                # Send emergency stop to printer
                async with aiohttp.ClientSession() as session:
                    await session.post(f"{self.moonraker_url}/printer/emergency_stop")
                logger.info("Emergency stop executed")
            
            elif command_type == "pause_print":
                async with aiohttp.ClientSession() as session:
                    await session.post(f"{self.moonraker_url}/printer/print/pause")
                logger.info("Print paused")
            
            elif command_type == "resume_print":
                async with aiohttp.ClientSession() as session:
                    await session.post(f"{self.moonraker_url}/printer/print/resume")
                logger.info("Print resumed")
            
            elif command_type == "status_request":
                # Send immediate status update
                await self.send_status_update()
            
            else:
                logger.warning(f"Unknown command type: {command_type}")
                
        except Exception as e:
            logger.error(f"Failed to execute command: {e}")
    
    async def connect_to_fleet(self):
        """Establish WebSocket connection to fleet server"""
        try:
            logger.info(f"Connecting to fleet server: {self.fleet_url}")
            
            # Connect with extra headers for WebSocket upgrade
            extra_headers = {
                "Upgrade": "websocket",
                "Connection": "Upgrade"
            }
            
            self.websocket = await websockets.connect(
                self.fleet_url,
                extra_headers=extra_headers,
                ping_interval=30,
                ping_timeout=10
            )
            
            # Register with fleet server
            registration = {
                "type": "register",
                "printer_id": self.printer_id,
                "capabilities": ["status_reporting", "remote_control"],
                "version": "1.0.0",
                "registration_time": datetime.now().isoformat()
            }
            
            await self.websocket.send(json.dumps(registration))
            logger.info("Registration sent to fleet server")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to fleet server: {e}")
            return False
    
    async def heartbeat_task(self):
        """Background task for heartbeats"""
        while self.running:
            await self.send_heartbeat()
            await asyncio.sleep(30)  # Heartbeat every 30 seconds
    
    async def status_task(self):
        """Background task for status updates"""
        while self.running:
            await self.send_status_update()
            await asyncio.sleep(60)  # Status update every minute
    
    async def run(self):
        """Main client loop"""
        while self.running:
            try:
                if await self.connect_to_fleet():
                    logger.info("Connected to fleet server, starting background tasks")
                    
                    # Start background tasks
                    heartbeat_task = asyncio.create_task(self.heartbeat_task())
                    status_task = asyncio.create_task(self.status_task())
                    
                    # Listen for messages
                    try:
                        async for message in self.websocket:
                            await self.handle_fleet_message(message)
                    except websockets.exceptions.ConnectionClosed:
                        logger.warning("Connection to fleet server closed")
                    
                    # Cancel background tasks
                    heartbeat_task.cancel()
                    status_task.cancel()
                    
                    try:
                        await heartbeat_task
                        await status_task
                    except asyncio.CancelledError:
                        pass
                
                if self.running:
                    logger.info("Reconnecting in 30 seconds...")
                    await asyncio.sleep(30)
                    
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                if self.running:
                    await asyncio.sleep(30)
    
    def stop(self):
        """Stop the client"""
        self.running = False
        if self.websocket:
            asyncio.create_task(self.websocket.close())

def signal_handler(signum, frame, client):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}, shutting down...")
    client.stop()

async def main():
    parser = argparse.ArgumentParser(description='Printer Fleet Client')
    parser.add_argument('--fleet-url', 
                       default='wss://fleet.modovolo.com/ws/printer',
                       help='Fleet server WebSocket URL')
    parser.add_argument('--printer-id',
                       required=True,
                       help='Unique printer identifier')
    parser.add_argument('--moonraker-url',
                       default='http://127.0.0.1:7125',
                       help='Moonraker API URL')
    
    args = parser.parse_args()
    
    # Create client
    client = PrinterFleetClient(
        fleet_url=args.fleet_url,
        printer_id=args.printer_id,
        moonraker_url=args.moonraker_url
    )
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, lambda s, f: signal_handler(s, f, client))
    signal.signal(signal.SIGTERM, lambda s, f: signal_handler(s, f, client))
    
    # Run client
    try:
        await client.run()
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
    finally:
        client.stop()
        logger.info("Client stopped")

if __name__ == "__main__":
    asyncio.run(main())