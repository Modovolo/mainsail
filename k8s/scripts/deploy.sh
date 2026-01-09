#!/bin/bash
# Fleet Deployment Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$K8S_DIR")"
MOONRAKER_DIR="$(dirname "$ROOT_DIR")/moonraker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Fleet Deployment Script ===${NC}"

# Check prerequisites
check_prerequisites() {
    echo -e "\n${YELLOW}Checking prerequisites...${NC}"
    
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}kubectl not found. Please install kubectl.${NC}"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}docker not found. Please install docker.${NC}"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        echo -e "${RED}Cannot connect to Kubernetes cluster.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Prerequisites OK${NC}"
}

# Build container images
build_images() {
    echo -e "\n${YELLOW}Building container images...${NC}"
    
    # Build Moonraker
    echo "Building Moonraker..."
    docker build -t fleet-moonraker:latest "$MOONRAKER_DIR"
    
    # Build Mainsail (optional - can use official image)
    echo "Building Mainsail..."
    docker build -t fleet-mainsail:latest "$ROOT_DIR"
    
    echo -e "${GREEN}Images built successfully${NC}"
}

# Push images to registry
push_images() {
    local registry="${1:-ghcr.io/your-org}"
    
    echo -e "\n${YELLOW}Pushing images to $registry...${NC}"
    
    docker tag fleet-moonraker:latest "$registry/moonraker:latest"
    docker push "$registry/moonraker:latest"
    
    docker tag fleet-mainsail:latest "$registry/mainsail:latest"
    docker push "$registry/mainsail:latest"
    
    echo -e "${GREEN}Images pushed successfully${NC}"
}

# Generate WireGuard keys
generate_wireguard_keys() {
    echo -e "\n${YELLOW}Generating WireGuard keys...${NC}"
    
    if ! command -v wg &> /dev/null; then
        echo -e "${RED}wireguard-tools not found. Please install wireguard-tools.${NC}"
        echo "On Ubuntu/Debian: sudo apt install wireguard-tools"
        exit 1
    fi
    
    local keys_dir="$K8S_DIR/.wireguard-keys"
    mkdir -p "$keys_dir"
    
    wg genkey | tee "$keys_dir/server-privatekey" | wg pubkey > "$keys_dir/server-publickey"
    
    echo -e "${GREEN}Keys generated in $keys_dir${NC}"
    echo "Server Public Key: $(cat "$keys_dir/server-publickey")"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Update k8s/wireguard.yaml with the private key${NC}"
}

# Deploy to Kubernetes
deploy() {
    echo -e "\n${YELLOW}Deploying to Kubernetes...${NC}"
    
    # Apply namespace first
    kubectl apply -f "$K8S_DIR/namespace.yaml"
    
    # Apply storage
    kubectl apply -f "$K8S_DIR/storage.yaml"
    
    # Apply configs
    kubectl apply -f "$K8S_DIR/configmaps.yaml"
    
    # Apply deployments
    kubectl apply -f "$K8S_DIR/deployments.yaml"
    
    # Apply services
    kubectl apply -f "$K8S_DIR/services.yaml"
    
    # Apply ingress
    kubectl apply -f "$K8S_DIR/ingress.yaml"
    
    echo -e "${GREEN}Core deployment complete${NC}"
}

# Deploy WireGuard
deploy_wireguard() {
    echo -e "\n${YELLOW}Deploying WireGuard...${NC}"
    
    kubectl apply -f "$K8S_DIR/wireguard.yaml"
    
    echo -e "${GREEN}WireGuard deployed${NC}"
    echo -e "${YELLOW}Remember to label a node: kubectl label node <node-name> fleet.io/wireguard=true${NC}"
}

# Check deployment status
status() {
    echo -e "\n${YELLOW}Deployment Status:${NC}"
    
    echo -e "\n${GREEN}Pods:${NC}"
    kubectl -n fleet get pods -o wide
    
    echo -e "\n${GREEN}Services:${NC}"
    kubectl -n fleet get svc
    
    echo -e "\n${GREEN}Ingress:${NC}"
    kubectl -n fleet get ingress
    
    echo -e "\n${GREEN}PVC:${NC}"
    kubectl -n fleet get pvc
}

# Cleanup
cleanup() {
    echo -e "\n${YELLOW}Cleaning up Fleet deployment...${NC}"
    
    kubectl delete namespace fleet --ignore-not-found
    
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Show usage
usage() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  check       Check prerequisites"
    echo "  build       Build container images"
    echo "  push        Push images to registry"
    echo "  genkeys     Generate WireGuard keys"
    echo "  deploy      Deploy to Kubernetes"
    echo "  wireguard   Deploy WireGuard"
    echo "  status      Check deployment status"
    echo "  all         Build, push, and deploy"
    echo "  cleanup     Remove deployment"
    echo ""
}

# Main
case "${1:-}" in
    check)
        check_prerequisites
        ;;
    build)
        check_prerequisites
        build_images
        ;;
    push)
        push_images "${2:-}"
        ;;
    genkeys)
        generate_wireguard_keys
        ;;
    deploy)
        check_prerequisites
        deploy
        ;;
    wireguard)
        deploy_wireguard
        ;;
    status)
        status
        ;;
    all)
        check_prerequisites
        build_images
        push_images "${2:-}"
        deploy
        ;;
    cleanup)
        cleanup
        ;;
    *)
        usage
        exit 1
        ;;
esac
