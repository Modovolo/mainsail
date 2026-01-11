#!/bin/bash
#
# Fleet Client Installer
# Run on each Raspberry Pi printer to install the fleet client
#
# Usage:
#   curl -sSL https://fleet.modovolo.com/install.sh | sudo bash
#   OR
#   wget -qO- https://fleet.modovolo.com/install.sh | sudo bash
#
# After installation, register with:
#   sudo fleet-register YOUR_REGISTRATION_KEY
#

set -e

INSTALL_DIR="/opt/fleet-client"
CONFIG_DIR="/etc/fleet-client"
VENV_DIR="$INSTALL_DIR/venv"
SERVICE_NAME="fleet-client"

echo "=============================================="
echo "Fleet Client Installer"
echo "=============================================="
echo

# Check for root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root (use sudo)"
    exit 1
fi

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "Installing Python 3..."
    apt-get update
    apt-get install -y python3 python3-pip python3-venv
fi

# Ensure python3-venv is installed
if ! python3 -m venv --help &> /dev/null; then
    echo "Installing python3-venv..."
    apt-get update
    apt-get install -y python3-venv python3-full
fi

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv "$VENV_DIR"

# Install dependencies in virtual environment
echo "Installing dependencies..."
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
"$VENV_DIR/bin/pip" install websockets aiohttp requests --quiet

echo "Dependencies installed successfully"

# Download client files
echo "Downloading fleet client..."
FLEET_URL="${FLEET_URL:-https://fleet.modovolo.com}"

# For now, we'll embed the files. In production, these would be downloaded.
# Create fleet_client.py
cat > "$INSTALL_DIR/fleet_client.py" << 'ENDOFCLIENT'
#!/usr/bin/env python3
"""
Fleet Client Service
Maintains a persistent WebSocket connection to the Fleet Manager.
"""

import asyncio
import json
import logging
import time
import signal
import sys
import os
from datetime import datetime
from typing import Optional
import websockets
import aiohttp

