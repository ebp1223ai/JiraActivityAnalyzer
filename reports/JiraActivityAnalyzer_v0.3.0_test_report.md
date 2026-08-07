# Jira Activity Analyzer v0.3.0 Test Report

| Command / Gate | Scope | Result | Duration |
|---|---|---:|---:|
| `npm.cmd run typecheck` (final focused pass) | TypeScript renderer + Electron | PASS | 7.8 s |
| `npm.cmd run test:v0.3.0` | Synthetic schema-v3 export production path | PASS | 1.4 s test; 9.0 s with typecheck in final combined run |
| `npm.cmd run test:v0.2.67` | Viewer/filter/Diff/worker regression, 20,000 events | PASS | 35.3 s |
| `npm.cmd run test:integration` | Existing Electron IPC/runtime/database integration | PASS | 3.0 s |
| `npm.cmd run dist` | Final build + Installer/Portable/win-unpacked | PASS | 161.4 s |
| package-size/ASAR audit | Final artifacts | PASS | 4.4 s |
| extracted app.asar worker export smoke | Packaged worker + synthetic SQLite | PASS | 4.1 s |
| hidden win-unpacked startup smoke | Offline packaged startup, 8-second observation | PASS | 9.5 s |
| `git diff --check` | Source/evidence | PASS | <1 s |

v0.3.0 tests cover full filtered sets beyond a visible page, User/Issue cross-view record equality, UTF-8 Chinese/special characters, null/empty values, deterministic evidence/content/records/final-file hashes, APP_ROOT containment, secret/path exclusion, progress, cancellation, count mismatch, DB generation change and partial cleanup. The final package worker exported one synthetic record from app.asar.

Focused test retries occurred only after concrete failures: a Current-State binding-table assumption was corrected to schema-v3 metadata; TypeScript insertion/narrowing errors were corrected; then final focused and regression gates passed.

Not run: real company SQLite, Jira/Confluence/network access, full historical multi-viewport UI smoke, long legacy smoke, or human Installer/Portable export review.
