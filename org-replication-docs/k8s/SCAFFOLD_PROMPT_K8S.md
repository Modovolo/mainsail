# Scaffold Prompt K8s

Use this prompt with an LLM to implement K8s parity.

## Prompt Template

```text
Implement Kubernetes manifests/configuration in <target repo/path> to match <source repo/path> behavior exactly.

Constraints:
- Follow FEATURE_CONTRACT_K8S_V1.md exactly.
- Preserve runtime env, probes, scaling, and rollout semantics.
- Preserve ingress/service/network policy behavior.
- Preserve RBAC and security context requirements.
- Add validation and tests from TEST_MATRIX_K8S.md.

Deliverables:
1. Manifest/chart changes with file list.
2. Validation and policy config updates.
3. Test/evidence updates.
4. Migration notes in MIGRATION_GUIDE_K8S.md.
5. Confirmation checklist against PARITY_CHECKLIST_K8S.md.

Non-goals:
- No unrelated platform refactors.
- No contract changes without version bump.
```
