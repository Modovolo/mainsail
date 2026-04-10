# Feature Contract DB v1

Use this contract to replicate database behavior 1:1 across apps.

## 1. Scope

- Domain: `<domain>`
- In scope tables/entities: `<list>`
- Out of scope: `<list>`

## 2. Schema Contract

For each table/entity define:
- Name and ownership: `<schema.table>`
- Columns: `<name, type, nullable, default>`
- Constraints: `<pk, fk, unique, check>`
- Indexes: `<name, columns, unique>`

## 3. Data Invariants

- Required invariants: `<rules>`
- Cross-table integrity rules: `<rules>`
- Soft-delete and retention rules: `<rules>`

## 4. Transaction and Concurrency Rules

- Isolation requirement: `<level>`
- Locking strategy: `<optimistic/pessimistic>`
- Retry policy on conflicts/deadlocks: `<rules>`

## 5. Migration Contract

- Migration naming convention: `<rules>`
- Forward and rollback requirements: `<rules>`
- Zero-downtime requirements: `<rules>`

## 6. Read/Write Contract

- Canonical read paths: `<queries/repositories>`
- Canonical write paths: `<commands/services>`
- Idempotency keys for writes: `<rules>`

## 7. Performance SLOs

- Query latency targets: `<p50/p95/p99>`
- Throughput targets: `<rps/tps>`
- Cardinality expectations: `<rows/table growth>`

## 8. Security and Compliance

- PII columns and masking rules: `<rules>`
- Encryption-at-rest/in-transit requirements: `<rules>`
- Access controls and least privilege roles: `<rules>`

## 9. Reference Implementation

- Source app: `<repo/path>`
- Owner: `<team>`
- Last verified date: `<yyyy-mm-dd>`
