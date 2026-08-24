# v0.3.35 Authoritative Lifecycle Report

Implemented one run-scoped `HostControlLifecycleControllerV0335` shared by Bridge handlers and Host post-publish stages. Required control state and optional analysis telemetry are separate. The first successful segment enters `INPUT_READING`; finalize durably transitions to `INPUT_READY` and verifies its postcondition. Artifact persistence is the authoritative completion boundary and sets telemetry to `COMPLETED_BY_ARTIFACT`. Progress warnings remain observability-only. Terminalization is idempotent and emits one terminal event.

Production projections now expose `controlState`, `analysisTelemetry`, root error fields, controller snapshot, and transition log. Package, HTML, and SQLite stages advance the same controller rather than creating secondary authority.
