#!/bin/bash
# Build and deploy script for fleet.modovolo.com
# Builds containers, pushes to Docker Hub, and applies k8s manifests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="$SCRIPT_DIR/k8s"
MOONRAKER_DIR="$(dirname "$SCRIPT_DIR")/moonraker"
BFP_MONITOR_DIR="$(dirname "$SCRIPT_DIR")/bfp-print-monitor"

# Registry
REGISTRY="jmarji"

# Default tag
TAG="${1:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Fleet Deployment Script ===${NC}"
echo -e "Tag: ${YELLOW}$TAG${NC}"
echo ""

# Parse arguments
BUILD_FLEET_MANAGER=false
BUILD_MAINSAIL=false
BUILD_MOONRAKER=false
BUILD_BFP_MONITOR=false
APPLY_MANIFESTS=false
RESTART_PODS=false

usage() {
    echo "Usage: $0 [TAG] [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --fleet-manager    Build and push fleet-manager"
    echo "  --mainsail         Build and push mainsail"
    echo "  --moonraker        Build and push moonraker"
    echo "  --monitor          Build and push bfp-print-monitor web API"
    echo "  --all              Build and push all containers"
    echo "  --apply            Apply k8s manifests"
    echo "  --restart          Restart deployments to pull new images"
    echo "  --deploy           Build all, apply manifests, and restart"
    echo ""
    echo "Examples:"
    echo "  $0 v0.0.8 --fleet-manager --apply --restart"
    echo "  $0 v0.0.8 --deploy"
    echo "  $0 latest --all --restart"
}

# If no options provided, show usage
if [ $# -eq 0 ]; then
    usage
    exit 0
fi

# Parse options (skip first arg if it looks like a tag)
ARGS=("$@")
if [[ ! "$1" =~ ^-- ]]; then
    ARGS=("${@:2}")
fi

for arg in "${ARGS[@]}"; do
    case $arg in
        --fleet-manager)
            BUILD_FLEET_MANAGER=true
            ;;
        --mainsail)
            BUILD_MAINSAIL=true
            ;;
        --moonraker)
            BUILD_MOONRAKER=true
            ;;
        --monitor)
            BUILD_BFP_MONITOR=true
            ;;
        --all)
            BUILD_FLEET_MANAGER=true
            BUILD_MAINSAIL=true
            BUILD_MOONRAKER=true
            BUILD_BFP_MONITOR=true
            ;;
        --apply)
            APPLY_MANIFESTS=true
            ;;
        --restart)
            RESTART_PODS=true
            ;;
        --deploy)
            BUILD_FLEET_MANAGER=true
            BUILD_MAINSAIL=true
            BUILD_MOONRAKER=true
            BUILD_BFP_MONITOR=true
            APPLY_MANIFESTS=true
            RESTART_PODS=true
            ;;
        --help|-h)
            usage
            exit 0
            ;;
    esac
done

# Build fleet-manager
if [ "$BUILD_FLEET_MANAGER" = true ]; then
    echo -e "${YELLOW}Building fleet-manager...${NC}"
    docker build -t $REGISTRY/fleet-manager:$TAG ./fleet-manager/
    echo -e "${YELLOW}Pushing fleet-manager...${NC}"
    docker push $REGISTRY/fleet-manager:$TAG
    echo -e "${GREEN}fleet-manager:$TAG pushed${NC}"
fi

# Build mainsail
if [ "$BUILD_MAINSAIL" = true ]; then
    echo -e "${YELLOW}Building mainsail...${NC}"
    docker build -t $REGISTRY/mainsail:$TAG .
    echo -e "${YELLOW}Pushing mainsail...${NC}"
    docker push $REGISTRY/mainsail:$TAG
    echo -e "${GREEN}mainsail:$TAG pushed${NC}"
fi

# Build moonraker
if [ "$BUILD_MOONRAKER" = true ]; then
    if [ -d "$MOONRAKER_DIR" ]; then
        echo -e "${YELLOW}Building moonraker...${NC}"
        docker build -t $REGISTRY/moonraker:$TAG "$MOONRAKER_DIR"
        echo -e "${YELLOW}Pushing moonraker...${NC}"
        docker push $REGISTRY/moonraker:$TAG
        echo -e "${GREEN}moonraker:$TAG pushed${NC}"
    else
        echo -e "${RED}Moonraker directory not found at $MOONRAKER_DIR${NC}"
    fi
fi