CONFIG_FILE = os.environ.get("FLEET_CONFIG_FILE", "/etc/fleet-client/config.json")
LOG_LEVEL = os.environ.get("FLEET_LOG_LEVEL", "INFO")

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class FleetClient:
    def __init__(self, config: dict):
        self.printer_id = config["printer_id"]
        self.printer_name = config.get("name", "Unknown")
        self.fleet_ws_url = config["fleet_ws_url"]
        self.moonraker_url = config.get("moonraker_url", "http://127.0.0.1:7125")
        self.websocket: Optional[websockets.WebSocketClientProtocol] = None
        self.running = True
        self.connected = False
        self.reconnect_delay = 5
        self.max_reconnect_delay = 300
        
    async def get_printer_status(self) -> dict:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.moonraker_url}/printer/info",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as resp:
                    printer_info = await resp.json() if resp.status == 200 else {}
                
                query = "print_stats&toolhead&extruder&heater_bed"
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
                    "extruder": printer_objects.get("extruder", {}),
                    "heater_bed": printer_objects.get("heater_bed", {}),
                    "moonraker_connected": True
                }
        except Exception as e:
            return {"moonraker_connected": False, "error": str(e)}
    
    async def send_heartbeat(self):
        if self.websocket and self.connected:
            try:
                await self.websocket.send(json.dumps({
                    "type": "heartbeat",
                    "printer_id": self.printer_id
                }))
            except Exception:
                self.connected = False
    
    async def send_status_update(self):
        if self.websocket and self.connected:
            try:
                status = await self.get_printer_status()
                await self.websocket.send(json.dumps({
                    "type": "status_update",
                    "printer_id": self.printer_id,
                    "data": status
                }))
            except Exception:
                self.connected = False
    
    async def handle_message(self, message: str):
        try:
            data = json.loads(message)
            msg_type = data.get("type")
            
            if msg_type == "registered":
                logger.info(f"Registered: {data.get('message')}")
                self.reconnect_delay = 5
            elif msg_type == "command":
                await self.execute_command(data.get("command", {}))
            elif msg_type == "error":
                logger.error(f"Server error: {data.get('message')}")
        except json.JSONDecodeError:
            pass
    
    async def execute_command(self, command: dict):
        cmd_type = command.get("type", command.get("action"))
        try:
            async with aiohttp.ClientSession() as session:
                if cmd_type == "emergency_stop":
                    await session.post(f"{self.moonraker_url}/printer/emergency_stop")
                elif cmd_type in ("pause", "pause_print"):
                    await session.post(f"{self.moonraker_url}/printer/print/pause")
                elif cmd_type in ("resume", "resume_print"):
                    await session.post(f"{self.moonraker_url}/printer/print/resume")
                elif cmd_type in ("cancel", "cancel_print"):
                    await session.post(f"{self.moonraker_url}/printer/print/cancel")
                elif cmd_type == "gcode":
                    gcode = command.get("gcode", "")
                    if gcode:
                        await session.post(f"{self.moonraker_url}/printer/gcode/script", json={"script": gcode})
                elif cmd_type == "status_request":
                    await self.send_status_update()
        except Exception as e:
            logger.error(f"Command error: {e}")
    
    async def connect(self) -> bool:
        try:
            self.websocket = await websockets.connect(
                self.fleet_ws_url, ping_interval=30, ping_timeout=10
            )
            await self.websocket.send(json.dumps({
                "type": "register",
                "printer_id": self.printer_id,
                "name": self.printer_name,
                "version": "2.0.0"
            }))
            self.connected = True
            logger.info("Connected to fleet server")
            return True
        except Exception as e:
            logger.error(f"Connection failed: {e}")
            return False
    
    async def heartbeat_loop(self):
        while self.running:
            if self.connected:
                await self.send_heartbeat()
            await asyncio.sleep(30)
    
    async def status_loop(self):
        while self.running:
            if self.connected:
                await self.send_status_update()
            await asyncio.sleep(60)
    
    async def run(self):
        heartbeat_task = asyncio.create_task(self.heartbeat_loop())
        status_task = asyncio.create_task(self.status_loop())
        
        try:
            while self.running:
                if await self.connect():
                    try:
                        async for message in self.websocket:
                            await self.handle_message(message)
                    except websockets.exceptions.ConnectionClosed:
                        pass
                    self.connected = False
                
                if self.running:
                    await asyncio.sleep(self.reconnect_delay)
                    self.reconnect_delay = min(self.reconnect_delay * 2, self.max_reconnect_delay)
        finally:
            heartbeat_task.cancel()
            status_task.cancel()
    
    def stop(self):
        self.running = False


def load_config(config_file: str) -> dict:
    if not os.path.exists(config_file):
        logger.error(f"Config not found: {config_file}")
        logger.error("Run: sudo fleet-register YOUR_KEY")
        sys.exit(1)
    
    with open(config_file, 'r') as f:
        config = json.load(f)
    
    if not config.get("printer_id") or not config.get("fleet_ws_url"):
        logger.error("Invalid config. Run: sudo fleet-register YOUR_KEY")
        sys.exit(1)
    
    return config


def main():
    logger.info("Fleet Client starting...")
    config = load_config(CONFIG_FILE)
    logger.info(f"Printer: {config.get('name')} ({config['printer_id'][:8]}...)")
    
    client = FleetClient(config)
    
    def handle_signal(signum, frame):
        client.stop()
    
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    
    try:
        asyncio.run(client.run())
    finally:
        logger.info("Stopped")


if __name__ == "__main__":
    main()
ENDOFCLIENT

chmod +x "$INSTALL_DIR/fleet_client.py"

# Create fleet_register.py
cat > "$INSTALL_DIR/fleet_register.py" << 'ENDOFREGISTER'
#!/usr/bin/env python3
"""Fleet Registration Script"""

import argparse
import json
import os
import sys
import requests

CONFIG_DIR = "/etc/fleet-client"
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
FLEET_API_URL = "https://fleet.modovolo.com"


