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
# After installation, pairing mode will automatically start to display a 6-digit code.
# This script is safe to run multiple times (idempotent).
#

set -e

INSTALL_DIR="/opt/fleet-client"
CONFIG_DIR="/etc/fleet-client"
VENV_DIR="$INSTALL_DIR/venv"
SERVICE_NAME="fleet-client"
FLEET_URL="${FLEET_URL:-https://fleet.modovolo.com}"

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
else
    echo "Python 3 already installed"
fi

# Ensure python3-venv is installed
if ! python3 -m venv --help &> /dev/null; then
    echo "Installing python3-venv..."
    apt-get update
    apt-get install -y python3-venv python3-full
fi

# Create directories (mkdir -p is already idempotent)
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"

# Create or update virtual environment
if [ -d "$VENV_DIR" ] && [ -f "$VENV_DIR/bin/python" ]; then
    echo "Virtual environment already exists, skipping creation"
else
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Check if dependencies are installed, install if missing
DEPS_INSTALLED=true
for pkg in websockets aiohttp requests; do
    if ! "$VENV_DIR/bin/pip" show "$pkg" &> /dev/null; then
        DEPS_INSTALLED=false
        break
    fi
done

if [ "$DEPS_INSTALLED" = true ]; then
    echo "Dependencies already installed"
else
    echo "Installing dependencies..."
    "$VENV_DIR/bin/pip" install --upgrade pip --quiet
    "$VENV_DIR/bin/pip" install websockets aiohttp requests --quiet
    echo "Dependencies installed successfully"
fi

# Always download the latest fleet_client.py (allows updates)
echo "Downloading fleet client..."
if command -v curl &> /dev/null; then
    curl -sSL "$FLEET_URL/api/client/fleet_client.py" -o "$INSTALL_DIR/fleet_client.py"
elif command -v wget &> /dev/null; then
    wget -qO "$INSTALL_DIR/fleet_client.py" "$FLEET_URL/api/client/fleet_client.py"
else
    echo "Error: Neither curl nor wget found"
    exit 1
fi

chmod +x "$INSTALL_DIR/fleet_client.py"
echo "Fleet client downloaded successfully"

# Create fleet_register.py (for legacy key-based registration)
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

# Create fleet-pair command for easy re-pairing
cat > /usr/local/bin/fleet-pair << 'ENDOFWRAPPER'
#!/bin/bash
exec /opt/fleet-client/venv/bin/python /opt/fleet-client/fleet_client.py --pair "$@"
ENDOFWRAPPER
chmod +x /usr/local/bin/fleet-pair

# Create fleet-update command to update the client
cat > /usr/local/bin/fleet-update << 'ENDOFWRAPPER'
#!/bin/bash
set -e
FLEET_URL="${FLEET_URL:-https://fleet.modovolo.com}"
echo "Updating fleet client from $FLEET_URL..."
if command -v curl &> /dev/null; then
    sudo curl -sSL "$FLEET_URL/api/client/fleet_client.py" -o /opt/fleet-client/fleet_client.py
elif command -v wget &> /dev/null; then
    sudo wget -qO /opt/fleet-client/fleet_client.py "$FLEET_URL/api/client/fleet_client.py"
fi
sudo chmod +x /opt/fleet-client/fleet_client.py
echo "Fleet client updated. Restart service with: sudo systemctl restart fleet-client"
ENDOFWRAPPER
chmod +x /usr/local/bin/fleet-update

# Install systemd service (always update to ensure latest config)
SERVICE_FILE="/etc/systemd/system/fleet-client.service"
SERVICE_CHANGED=false

SERVICE_CONTENT='[Unit]
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
WantedBy=multi-user.target'

# Check if service file needs updating
if [ -f "$SERVICE_FILE" ]; then
    EXISTING_CONTENT=$(cat "$SERVICE_FILE")
    if [ "$EXISTING_CONTENT" != "$SERVICE_CONTENT" ]; then
        echo "Updating systemd service file..."
        echo "$SERVICE_CONTENT" > "$SERVICE_FILE"
        SERVICE_CHANGED=true
    else
        echo "Systemd service file already up to date"
    fi
else
    echo "Installing systemd service..."
    echo "$SERVICE_CONTENT" > "$SERVICE_FILE"
    SERVICE_CHANGED=true
fi

# Only reload systemd if service changed
if [ "$SERVICE_CHANGED" = true ]; then
    systemctl daemon-reload
fi

echo
echo "=============================================="
echo "Installation complete!"
echo "=============================================="
echo

# Check if already registered
if [ -f "/etc/fleet-client/config.json" ]; then
    echo "This printer is already registered."
    echo
    
    # Check if service is running and offer to restart it
    if systemctl is-active --quiet fleet-client; then
        echo "Fleet client service is running."
        echo "Fleet client has been updated. Restarting service..."
        systemctl restart fleet-client
        echo "Service restarted successfully."
    else
        echo "Fleet client service is not running."
        echo "Start it with: sudo systemctl start fleet-client"
    fi
    
    echo
    echo "Commands:"
    echo "  sudo systemctl status fleet-client - Check service status"
    echo "  sudo fleet-pair                    - Re-pair this printer"
    echo "  sudo fleet-update                  - Update fleet client"
    echo "  journalctl -u fleet-client -f      - View logs"
    echo
else
    echo "Starting pairing mode..."
    echo
    # Run pairing mode
    /opt/fleet-client/venv/bin/python /opt/fleet-client/fleet_client.py --pair
fi
