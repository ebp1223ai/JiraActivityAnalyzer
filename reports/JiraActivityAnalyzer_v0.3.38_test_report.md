# Jira Activity Analyzer v0.3.38 Test Report

| Command | Result | Exit | Elapsed |
|---|---|---:|---:|
| `npm.cmd run typecheck` | PASS | 0 | 12.709 s |
| `npm.cmd run test:v0.3.38` | PASS | 0 | 2.489 s |
| `npm.cmd run build` | PASS | 0 | 21.841 s |
| `git diff --check` | PASS | 0 | not separately timed |
| `npm.cmd run dist` | BLOCKED as designed: tracked worktree not clean | 1 | 17.677 s |
| `$env:JAA_ALLOW_DIRTY_PACKAGE=1; npm.cmd run dist` | PASS | 0 | 174.607 s |
| app-only legacy UI smoke | FAIL | 1 | approximately 112.4 s |
| Portable CDP route audit | NOT COMPLETED | interrupted | endpoint absent after wrapper launch |

Golden regression 涵蓋 59 records、86 findings、strict preflight、package hashes、idempotency、review-rank protection、in-place replacement、transaction rollback、source-link attempts、integrated raw LEFT JOIN 與 archived routes。

Build warnings：既有 `node:crypto` browser externalization、renderer chunk 超過 500 kB。Packaging warnings：duplicate dependency references、default Electron icon，以及因保留既有 tracked report 修改而授權的 `dirtyState=true`。
