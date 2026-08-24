# JiraActivityAnalyzer v0.3.35 Test and Verification Report

- Overall Status: **Partial / Manual Validation Pending**
- Package Source Commit: `c1b8586cccda3817b156e61fddd9908324b89876`
- Offline provider contacted: `false`
- Production SQLite written by tests: `false`

## Results

| Command | Result | Exit | Duration |
|---|---|---:|---:|
| `npm.cmd run typecheck` | PASS | 0 | 9.48 s |
| `npm.cmd run test:v0.3.35` | PASS | 0 | 1.48 s |
| `npm.cmd run replay:v0.3.34` | SECURITY BLOCKED / NOT RUN | n/a | n/a |
| `npm.cmd run replay:v0.3.33` | SECURITY BLOCKED / NOT RUN | n/a | n/a |
| `npm.cmd run test:live:v0.3.35:17` | NOT RUN; opt-in absent | 0 | 0.72 s |
| `npm.cmd run build` | PASS | 0 | about 50.5 s |
| `npm.cmd run dist` | PASS | 0 | about 190 s |
| `git diff --check` | PASS, line-ending warnings only | 0 | included with build checks |

The v0.3.34 and v0.3.33 real Debug Bundle replays were not executed because the environment security reviewer denied reading/extracting real debug bundles. No workaround was attempted. Full renderer/UI smoke was intentionally not run to avoid a long multi-feature test; packaged Bridge diagnostic launch passed and GUI validation remains manual.
