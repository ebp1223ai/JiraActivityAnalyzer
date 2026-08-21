# JiraActivityAnalyzer v0.3.29 Test and Verification Report

Overall Status: **Partial / Manual Validation Pending**

Package Source Commit: `9b5c77af4c3ab1b565eabc3e116d99ea093dd702`
Build Time: `2026/08/21 17:10:53` (Asia/Taipei)

## Automated results

| Command | Result | Exit | Duration |
| --- | --- | ---: | ---: |
| `npm.cmd run typecheck` | PASS | 0 | 10064 ms |
| `npm.cmd run test:v0.3.29` | PASS | 0 | 1923 ms |
| `npm.cmd run replay:v0.3.28-quote-map` | PASS | 0 | 1425 ms |
| `npm.cmd run replay:v0.3.28-no-result-gate` | PASS | 0 | 834 ms |
| `npm.cmd run replay:v0.3.28-manifest-eperm` | PASS | 0 | 776 ms |
| `npm.cmd run build` | PASS | 0 | 31.0 s observed wall time |
| `npm.cmd run dist` | PASS with authorized dirty warning | 0 | approximately 2 minutes observed wall time |
| `git diff --check` | PASS; line-ending warnings only | 0 | under 4 s |

## Packaging

- Installer: `release/Jira Activity Analyzer Setup 0.3.29.exe`, 190622128 bytes, SHA-256 `5EDD3C000C2FF3FBC2350C857B24540D9D474AE82E570B5708FFA93923918E96`.
- Portable: `release/Jira Activity Analyzer Portable 0.3.29.exe`, 190392030 bytes, SHA-256 `7C71B08A2AD68AEE3100CA6AE4DF2E57B7F6507AA8BB03020B435750B8FF5259`.
- win-unpacked: `release/win-unpacked/Jira Activity Analyzer.exe`, 235706368 bytes, SHA-256 `5637E0D18B448AED772C7A3AA31AD707DE183A68D8C772EB2FD46EE590746B69`.

win-unpacked produced renderer `did-finish-load` with no renderer failure during an isolated 8-second startup. Portable remained alive for the 8-second probe with no crash, but its NSIS launcher did not forward renderer stdout; Portable renderer readiness therefore remains manual-validation pending.

## Not executed

No real Managed OAuth analysis, production SQLite write, long UI smoke, or clean-Windows Installer GUI test was run. Existing user dirty and untracked content was preserved and excluded from commits.
