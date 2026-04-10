# Migration Guide DB

## 1. Goal

Port DB behavior to target app/environment without schema or data integrity drift.

## 2. Inputs

- Source schema: `<repo/path/migrations>`
- Target schema: `<repo/path/migrations>`
- Contract file: `FEATURE_CONTRACT_DB_V1.md`

## 3. Steps

1. Diff source and target schema objects.
2. Generate migration plan with dependency order.
3. Validate constraints and indexes.
4. Validate read/write code path compatibility.
5. Run migration tests from `TEST_MATRIX_DB.md`.
6. Execute staged rollout and monitor.
7. Capture parity checklist evidence.

## 4. Data Safety

- Backup and restore readiness: `<steps>`
- Rehearsal on production-like dataset: `<status>`
- Data quality checks before and after migration: `<checks>`

## 5. Rollout and Rollback

- Deployment phases: `<dev->staging->prod>`
- Rollback trigger conditions: `<conditions>`
- Rollback execution steps: `<steps>`
