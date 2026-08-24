# Jira Activity Analyzer v0.3.33 Test and Verification Report

## Overall Status

**Partial / Manual Validation Pending**

Automated implementation, offline replay, build, packaging, packaged identity/security verification, frozen Bridge verification, and isolated renderer startup passed. Real Managed OAuth/Jira, production SQLite, Installer GUI, Portable GUI while another v0.3.32 instance holds application state, and clean-Windows validation were not executed.

## Package Identity

- App: `0.3.33`
- Prompt: `JAA-CHATGPT-ZH-TW-0.3.33`
- Prompt template: `0.3.33-zh-TW-v14`
- Quality: `jaa-ai-analysis-quality-v4`
- Multi-skill: `jaa-multi-skill-evidence-coverage-v2`
- HTML renderer: `JAA-LOCAL-HTML-RENDERER-1.5.1`
- Bridge: `0.3.31-bridge-v13` (frozen at 173352 bytes, SHA-256 `42f5034b75efbfa37af4876edf53d84d5ebedf29bf520323dd392462467567e2`)
- Package Source Commit: `9a72a6ef5d5e526fab859b8fa1846d94b8ece23e`
- Build Time: `2026/08/24 14:57:22` (Asia/Taipei)

## Verification Results

| Command / check | Result | Exit | Observed duration |
|---|---:|---:|---:|
| `npm.cmd run typecheck` | PASS | 0 | 17.36 s |
| `npm.cmd run test:v0.3.33` | PASS | 0 | 3.62 s |
| `node scripts/test-v0332.cjs` | PASS | 0 | 0.98 s |
| `npm.cmd run build` | PASS | 0 | 46.9 s |
| `npm.cmd run replay:v0.3.32:17` | PASS | 0 | included in 6.1 s combined replay |
| `npm.cmd run replay:v0.3.32:117` | PASS | 0 | included in 6.1 s combined replay |
| final `npm.cmd run dist` | PASS | 0 | about 218 s |
| packaged runtime/renderer/security verifier | PASS | 0 | 0.51 s |
| packaged Bridge verifier | PASS | 0 | included in dist |
| isolated final renderer startup | PASS | 0 | 25 s observation |
| `git diff --check` | PASS | 0 | <1 s |

Final startup observed `did-finish-load`, one live renderer process, and no `did-fail-load`, `render-process-gone`, or `app-render-process-gone`. No desktop screenshot or real service connection was used.

## Evidence and Warnings

- 17/117 source archives were replayed read-only; Provider was not called and raw submission hashes did not change.
- Packaged ASAR contained no forbidden sensitive filenames and no Bridge copy; one external frozen Bridge was present.
- Credential scan passed with one existing synthetic `.invalid` UI smoke fixture, fixed hash `d9002e5d0a2371b60a8d73502d754b428ec4010880c572d8e3618d9239a0d666`; it is not a real credential.
- Build warnings: Vite externalized `node:crypto` for browser compatibility; main chunk exceeds 500 kB; electron-builder reported duplicate dependency references and default Electron icon.
- `build-info.json` truthfully records `dirtyState=true` because the user's pre-existing tracked v0.2.47 report modification was preserved. It was not packaged or committed.
- Actual token telemetry: `unavailable`.

## Manual Validation Pending

- Real Managed OAuth/ChatGPT 17-record run, then 117-record run.
- Real Jira and production SQLite warning-acceptance retry.
- Installer GUI installation/uninstallation.
- Portable GUI startup after the user's existing v0.3.32 instance is closed.
- Clean Windows machine verification.
