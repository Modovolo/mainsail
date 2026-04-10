# Test Matrix DB

## 1. Schema Tests

- `DB-001` Table/entity exists with expected columns.
- `DB-002` PK/FK/unique/check constraints enforced.
- `DB-003` Indexes exist and are used for key queries.

## 2. Invariant Tests

- `DB-010` Required invariants hold on valid writes.
- `DB-011` Invalid writes are rejected with clear errors.
- `DB-012` Cross-table integrity checks enforced.

## 3. Migration Tests

- `DB-020` Forward migration succeeds on realistic dataset.
- `DB-021` Backward migration/rollback path validated.
- `DB-022` Mixed-version compatibility during rollout window.

## 4. Concurrency Tests

- `DB-030` Conflict handling under concurrent updates.
- `DB-031` Deadlock retry behavior follows policy.
- `DB-032` Idempotent write semantics under retries.

## 5. Performance Tests

- `DB-040` Critical query latency within SLO.
- `DB-041` Write throughput meets target.
- `DB-042` Query plans avoid full scans for hot paths.

## 6. Security Tests

- `DB-050` PII masking/redaction behavior in outputs/logs.
- `DB-051` Access controls restrict unauthorized reads/writes.
- `DB-052` Encryption settings validated where required.