def register_printer(registration_key: str, fleet_url: str = FLEET_API_URL) -> dict:
    url = f"{fleet_url}/api/printer-registration/register"
    
    try:
        response = requests.post(
            url,
            json={"registrationKey": registration_key},
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code == 201:
            return response.json()
        elif response.status_code == 401:
            print("Error: Invalid or expired registration key")
            sys.exit(1)
        else:
            print(f"Error: Registration failed - {response.status_code}")
            sys.exit(1)
            
    except requests.exceptions.ConnectionError:
        print(f"Error: Could not connect to {fleet_url}")
        sys.exit(1)


def save_config(config: dict, config_file: str = CONFIG_FILE) -> None:
    config_dir = os.path.dirname(config_file)
    os.makedirs(config_dir, mode=0o755, exist_ok=True)
    
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)
    os.chmod(config_file, 0o600)
    print(f"Config saved to {config_file}")


def main():
    parser = argparse.ArgumentParser(description='Register printer with Fleet Manager')
    parser.add_argument('registration_key', help='Registration key from Fleet Dashboard')
    parser.add_argument('--fleet-url', default=FLEET_API_URL, help='Fleet manager URL')
    parser.add_argument('--moonraker-url', default='http://127.0.0.1:7125', help='Local Moonraker URL')
    
    args = parser.parse_args()
    
    print("Fleet Manager - Printer Registration")
    print("=" * 40)
    
    # Check if already registered
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            existing = json.load(f)
        if existing.get('printer_id'):
            print(f"Already registered: {existing.get('name')}")
            response = input("Re-register? (y/N): ")
            if response.lower() != 'y':
                sys.exit(0)
    
    result = register_printer(args.registration_key, args.fleet_url)
    
    print(f"Registered: {result.get('printer', {}).get('name')}")
    
    config = {
        "printer_id": result.get("printerId"),
        "name": result.get("printer", {}).get("name"),
        "fleet_url": args.fleet_url,
        "fleet_ws_url": result.get("wsUrl"),
        "moonraker_url": args.moonraker_url,
    }
    
    save_config(config)
    
    print()
    print("Next steps:")
    print("  sudo systemctl enable fleet-client")
    print("  sudo systemctl start fleet-client")


if __name__ == "__main__":
    main()
ENDOFREGISTER

chmod +x "$INSTALL_DIR/fleet_register.py"

# Create wrapper scripts that use the venv
cat > /usr/local/bin/fleet-register << 'ENDOFWRAPPER'
#!/bin/bash
exec /opt/fleet-client/venv/bin/python /opt/fleet-client/fleet_register.py "$@"
ENDOFWRAPPER
chmod +x /usr/local/bin/fleet-register

cat > /usr/local/bin/fleet-client << 'ENDOFWRAPPER'
#!/bin/bash
exec /opt/fleet-client/venv/bin/python /opt/fleet-client/fleet_client.py "$@"
ENDOFWRAPPER
chmod +x /usr/local/bin/fleet-client

# Install systemd service
cat > /etc/systemd/system/fleet-client.service << 'ENDOFSERVICE'
[Unit]
Description=Fleet Manager Client
After=network-online.target moonraker.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/fleet-client
ExecStart=/opt/fleet-client/venv/bin/python /opt/fleet-client/fleet_client.py
Restart=always
RestartSec=10
Environment=FLEET_CONFIG_FILE=/etc/fleet-client/config.json
StandardOutput=journal
StandardError=journal
SyslogIdentifier=fleet-client

[Install]
WantedBy=multi-user.target
ENDOFSERVICE

# Reload systemd
systemctl daemon-reload

echo
echo "=============================================="
echo "Installation complete!"
echo "=============================================="
echo
echo "Next steps:"
echo "  1. Get a registration key from https://fleet.modovolo.com"
echo "  2. Register this printer:"
echo "     sudo fleet-register YOUR_REGISTRATION_KEY"
echo "  3. Start the service:"
echo "     sudo systemctl enable --now fleet-client"
echo
echo "Commands:"
echo "  fleet-register KEY  - Register this printer"
echo "  systemctl status fleet-client  - Check status"
echo "  journalctl -u fleet-client -f  - View logs"
echo
