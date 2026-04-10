# Migration Guide K8s

## 1. Goal

Replicate K8s deployment/runtime behavior from source environment to target with minimal risk.

## 2. Inputs

- Source manifests/chart: `<repo/path>`
- Target manifests/chart: `<repo/path>`
- Contract file: `FEATURE_CONTRACT_K8S_V1.md`

## 3. Steps

1. Diff source and target manifests/charts.
2. Align runtime config, secrets, and probes.
3. Align service, ingress, and network policy.
4. Align RBAC and security context settings.
5. Validate manifests and policy checks.
6. Run tests from `TEST_MATRIX_K8S.md`.
7. Stage rollout and monitor SLOs.

## 4. Rollout Plan

- Pre-flight checks: `<list>`
- Deployment sequence: `<order>`
- Verification checkpoints: `<checks>`

## 5. Rollback Plan

- Trigger conditions: `<conditions>`
- Rollback commands: `<commands>`
- Post-rollback validation: `<checks>`
