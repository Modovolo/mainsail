#!/bin/bash
# Build script for fleet manager

set -e

echo "Building fleet manager Docker image..."
docker build -t ghcr.io/modovolo/fleet-manager:latest ./fleet-manager/

echo "Image built successfully!"
echo "To deploy, update the deployment image to: ghcr.io/modovolo/fleet-manager:latest"
echo "Then run: kubectl apply -f k8s/fleet-manager.yaml"