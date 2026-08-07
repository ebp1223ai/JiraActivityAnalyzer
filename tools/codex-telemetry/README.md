# Codex Telemetry Runner

This tooling runs a phase workflow through `codex exec --json`, preserves raw evidence outside the repository, validates `turn.completed.usage`, and gates each resume on a Worker handoff.

## Safety

- Uses only `workspace-write`; `danger-full-access` is rejected by the parameter validator.
- Defaults to `<repo-parent>/JiraActivityAnalyzer-codex-telemetry/<run-id>`.
- Refuses output collisions and repository/package output roots.
- Never reads authentication files. A successful minimal `exec --json` is the authentication check.
- Raw JSONL and stderr are sensitive local evidence. Do not commit, package, upload, or paste them.
- No npm dependency or installation is required.

## Tests

```powershell
node --test tools/codex-telemetry/tests/parse-codex-jsonl.test.mjs
```

## Run

```powershell
./tools/codex-telemetry/Invoke-CodexTelemetryWorkflow.ps1 `
  -RepoPath . `
  -WorkflowPath ./tools/codex-telemetry/workflows/v0.3.1.workflow.json `
  -RunId v0.3.1-YYYYMMDD-HHMMSS `
  -Sandbox workspace-write
```

Use `-WritePreflightRecord` only for the dedicated two-turn, read-only self-test. It atomically writes a safe hashed record to the sibling telemetry root after JSONL usage and explicit resume gates pass.

## Evidence model

`telemetryObservedPaths`, `workerDeclaredInspectedPaths`, and `gitConfirmedModifiedPaths` are intentionally separate. Inspection coverage is declared by the Worker and corroborated where possible; it is not guaranteed to be a complete automatic read trace.
