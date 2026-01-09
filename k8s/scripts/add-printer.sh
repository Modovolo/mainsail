#!/bin/bash
# Script to add a new printer to the fleet
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

usage() {
    echo "Usage: $0 <printer-name>"
    echo ""
    echo "Generates WireGuard configuration for a new printer"
    echo "and outputs instructions for setup."
    echo ""
    echo "Example: $0 printer-01"
    exit 1
}

if [ -z "$1" ]; then
    usage
fi

PRINTER_NAME="$1"
OUTPUT_DIR="$SCRIPT_DIR/../.printer-configs/$PRINTER_NAME"

echo -e "${GREEN}=== Adding Printer: $PRINTER_NAME ===${NC}"

# Check for wireguard-tools
if ! command -v wg &> /dev/null; then
    echo -e "${RED}wireguard-tools not found. Please install wireguard-tools.${NC}"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Generate printer keys
echo -e "\n${YELLOW}Generating WireGuard keys for $PRINTER_NAME...${NC}"
wg genkey | tee "$OUTPUT_DIR/privatekey" | wg pubkey > "$OUTPUT_DIR/publickey"

PRINTER_PRIVATE_KEY=$(cat "$OUTPUT_DIR/privatekey")
PRINTER_PUBLIC_KEY=$(cat "$OUTPUT_DIR/publickey")

# Get next available IP
# This is a simple approach - in production, use a proper IPAM
EXISTING_PRINTERS=$(kubectl -n fleet get secret wireguard-keys -o jsonpath='{.data.peers}' 2>/dev/null | base64 -d | grep -v '^#' | grep -v '^$' | wc -l || echo "0")
NEXT_IP=$((EXISTING_PRINTERS + 2))  # Start from .2 (server is .1)

if [ "$NEXT_IP" -gt 254 ]; then
    echo -e "${RED}Error: Maximum number of printers reached${NC}"
    exit 1
fi

PRINTER_IP="10.10.0.$NEXT_IP"

echo -e "${GREEN}Printer IP: $PRINTER_IP${NC}"

# Get server public key
echo -e "\n${YELLOW}Fetching server public key...${NC}"
SERVER_PUBLIC_KEY=""
if [ -f "$SCRIPT_DIR/../.wireguard-keys/server-publickey" ]; then
    SERVER_PUBLIC_KEY=$(cat "$SCRIPT_DIR/../.wireguard-keys/server-publickey")
else
    echo -e "${YELLOW}Server public key not found locally.${NC}"
    echo "Please enter the server public key:"
    read -r SERVER_PUBLIC_KEY
fi

# Get server endpoint
echo -e "\n${YELLOW}Enter the server endpoint (e.g., fleet.example.com or IP):${NC}"
read -r SERVER_ENDPOINT

if [ -z "$SERVER_ENDPOINT" ]; then
    SERVER_ENDPOINT="YOUR_SERVER_IP"
fi

# Generate printer WireGuard config
cat > "$OUTPUT_DIR/wg0.conf" << EOF
# WireGuard Configuration for $PRINTER_NAME
# Generated: $(date)

[Interface]
Address = $PRINTER_IP/24
PrivateKey = $PRINTER_PRIVATE_KEY
# Optional: DNS server
# DNS = 8.8.8.8, 8.8.4.4

[Peer]
PublicKey = $SERVER_PUBLIC_KEY
Endpoint = $SERVER_ENDPOINT:51820
AllowedIPs = 10.10.0.0/24
PersistentKeepalive = 25
EOF

# Generate Moonraker config snippet for printer
cat > "$OUTPUT_DIR/moonraker-fleet.conf" << EOF
# Fleet Configuration for $PRINTER_NAME
# Add this to your moonraker.conf

[server]
host: 0.0.0.0
port: 7125

[authorization]
cors_domains:
    *
trusted_clients:
    10.10.0.0/24
    127.0.0.0/8
    ::1/128
EOF

# Generate update command for K8s secret
cat > "$OUTPUT_DIR/add-to-cluster.sh" << EOF
#!/bin/bash
# Run this to add the printer to the cluster

# Add peer to WireGuard secret
kubectl -n fleet patch secret wireguard-keys --type='json' -p='[
  {
    "op": "replace",
    "path": "/stringData/peers",
    "value": "$(kubectl -n fleet get secret wireguard-keys -o jsonpath='{.data.peers}' 2>/dev/null | base64 -d || echo "")
$PRINTER_NAME=$PRINTER_PUBLIC_KEY"
  }
]'

# Restart WireGuard to pick up new peer
kubectl -n fleet rollout restart daemonset wireguard

echo "Printer $PRINTER_NAME added to cluster"
EOF
chmod +x "$OUTPUT_DIR/add-to-cluster.sh"

# Output instructions
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Printer Configuration Generated!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${CYAN}Files created in: $OUTPUT_DIR${NC}"
echo "  - privatekey       : Printer's private key (keep secret!)"
echo "  - publickey        : Printer's public key"
echo "  - wg0.conf         : WireGuard config for the printer"
echo "  - moonraker-fleet.conf : Moonraker config additions"
echo "  - add-to-cluster.sh : Script to add printer to K8s"

echo -e "\n${YELLOW}=== PRINTER SETUP INSTRUCTIONS ===${NC}"
echo ""
echo "1. Copy wg0.conf to the printer:"
echo -e "   ${CYAN}scp $OUTPUT_DIR/wg0.conf pi@printer:/tmp/${NC}"
echo ""
echo "2. On the printer, install WireGuard and configure:"
echo -e "   ${CYAN}sudo apt update && sudo apt install -y wireguard${NC}"
echo -e "   ${CYAN}sudo mv /tmp/wg0.conf /etc/wireguard/${NC}"
echo -e "   ${CYAN}sudo chmod 600 /etc/wireguard/wg0.conf${NC}"
echo ""
echo "3. Start WireGuard on the printer:"
echo -e "   ${CYAN}sudo wg-quick up wg0${NC}"
echo -e "   ${CYAN}sudo systemctl enable wg-quick@wg0${NC}"
echo ""
echo "4. Add printer to cluster (run from this machine):"
echo -e "   ${CYAN}$OUTPUT_DIR/add-to-cluster.sh${NC}"
echo ""
echo "5. Verify connection from printer:"
echo -e "   ${CYAN}ping 10.10.0.1${NC}"
echo ""

echo -e "\n${YELLOW}=== PRINTER DETAILS ===${NC}"
echo "Name:       $PRINTER_NAME"
echo "IP Address: $PRINTER_IP"
echo "Public Key: $PRINTER_PUBLIC_KEY"
echo ""
