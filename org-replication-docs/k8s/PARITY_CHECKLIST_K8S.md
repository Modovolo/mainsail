# Parity Checklist K8s

- [ ] Workload kinds/names and replica behavior match contract.
- [ ] Resource requests/limits and autoscaling match contract.
- [ ] Env vars, ConfigMaps, Secrets, and mounts match contract.
- [ ] Probes and startup behavior match contract.
- [ ] Services/Ingress/NetworkPolicy match contract.
- [ ] RBAC and security contexts match contract.
- [ ] Rollout/rollback strategy validated.
- [ ] Observability labels/metrics/alerts configured.
- [ ] K8s tests in `TEST_MATRIX_K8S.md` pass.
