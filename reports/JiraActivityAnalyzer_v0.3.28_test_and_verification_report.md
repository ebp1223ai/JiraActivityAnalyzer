# JiraActivityAnalyzer v0.3.28 Test and Verification Report

Overall Status: **Partial / Manual Validation Pending**

Package Source Commit: `7638882ea0c84264b20ec19fa71198c78eb5f3a4`

## Automated Results

| Check | Result | Evidence |
|---|---|---|
| typecheck | PASS | `npm.cmd run typecheck` |
| v0.3.28 focused regression | PASS | Source v3/v3 response, 4 files, 52 segments, 53 calls |
| v0.3.27 failure replay | PASS | Read-only archive replay under `test-artifacts/replay-v0327-failure/` |
| source runtime contract | PASS | Decoded actual `contentItems[0].text` |
| build | PASS with warnings | Vite large chunk and browser `node:crypto` externalization warnings |
| dist | PASS after retry | Initial dirty-worktree guard and stale v0.3.27 process lock were diagnosed; authorized dirty build used without modifying the user file |
| packaged runtime contract | PASS | Extracted and executed `analysis-bridge-v0328.cjs` from app.asar |
| stale transport scan | PASS with compatibility allowlist | No unapproved v2 identity hit |
| win-unpacked short startup | PASS | Renderer URL resolved to app.asar `dist/index.html` in 2.9 seconds |
| Portable short startup | PASS | BrowserWindow created in 13.6 seconds |

## Manual Validation Pending

Managed OAuth, real Jira, production SQLite, real 17/117 record provider runs, clean Windows Installer GUI, and actual provider token telemetry were not executed. Actual token telemetry is `unavailable`.
