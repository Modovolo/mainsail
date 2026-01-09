# Printer Fleet Kubernetes Deployment

This directory contains Kubernetes manifests for deploying Mainsail and Moonraker as a distributed printer fleet management system with WireGuard VPN connectivity.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      fleet namespace                             │   │
│  │                                                                  │   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │   │
│  │  │   Ingress    │───▶│ nginx-proxy  │───▶│   Mainsail   │       │   │
│  │  │  (TLS/SSL)   │    │  (LoadBal)   │    │  (Frontend)  │       │   │
│  │  └──────────────┘    └──────────────┘    └──────────────┘       │   │
│  │                             │                                    │   │
│  │                             ▼                                    │   │
│  │                      ┌──────────────┐    ┌──────────────┐       │   │
│  │                      │  Moonraker   │───▶│  Shared PVC  │       │   │
│  │                      │  (Backend)   │    │ (printer_data)│       │   │
│  │                      └──────────────┘    └──────────────┘       │   │
│  │                             ▲                                    │   │
│  │  ┌──────────────┐          │                                    │   │
│  │  │  WireGuard   │──────────┘                                    │   │
│  │  │  (DaemonSet) │                                               │   │
│  │  └──────────────┘                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│            ▲                                                            │
│            │ UDP 51820                                                  │
└────────────┼────────────────────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │  WireGuard VPN  │
    │   (Internet)    │
    └────────┬────────┘
             │
    ┌────────┴────────────────────────────────────────┐
    │                                                  │
┌───▼────┐  ┌────────┐  ┌────────┐       ┌────────┐  │
│Printer │  │Printer │  │Printer │  ...  │Printer │  │
│   01   │  │   02   │  │   03   │       │   N    │  │
│(Klipper│  │(Klipper│  │(Klipper│       │(Klipper│  │
└────────┘  └────────┘  └────────┘       └────────┘  │
                                                      │
    Distributed Printer Network (WireGuard Peers)     │
    ──────────────────────────────────────────────────┘
```

## Prerequisites

1. **Kubernetes Cluster** (1.25+)
2. **kubectl** configured for your cluster
3. **Ingress Controller** (nginx-ingress recommended)
4. **cert-manager** (for TLS certificates)
5. **Storage Class** with ReadWriteMany support (NFS, Longhorn, etc.)
6. **Node with WireGuard support** (kernel module)

## Quick Start

### 1. Build Moonraker Container

```bash
cd /path/to/moonraker
docker build -t fleet-moonraker:latest .

# Push to your registry
docker tag fleet-moonraker:latest ghcr.io/your-org/moonraker:latest
docker push ghcr.io/your-org/moonraker:latest
```

### 2. Configure WireGuard Keys

Generate server keys:
```bash
wg genkey | tee server-privatekey | wg pubkey > server-publickey
```

Update `wireguard.yaml` secret with your private key.

### 3. Label WireGuard Node

```bash
kubectl label node <node-name> fleet.io/wireguard=true
```

### 4. Update Configuration

Edit `configmaps.yaml`:
- Update Mainsail `config.json` with your domain
- Update Moonraker `moonraker.conf` for your network

Edit `ingress.yaml`:
- Replace `fleet.example.com` with your domain
- Update cert-manager issuer name if needed

### 5. Deploy

```bash
# Apply with kustomize
kubectl apply -k k8s/

# Or apply individually
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/storage.yaml
kubectl apply -f k8s/configmaps.yaml
kubectl apply -f k8s/deployments.yaml
kubectl apply -f k8s/services.yaml
kubectl apply -f k8s/wireguard.yaml
kubectl apply -f k8s/ingress.yaml
```

### 6. Verify Deployment

```bash
kubectl -n fleet get pods
kubectl -n fleet get svc
kubectl -n fleet get ingress
```

## Adding Printers

### 1. Generate Printer WireGuard Keys

On each printer:
```bash
wg genkey | tee printer-privatekey | wg pubkey > printer-publickey
```

### 2. Add Peer to Server

Update the `wireguard-keys` secret:
```bash
kubectl -n fleet edit secret wireguard-keys
```

Add the printer's public key to the `peers` field.

### 3. Configure Printer WireGuard

Create `/etc/wireguard/wg0.conf` on the printer:
```ini
[Interface]
Address = 10.10.0.X/24  # Unique IP for each printer
PrivateKey = <PRINTER_PRIVATE_KEY>
DNS = 8.8.8.8

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
Endpoint = <YOUR_CLUSTER_IP>:51820
AllowedIPs = 10.10.0.0/24
PersistentKeepalive = 25
```

### 4. Start WireGuard on Printer

```bash
sudo wg-quick up wg0
sudo systemctl enable wg-quick@wg0
```

## Network Ranges

| Network | Range | Purpose |
|---------|-------|---------|
| WireGuard VPN | 10.10.0.0/24 | Printer connections |
| Server | 10.10.0.1 | WireGuard gateway |
| Printers | 10.10.0.2-254 | Individual printers |

## Troubleshooting

### Check Pod Status
```bash
kubectl -n fleet get pods -o wide
kubectl -n fleet describe pod <pod-name>
kubectl -n fleet logs <pod-name>
```

### Check WireGuard Status
```bash
kubectl -n fleet exec -it $(kubectl -n fleet get pod -l app=wireguard -o name) -- wg show
```

### Check Nginx Proxy
```bash
kubectl -n fleet logs -l app=nginx-proxy
```

### Test Connectivity
```bash
# From within cluster
kubectl -n fleet run test --rm -it --image=curlimages/curl -- curl http://moonraker:7125/server/info

# From printer (via WireGuard)
curl http://10.10.0.1:7125/server/info
```

## Scaling

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: mainsail-hpa
  namespace: fleet
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: mainsail
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Security Considerations

1. **WireGuard Keys**: Store in external secrets manager (Vault, AWS Secrets Manager)
2. **TLS**: Always use HTTPS in production
3. **Network Policies**: Restrict pod-to-pod communication
4. **RBAC**: Limit service account permissions
5. **Image Scanning**: Scan container images for vulnerabilities

## Files

| File | Description |
|------|-------------|
| `namespace.yaml` | Fleet namespace definition |
| `storage.yaml` | PVC for shared printer data |
| `configmaps.yaml` | Mainsail, Moonraker, Nginx configs |
| `deployments.yaml` | Pod deployments |
| `services.yaml` | Internal and external services |
| `ingress.yaml` | HTTPS ingress with TLS |
| `wireguard.yaml` | VPN gateway DaemonSet |
| `kustomization.yaml` | Kustomize overlay |
