#!/usr/bin/env python3
"""
Fleet Registration Script
One-time registration of a printer with the fleet manager.
Run this once with your registration key, then start the fleet client service.

Usage:
    python3 fleet_register.py YOUR_REGISTRATION_KEY

This will:
1. Exchange the registration key for a permanent printer_id
2. Save the printer_id to /etc/fleet-client/config.json
3. You can then start the fleet-client service
"""

import argparse
import json
import os
import sys
import requests

# Default config paths
CONFIG_DIR = "/etc/fleet-client"
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
FLEET_API_URL = "https://fleet.modovolo.com"


def register_printer(registration_key: str, fleet_url: str = FLEET_API_URL) -> dict:
    """
    Exchange a registration key for a permanent printer_id.
    
    Args:
        registration_key: The one-time registration key from the web UI
        fleet_url: Base URL of the fleet manager
        
    Returns:
        dict with printer_id, name, and other registration details
    """
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
            print(f"Error: Invalid or expired registration key")
            print("Please generate a new key from the Fleet Dashboard")
            sys.exit(1)
        else:
            print(f"Error: Registration failed - {response.status_code}")
            try:
                error_data = response.json()
                print(f"  Details: {error_data.get('error', 'Unknown error')}")
            except:
                print(f"  Response: {response.text}")
            sys.exit(1)
            
    except requests.exceptions.ConnectionError:
        print(f"Error: Could not connect to {fleet_url}")
        print("Check your network connection and fleet URL")
        sys.exit(1)
    except requests.exceptions.Timeout:
        print("Error: Connection timed out")
        sys.exit(1)


def save_config(config: dict, config_file: str = CONFIG_FILE) -> None:
    """
    Save configuration to file.
    
    Args:
        config: Configuration dictionary
        config_file: Path to config file
    """
    config_dir = os.path.dirname(config_file)
    
    # Create config directory if it doesn't exist
    if not os.path.exists(config_dir):
        try:
            os.makedirs(config_dir, mode=0o755)
        except PermissionError:
            print(f"Error: Cannot create {config_dir}")
            print("Try running with sudo: sudo python3 fleet_register.py ...")
            sys.exit(1)
    
    # Write config file
    try:
        with open(config_file, 'w') as f:
            json.dump(config, f, indent=2)
        os.chmod(config_file, 0o600)  # Only root can read
        print(f"Configuration saved to {config_file}")
    except PermissionError:
        print(f"Error: Cannot write to {config_file}")
        print("Try running with sudo: sudo python3 fleet_register.py ...")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description='Register this printer with the Fleet Manager',
        epilog='Run this once with your registration key, then start the fleet-client service.'
    )
    parser.add_argument(
        'registration_key',
        help='The registration key from the Fleet Dashboard'
    )
    parser.add_argument(
        '--fleet-url',
        default=FLEET_API_URL,
        help=f'Fleet manager URL (default: {FLEET_API_URL})'
    )
    parser.add_argument(
        '--config-file',
        default=CONFIG_FILE,
        help=f'Config file path (default: {CONFIG_FILE})'
    )
    parser.add_argument(
        '--moonraker-url',
        default='http://127.0.0.1:7125',
        help='Local Moonraker URL (default: http://127.0.0.1:7125)'
    )
    
    args = parser.parse_args()
    
    print("=" * 50)
    print("Fleet Manager - Printer Registration")
    print("=" * 50)
    print()
    
    # Check if already registered
    if os.path.exists(args.config_file):
        try:
            with open(args.config_file, 'r') as f:
                existing_config = json.load(f)
            if existing_config.get('printer_id'):
                print(f"Warning: This printer is already registered!")
                print(f"  Printer ID: {existing_config.get('printer_id')}")
                print(f"  Name: {existing_config.get('name', 'Unknown')}")
                print()
                response = input("Do you want to re-register? This will replace the existing registration. (y/N): ")
                if response.lower() != 'y':
                    print("Registration cancelled.")
                    sys.exit(0)
        except (json.JSONDecodeError, PermissionError):
            pass  # Config file exists but is invalid, proceed with registration
    
    print(f"Registering with: {args.fleet_url}")
    print()
    
    # Register the printer
    result = register_printer(args.registration_key, args.fleet_url)
    
    print("Registration successful!")
    print(f"  Printer Name: {result.get('printer', {}).get('name', 'Unknown')}")
    print(f"  Printer ID: {result.get('printerId')}")
    print()
    
    # Build config
    config = {
        "printer_id": result.get("printerId"),
        "name": result.get("printer", {}).get("name"),
        "fleet_url": args.fleet_url,
        "fleet_ws_url": result.get("wsUrl", f"{args.fleet_url.replace('https://', 'wss://').replace('http://', 'ws://')}/ws/printer"),
        "moonraker_url": args.moonraker_url,
        "registered_at": result.get("printer", {}).get("createdAt"),
    }
    
    # Save config
    save_config(config, args.config_file)
    
    print()
    print("Next steps:")
    print("  1. Enable the fleet-client service:")
    print("     sudo systemctl enable fleet-client")
    print("  2. Start the fleet-client service:")
    print("     sudo systemctl start fleet-client")
    print("  3. Check the status:")
    print("     sudo systemctl status fleet-client")
    print()
    print("Your printer will now connect to the fleet manager automatically.")


if __name__ == "__main__":
    main()
