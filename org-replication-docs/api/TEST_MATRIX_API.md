# Test Matrix API

## 1. Contract Tests

- `API-001` Required endpoint exists.
- `API-002` Happy-path request returns expected status and schema.
- `API-003` Invalid payload returns expected `4xx` and error code.
- `API-004` Missing auth returns expected `401`.
- `API-005` Insufficient role returns expected `403`.

## 2. Behavior Tests

- `API-010` Pagination default and max page size enforced.
- `API-011` Sorting behaves as specified.
- `API-012` Filter operators behave as specified.
- `API-013` Idempotent endpoint behavior on retry.

## 3. Compatibility Tests

- `API-020` Existing client payload still accepted.
- `API-021` Old client response parsing still works.
- `API-022` Deprecated field path returns warning if applicable.

## 4. Resilience Tests

- `API-030` Upstream dependency timeout handling.
- `API-031` Partial failure behavior matches contract.
- `API-032` Rate limit enforcement and error payload.

## 5. Observability Tests

- `API-040` Required log fields emitted.
- `API-041` Metrics emitted with required labels.
- `API-042` Traces include required attributes.

## 6. Security Tests

- `API-050` PII redaction in logs.
- `API-051` Auth token not leaked in logs/responses.
- `API-052` Input validation blocks malformed/unsafe payloads.
