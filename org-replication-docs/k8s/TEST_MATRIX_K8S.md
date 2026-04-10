# Test Matrix K8s

## 1. Manifest Validation

- `K8S-001` Schema validation passes (kubeval/kubeconform).
- `K8S-002` Policy validation passes (OPA/Kyverno rules).
- `K8S-003` Required labels/annotations present.

## 2. Runtime Health Tests

- `K8S-010` Pod starts with required config and secrets.
- `K8S-011` Readiness/liveness/startup probes behave as expected.
- `K8S-012` Restart policy and crash recovery behavior validated.

## 3. Networking Tests

- `K8S-020` Service routing and port mappings correct.
- `K8S-021` Ingress routing and TLS behavior correct.
- `K8S-022` NetworkPolicy allows/blocks expected traffic.

## 4. Security Tests

- `K8S-030` RBAC permissions least privilege and functional.
- `K8S-031` Pod/container security context enforced.
- `K8S-032` Secret references resolve and do not leak in logs.

## 5. Scalability and Rollout Tests

- `K8S-040` HPA scaling behavior meets expectations.
- `K8S-041` Rolling update disruption stays within thresholds.
- `K8S-042` Rollback succeeds and restores service.

## 6. Observability Tests

- `K8S-050` Metrics scrape and dashboards receive data.
- `K8S-051` Logs include required correlation fields.
- `K8S-052` Alerts fire and resolve correctly.
