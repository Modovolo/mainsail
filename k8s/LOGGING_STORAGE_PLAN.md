# Fleet Logging Storage Plan (Deferred)

Date: 2026-05-19
Status: Deferred for now
Scope: Fleet manager, nginx-proxy, mainsail, moonraker, and bfp-print-monitor logs

## Why this document exists

Recent production behavior showed transient 502 responses that aligned with fleet-manager instability during memory pressure. This note captures the current state and a future logging storage design so work can resume quickly later.

## Current state

- Application logs are primarily consumed via kubectl logs (stdout/stderr).
- There is no dedicated centralized log storage stack currently deployed in k8s manifests.
- Existing PVCs are for application data, not centralized log retention:
  - fleet-shared-data: 50Gi
  - fleet-files-data: 20Gi
- fleet-manager memory limit is currently 1Gi.

## Incident note (2026-05-19)

- fleet-manager restarted with Exit Code 137 (OOMKilled).
- During the incident window, readiness/liveness probes failed and ingress served 502 for API calls.
- A telemetry memory mitigation was added in fleet-manager/routes/fleet_telemetry.py:
  - Bounded klippy log read size to 64 KiB.
  - Added Range request header and chunked bounded buffering.

## Observed log volume baseline

Sampled over 1 hour from current pods and extrapolated to GiB/day.

| App | Bytes/Hour | GiB/Day |
|---|---:|---:|
| fleet-manager | 1,248,861 | 0.027914 |
| nginx-proxy | 1,041 | 0.000023 |
| mainsail | 96,034 | 0.002147 |
| moonraker | 0 | 0.000000 |
| bfp-print-monitor | 35,040 | 0.000783 |
| Total | 1,380,976 | 0.030867 |

Important: This is a low-traffic snapshot. Capacity planning should include growth and incident multipliers.

## Storage options

## Option A: PV-only log storage (single cluster)

How:
- Use node-level collector (Fluent Bit or Vector) to write logs to a stateful in-cluster backend on block PVC only.

Pros:
- Simpler initial setup.
- Fast query on local hot data.
- No external object storage dependency.

Cons:
- Retention costs scale poorly at longer durations.
- Harder to keep long history.
- Tighter coupling to cluster lifecycle.

## Option B: Hot block storage plus cold object storage (recommended)

How:
- Collect logs with Fluent Bit or Vector.
- Store/query with Loki.
- Keep short hot retention on block PVC.
- Offload long retention to object storage with lifecycle policies.

Pros:
- Better cost profile for long retention.
- Better durability for forensic history.
- More scalable as printer count grows.

Cons:
- More moving parts.
- Requires object storage credentials and policy management.

## Recommended future target

- Collector: Fluent Bit DaemonSet.
- Backend: Loki.
- Retention model:
  - Hot retention: 14 to 30 days on block PVC.
  - Cold retention: 90 to 365 days on object storage.
- Access:
  - Grafana queries for operations and incident response.
- Controls:
  - Keep default logging at INFO in production.
  - Use DEBUG only for short troubleshooting windows.
  - Add redaction filters for secrets/tokens if needed.

## Sizing approach

Use:

Storage = RawGiBPerDay x RetentionDays x CompressionFactor x SafetyFactor

Where:
- CompressionFactor can be approximated as 0.5 for planning.
- SafetyFactor recommended at 1.3 minimum.

Planning multipliers:
- Normal growth multiplier: 10x current observed volume.
- Incident/debug multiplier: 40x current observed volume.

Practical starting allocations:
- Hot block storage: 50 to 100 GiB.
- Cold object retention: 200 GiB or more with lifecycle rules.

## Deferred implementation backlog

- [ ] Add logging stack manifests (Loki + Fluent Bit) under k8s.
- [ ] Add PVC for Loki hot storage with explicit storage class and retention notes.
- [ ] Add object storage configuration and credentials via Kubernetes Secret.
- [ ] Add per-namespace retention and stream labels.
- [ ] Add PII/token redaction filters at collector level.
- [ ] Add dashboards and basic alerts for:
  - 502 rate
  - OOMKilled events
  - fleet-manager readiness failures
- [ ] Add runbook section to k8s README for log triage and retention ops.

## Resume checklist

When this is resumed, do in this order:

1. Deploy collector and backend in staging.
2. Validate ingestion and query latency at expected load.
3. Validate retention rollover from hot to cold storage.
4. Run synthetic incident test and confirm forensic usability.
5. Roll to production with conservative retention, then increase.

## Notes for future troubleshooting

- If 502 appears with auth and telemetry endpoints together, first verify fleet-manager pod health and restarts.
- If OOM recurs, inspect endpoint-level memory behavior before increasing memory limits.
- Keep telemetry log tail reads bounded to avoid loading large files into memory.
