# Printer Fleet Client Installation Guide

## Prerequisites
- Raspberry Pi or Linux system running Klipper + Moonraker
- Python 3.7+ installed
- Internet connectivity

## Installation Steps

### 1. Install Required Python Packages
```bash
# Update system
sudo apt update

# Install Python dependencies
pip3 install websockets aiohttp argparse
```

### 2. Download Fleet Client Script
```bash
# Download the script
wget https://raw.githubusercontent.com/[your-repo]/printer_fleet_client.py

# Make executable
chmod +x printer_fleet_client.py
```

### 3. Configure Client
```bash
# Test connection (replace PRINTER_ID with unique identifier)
python3 printer_fleet_client.py --printer-id "workshop-printer-01"
```

### 4. Create Systemd Service (Optional - for auto-start)
```bash
# Create service file
sudo nano /etc/systemd/system/fleet-client.service
```

**Service file content:**
```ini
[Unit]
Description=Printer Fleet Client
After=network.target moonraker.service
Wants=moonraker.service

[Service]
Type=simple
ExecStart=/usr/bin/python3 /home/pi/printer_fleet_client.py --printer-id "UNIQUE_PRINTER_ID"
WorkingDirectory=/home/pi
Restart=always
RestartSec=30
User=pi
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

**Enable service:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable fleet-client
sudo systemctl start fleet-client
```

### 5. Monitor Connection
```bash
# Check service status
sudo systemctl status fleet-client

# View logs
sudo journalctl -u fleet-client -f
```

## Configuration Options

### Command Line Arguments
- `--fleet-url`: Fleet server WebSocket URL (default: `wss://fleet.modovolo.com/ws/printer`)
- `--printer-id`: Unique printer identifier (required)
- `--moonraker-url`: Local Moonraker URL (default: `http://127.0.0.1:7125`)

### Example Usage
```bash
# Basic usage
python3 printer_fleet_client.py --printer-id "lab-printer-02"

# Custom Moonraker port
python3 printer_fleet_client.py \
    --printer-id "workshop-ender3" \
    --moonraker-url "http://127.0.0.1:7126"

# Custom fleet server
python3 printer_fleet_client.py \
    --printer-id "remote-printer-01" \
    --fleet-url "wss://custom-fleet.example.com/ws/printer"
```

## What the Client Does

### Automatic Status Reporting
- **Heartbeat**: Every 30 seconds
- **Status Updates**: Every 60 seconds
- **Real-time Commands**: Responds immediately

### Reported Information
- Printer state (idle, printing, paused, error)
- Temperature readings (hotend, bed)
- Print progress and remaining time
- Current file being printed
- Connection health

### Remote Commands Supported
- Emergency stop
- Pause/resume print
- Status request
- Future: Start prints, upload files

## Troubleshooting

### Connection Issues
```bash
# Test Moonraker connectivity
curl http://127.0.0.1:7125/printer/info

# Test fleet server connectivity
ping fleet.modovolo.com

# Check firewall
sudo ufw status
```

### Service Issues
```bash
# Restart service
sudo systemctl restart fleet-client

# Check service logs
sudo journalctl -u fleet-client --no-pager -l
```

### Manual Testing
```bash
# Run in foreground with debug output
python3 printer_fleet_client.py --printer-id "test-printer" -v
```

## Security Notes

- Client only makes **outbound** connections (no ports opened)
- Uses secure WebSocket (WSS) over HTTPS
- No VPN or port forwarding required
- Fleet server cannot directly access printer - only via WebSocket commands

## Fleet Dashboard Access

Once connected, your printer will appear in the fleet management dashboard at:
**https://fleet.modovolo.com**

You'll see:
- Real-time printer status
- Live temperature monitoring  
- Print progress tracking
- Remote control capabilities