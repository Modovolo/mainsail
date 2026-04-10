# Feature Contract K8s v1

Use this contract to replicate Kubernetes deployment/runtime behavior 1:1 across apps.

## 1. Scope

- Workloads: `<deployments/statefulsets/jobs/cronjobs>`
- Namespaces/environments: `<list>`
- Out of scope: `<list>`

## 2. Workload Contract

For each workload define:
- Kind/name/namespace
- Image repo/tag policy
- Replica policy and autoscaling settings
- Ports and protocols
- Resource requests/limits

## 3. Runtime Configuration Contract

- Required env vars and defaults
- ConfigMap and Secret keys
- Mount paths and volume claims
- Startup/readiness/liveness probe details

## 4. Network Contract

- Service type and ports
- Ingress routes, TLS requirements, and rewrite rules
- NetworkPolicy requirements

## 5. Security Contract

- Service account and RBAC roles/bindings
- Pod security context and container security context
- Image pull policy and registry access
- Secret handling and rotation rules

## 6. Release and Rollout Contract

- Strategy: `RollingUpdate|Recreate|Canary|BlueGreen`
- Max unavailable/surge
- Rollback criteria and commands
- Versioning and compatibility constraints

## 7. Observability Contract

- Required labels/annotations
- Metrics scrape config
- Required logs fields
- Alert rules and SLOs

## 8. Reference Implementation

- Source manifests/charts: `<repo/path>`
- Owner: `<team>`
- Last verified date: `<yyyy-mm-dd>`
