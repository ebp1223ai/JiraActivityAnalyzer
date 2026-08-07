# Jira Activity Analyzer v0.3.1 Test and Package Report

Status: Ready for Manual Validation.

Source commit: `c94ef8d099fbc15b00baa0d3d6f0c17fef15472f`

## Automated verification

| Check | Result |
| --- | --- |
| `npm run test:v0.3.1` | Passed |
| `npm run test:v0.3.0` | Passed: 160 User Viewer and 160 Issue Viewer synthetic records; contract `0.3.0-draft.1` |
| `node scripts/test-debug-folder.cjs` | Passed: 2 copied, 1 expected failure, 0 archives |
| `npm run test:v0.2.47` | Unrelated stale assertion: expected columns omit the already-required `action` column; relevant paths were unchanged |
| `npm run typecheck` | Passed |
| `npm run test:integration` | Passed |
| `node scripts/verify-version.cjs` | Passed: version sources are `0.3.1` |
| `git diff --check` | Passed |
| `npm run dist` | Passed once in a detached clean worktree, 80.6 seconds |
| `node scripts/audit-package-size.cjs` | Passed; unexpected entry count 0 |
| Targeted packaged contamination scan | Passed for repository path, user profile path, telemetry root, `token.txt`, source maps, reports, tests, DB and SQLite artifacts |
| Short packaged startup | Passed: renderer host remained alive after 8 seconds; all 4 matching Electron processes were then closed; 0 remained |

## Windows delivery

Build time: `2026/08/07 18:03:23`
Delivery root: `F:\AI\JiraActivityAnalyzer-v0.3.1-delivery-20260807-180437`

| Artifact | Bytes | MiB | SHA-256 |
| --- | ---: | ---: | --- |
| `Jira Activity Analyzer Portable 0.3.1.exe` | 105173307 | 100.301 | `0262406351578a7bc94ef72aa8bad1d7c6b2369e3fa99e63f381506f984df73f` |
| `Jira Activity Analyzer Setup 0.3.1.exe` | 105403325 | 100.520 | `6dee1cb362d093e0880c53a4143c739db7ab8dc54ed906121cfce29b26038dc6` |
| `win-unpacked/Jira Activity Analyzer.exe` | 235706368 | 224.787 | `2fce74d7ac9aee2b60f5c4203c344268bf2cb7915856f0a6ad409b149360e0e1` |
| `win-unpacked/resources/app.asar` | 16124427 | 15.377 | `a75627b578b971fd28d79add1f653e4adb83de7cf7234eccd475583f77429706` |

The package identifies app version `0.3.1`, exact source commit `c94ef8d...`, and clean build state. The ASAR contains 2,078 entries and no unexpected test, report, prompt, source-map, database, credential, or telemetry entries. Pending Analysis contract identity remains `jira-activity-analyzer.pending-analysis / 0.3.0-draft.1 / review-draft`.

Full multi-route UI smoke was intentionally not rerun. Real SQLite export and Windows GUI workflow acceptance remain manual gates.
