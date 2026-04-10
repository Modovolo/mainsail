# Feature Contract API v1

Use this contract to define API behavior that must replicate 1:1 across apps.

## 1. Scope

- Domain: `<domain>`
- In scope endpoints: `<list>`
- Out of scope: `<list>`

## 2. Endpoint Contract

For each endpoint, define:
- Method and path: `GET|POST|PUT|PATCH|DELETE /api/...`
- Auth required: `yes|no`
- Roles allowed: `<roles>`
- Idempotency: `yes|no`

Endpoint template:

```text
Endpoint: <METHOD> <PATH>
Purpose: <what it does>
Headers: <required headers>
Query params: <name:type:required:validation>
Request body schema: <json schema or field table>
Success response: <status code + shape>
Error responses: <code + shape + rules>
Side effects: <db/event/cache changes>
```

## 3. Validation Rules

- Required fields: `<rules>`
- Field normalization: `<trim/case/default rules>`
- Business constraints: `<cross-field checks>`

## 4. Error Contract

- Canonical shape:

```json
{
  "error": "<message>",
  "code": "<stable_error_code>",
  "details": {}
}
```

- Status code mapping:
  - `400`: invalid input
  - `401`: unauthenticated
  - `403`: unauthorized
  - `404`: not found
  - `409`: conflict
  - `422`: semantic validation failure
  - `500`: unexpected server error

## 5. Pagination, Sorting, Filtering

- Pagination type: `cursor|offset`
- Defaults and max page size: `<values>`
- Sort fields and direction format: `<rules>`
- Filter operators: `<allowed operators>`

## 6. Compatibility Rules

- Backward compatibility policy: `<rules>`
- Additive vs breaking changes: `<definitions>`
- Deprecation window: `<time>`

## 7. Observability Requirements

- Required structured logs: `<fields>`
- Required metrics: `<name + labels>`
- Trace attributes: `<required attrs>`

## 8. Security Requirements

- Authn/authz mechanism: `<jwt/session/...>`
- PII handling: `<redaction rules>`
- Rate limits: `<limits per endpoint>`

## 9. Reference Implementation

- Source app: `<repo/path>`
- Owner: `<team>`
- Last verified date: `<yyyy-mm-dd>`
