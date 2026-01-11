# Fleet Client for Printers

This is the client-side software that runs on each 3D printer (Raspberry Pi) to connect to the Fleet Manager.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Fleet Manager (Cloud)                    │
│                   fleet.modovolo.com                        │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Web UI     │  │  HTTP API   │  │  WebSocket Server   │  │
│  │  (Mainsail) │  │  (Auth)     │  │  (Printer Conns)    │  │
│  └─────────────┘  └─────────────┘  └──────────┬──────────┘  │
└───────────────────────────────────────────────┼─────────────┘
                                                │
                    Outbound WebSocket          │
                    Connections                 │
                                                │
        ┌───────────────────┬───────────────────┼───────────────────┐
        │                   │                   │                   │
        ▼                   ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Printer 1   │   │   Printer 2   │   │   Printer 3   │   │   Printer N   │
│ ┌───────────┐ │   │ ┌───────────┐ │   │ ┌───────────┐ │   │ ┌───────────┐ │
│ │Fleet      │ │   │ │Fleet      │ │   │ │Fleet      │ │   │ │Fleet      │ │
│ │Client     │ │   │ │Client     │ │   │ │Client     │ │   │ │Client     │ │
│ └─────┬─────┘ │   │ └─────┬─────┘ │   │ └─────┬─────┘ │   │ └─────┬─────┘ │
│       │       │   │       │       │   │       │       │   │       │       │
│ ┌─────▼─────┐ │   │ ┌─────▼─────┐ │   │ ┌─────▼─────┐ │   │ ┌─────▼─────┐ │
│ │ Moonraker │ │   │ │ Moonraker │ │   │ │ Moonraker │ │   │ │ Moonraker │ │
│ └───────────┘ │   │ └───────────┘ │   │ └───────────┘ │   │ └───────────┘ │
└───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘
```

## Quick Install

Run this on your Raspberry Pi:

```bash
curl -sSL https://fleet.modovolo.com/install.sh | sudo bash
```

## Manual Installation

1. **Install dependencies:**
   ```bash
   sudo apt install python3 python3-pip
   sudo pip3 install websockets aiohttp requests
   ```

2. **Download files:**
   ```bash
   sudo mkdir -p /opt/fleet-client /etc/fleet-client
   sudo wget -O /opt/fleet-client/fleet_client.py https://fleet.modovolo.com/fleet_client.py
   sudo wget -O /opt/fleet-client/fleet_register.py https://fleet.modovolo.com/fleet_register.py
   sudo chmod +x /opt/fleet-client/*.py
   ```

3. **Create symlinks:**
   ```bash
   sudo ln -sf /opt/fleet-client/fleet_register.py /usr/local/bin/fleet-register
   sudo ln -sf /opt/fleet-client/fleet_client.py /usr/local/bin/fleet-client
   ```

4. **Install systemd service:**
   ```bash
   sudo wget -O /etc/systemd/system/fleet-client.service https://fleet.modovolo.com/fleet-client.service
   sudo systemctl daemon-reload
   ```

## Registration

1. **Get a registration key** from the Fleet Dashboard at https://fleet.modovolo.com
   - Go to "Register Printer"
   - Enter a name for your printer
   - Click "Send Now" to receive the key via email

2. **Register the printer:**
   ```bash
   sudo fleet-register YOUR_REGISTRATION_KEY
   ```
   
   This exchanges the one-time registration key for a permanent printer ID and saves it to `/etc/fleet-client/config.json`.

3. **Start the service:**
   ```bash
   sudo systemctl enable --now fleet-client
   ```

## Managing the Service

```bash
# Check status
sudo systemctl status fleet-client

# View logs
journalctl -u fleet-client -f

# Restart
sudo systemctl restart fleet-client

# Stop
sudo systemctl stop fleet-client
```

## How It Works

1. **Registration (one-time):**
   - User generates a registration key from the web UI
   - Key is sent via email
   - `fleet-register` exchanges the key for a permanent `printer_id`
   - Credentials are saved to `/etc/fleet-client/config.json`

2. **Connection (ongoing):**
   - Fleet client reads `printer_id` from config file
   - Connects to Fleet Manager via WebSocket
   - Fleet Manager validates `printer_id` against database
   - Client sends status updates every 60 seconds
   - Client sends heartbeats every 30 seconds
   - Client executes commands from Fleet Manager

3. **Reconnection:**
   - If connection drops, client automatically reconnects
   - Exponential backoff: 5s → 10s → 20s → ... → 5min max

## Configuration

Config file: `/etc/fleet-client/config.json`

```json
{
  "printer_id": "abc123...",
  "name": "My Printer",
  "fleet_url": "https://fleet.modovolo.com",
  "fleet_ws_url": "wss://fleet.modovolo.com/ws/printer",
  "moonraker_url": "http://127.0.0.1:7125"
}
```

## Environment Variables

- `FLEET_CONFIG_FILE` - Config file path (default: `/etc/fleet-client/config.json`)
- `FLEET_LOG_LEVEL` - Log level: DEBUG, INFO, WARNING, ERROR (default: INFO)

## Security

- The `printer_id` is a permanent credential - keep it secure
- Config file permissions are set to 600 (root only)
- Registration keys expire after 24 hours if unused
- All connections use TLS (wss://)

## Files

| File | Description |
|------|-------------|
| `/opt/fleet-client/fleet_client.py` | Main client service |
| `/opt/fleet-client/fleet_register.py` | Registration script |
| `/etc/fleet-client/config.json` | Configuration (printer_id, etc.) |
| `/etc/systemd/system/fleet-client.service` | Systemd service |
| `/usr/local/bin/fleet-register` | Symlink to registration script |
| `/usr/local/bin/fleet-client` | Symlink to client script |