# Build bfp print monitor web API
if [ "$BUILD_BFP_MONITOR" = true ]; then
    if [ -d "$BFP_MONITOR_DIR" ]; then
        echo -e "${YELLOW}Building bfp-print-monitor-web...${NC}"
        docker build -t $REGISTRY/bfp-print-monitor-web:$TAG -f "$BFP_MONITOR_DIR/docker/Dockerfile.web" "$BFP_MONITOR_DIR"
        echo -e "${YELLOW}Pushing bfp-print-monitor-web...${NC}"
        docker push $REGISTRY/bfp-print-monitor-web:$TAG
        echo -e "${GREEN}bfp-print-monitor-web:$TAG pushed${NC}"
    else
        echo -e "${RED}bfp-print-monitor directory not found at $BFP_MONITOR_DIR${NC}"
    fi
fi

# Update image tags in manifests
update_manifests() {
    echo -e "${YELLOW}Updating image tags in manifests to $TAG...${NC}"
    
    # Update fleet-manager.yaml
    sed -i "s|image: $REGISTRY/fleet-manager:.*|image: $REGISTRY/fleet-manager:$TAG|g" "$K8S_DIR/fleet-manager.yaml"
    
    # Update deployments.yaml (mainsail and moonraker)
    sed -i "s|image: $REGISTRY/mainsail:.*|image: $REGISTRY/mainsail:$TAG|g" "$K8S_DIR/deployments.yaml"
    sed -i "s|image: $REGISTRY/moonraker:.*|image: $REGISTRY/moonraker:$TAG|g" "$K8S_DIR/deployments.yaml"
    sed -i "s|image: $REGISTRY/bfp-print-monitor-web:.*|image: $REGISTRY/bfp-print-monitor-web:$TAG|g" "$K8S_DIR/deployments.yaml"
    
    echo -e "${GREEN}Manifests updated${NC}"
}

# Apply k8s manifests
if [ "$APPLY_MANIFESTS" = true ]; then
    update_manifests
    
    echo -e "${YELLOW}Applying k8s manifests...${NC}"
    kubectl apply -f "$K8S_DIR/namespace.yaml"
    kubectl apply -f "$K8S_DIR/storage.yaml"
    if [ -f "$K8S_DIR/secrets.yaml" ]; then
        kubectl apply -f "$K8S_DIR/secrets.yaml"
    else
        echo -e "${YELLOW}Skipping secrets.yaml (file not present; using existing cluster secrets)${NC}"
    fi
    kubectl apply -f "$K8S_DIR/configmaps.yaml"
    kubectl apply -f "$K8S_DIR/postgresql.yaml"
    kubectl apply -f "$K8S_DIR/fleet-manager.yaml"
    kubectl apply -f "$K8S_DIR/deployments.yaml"
    kubectl apply -f "$K8S_DIR/services.yaml"
    kubectl apply -f "$K8S_DIR/ingress.yaml"
    echo -e "${GREEN}Manifests applied${NC}"
fi

# Restart deployments to pull new images
if [ "$RESTART_PODS" = true ]; then
    echo -e "${YELLOW}Restarting deployments to pull new images...${NC}"
    
    if [ "$BUILD_FLEET_MANAGER" = true ] || [ "$APPLY_MANIFESTS" = true ]; then
        kubectl rollout restart deployment/fleet-manager -n fleet
    fi
    
    if [ "$BUILD_MAINSAIL" = true ] || [ "$APPLY_MANIFESTS" = true ]; then
        kubectl rollout restart deployment/mainsail -n fleet
    fi
    
    if [ "$BUILD_MOONRAKER" = true ] || [ "$APPLY_MANIFESTS" = true ]; then
        kubectl rollout restart deployment/moonraker -n fleet
    fi

    if [ "$BUILD_BFP_MONITOR" = true ] || [ "$APPLY_MANIFESTS" = true ]; then
        kubectl rollout restart deployment/bfp-print-monitor -n fleet
    fi
    
    echo -e "${YELLOW}Waiting for rollouts...${NC}"
    kubectl rollout status deployment/fleet-manager -n fleet --timeout=120s || true
    kubectl rollout status deployment/mainsail -n fleet --timeout=120s || true
    kubectl rollout status deployment/moonraker -n fleet --timeout=120s || true
    kubectl rollout status deployment/bfp-print-monitor -n fleet --timeout=120s || true
    
    echo -e "${GREEN}Deployments restarted${NC}"
fi

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo -e "Finished at: ${YELLOW}$(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
echo ""
echo "Current pod status:"
kubectl get pods -n fleet