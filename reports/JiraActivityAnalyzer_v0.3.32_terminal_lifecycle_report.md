# JiraActivityAnalyzer v0.3.32 Terminal Lifecycle Report

The lifecycle finalizer now emits `jaa-run-terminal-event-v1` through an idempotent append path. The idempotency key is `runId:terminalState:rootErrorCode`; a repeated finalize/flush/hydration call returns the same terminal evidence instead of appending another event.

Replay assertions passed:

- exactly one `run_terminal` event exists for a run;
- `analysis_started`, `primary_error`, and artifact rejection are not terminal events;
- `terminalAtUtc` is populated;
- lifecycle summary, run manifest, and event-log terminal state, idempotency key, and snapshot hash agree;
- Quality Gate rejection ends with `failed / AI_DECISION_QUALITY_GATE_BLOCKED / QUALITY_GATE`.

The supplied historical submission remains append-only and persisted while its formal artifact is rejected.
