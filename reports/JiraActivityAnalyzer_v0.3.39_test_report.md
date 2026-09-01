# Jira Activity Analyzer v0.3.39 Test Report

## Result

Automated result: **PASS**. Manual Windows GUI acceptance: **PENDING**.

| Command / validation | Result | Exit | Elapsed |
|---|---|---:|---:|
| final `npm.cmd run typecheck` | PASS | 0 | 9.896 s |
| final `npm.cmd run test:v0.3.39` | PASS | 0 | 6.861 s |
| standalone `npm.cmd run build` | PASS | 0 | 21.415 s |
| final `npm.cmd run dist` including fresh build | PASS | 0 | about 121 s |
| development current-contract app-only smoke | PASS | 0 | about 48.8 s |
| final win-unpacked app-only smoke | PASS | 0 | about 33.8 s |
| final Portable app-only smoke | PASS | 0 | about 37.5 s |
| `git diff --check` | PASS | 0 | under 1 s |

## Lifecycle And Import Coverage

- Missing database detection performs no write and returns `NOT_CREATED`.
- Atomic create validates the frozen DDL and leaves no target, temp, WAL or SHM
  file after injected failure.
- Existing database is never overwritten; outside-root paths are rejected.
- Empty/corrupt input enters `READ_ONLY_DIAGNOSTIC`.
- Strict canonical AI-only 59/86, reviewed 59/86, reviewed 17/39 plus 5 extra
  evidence assignments, and partial 54-of-59 fixtures pass preflight.
- Negative `inlineSegments` fixture fails at
  `$.records[0].sourceSnapshot.diffHunks[0].lines[0].inlineSegments`.
- Negative schema/role failures produce zero records and zero import batches.
- AI-only import, idempotent repeat, completed upgrade, lower-rank protection,
  review counts, backup, source link and v0.3.38 regressions pass.

## AJV Regression Evidence

Before correction, the old harness read `ajv.errors` after calling a compiled
validator and silently missed strict schema errors. Once corrected to
`validate.errors`, the historical v0.3.38 fixtures failed on their 210 undeclared
`inlineSegments`. Production validation was not weakened. The v0.3.38 behavior
regression now uses the supplied strict-canonical equivalents and passes.

## UI And Packaging

The Electron smoke uses the renderer window only; it does not capture the
desktop. Development, win-unpacked and isolated Portable runs each traversed 11
routes at five viewports, including all existing non-AI routes and AI Database,
AI Results and Integrated Results. Screenshots were disabled for these pass/fail
runs. Packaged Bridge diagnostics passed for win-unpacked and Portable.

## Warnings

- Existing Vite browser externalization warning for `node:crypto`.
- Existing renderer chunk size warning above 500 kB.
- electron-builder duplicate dependency reference warning.
- Default Electron icon warning.
- `dirtyState=true` is expected because the user's pre-existing v0.2.47 tracked
  report modification was preserved.
