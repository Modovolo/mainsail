# Migration Guide API

## 1. Goal

Replicate API behavior from source app to target app with no contract drift.

## 2. Inputs

- Source repo/path: `<repo/path>`
- Target repo/path: `<repo/path>`
- Contract file: `FEATURE_CONTRACT_API_V1.md`

## 3. Steps

1. Inventory source endpoints and map to target routes.
2. Implement schema validation and error mapping.
3. Add auth/role middleware parity.
4. Implement pagination/sort/filter semantics.
5. Add observability fields, metrics, and traces.
6. Add or update tests from `TEST_MATRIX_API.md`.
7. Run parity checklist and capture evidence.

## 4. Evidence Required

- Endpoint diff table with status.
- Test output links or logs.
- Example request/response captures.
- Performance and rate limit verification notes.

## 5. Rollout

- Feature flag: `<name>`
- Staged rollout plan: `<dev->staging->prod>`
- Rollback plan: `<steps>`
