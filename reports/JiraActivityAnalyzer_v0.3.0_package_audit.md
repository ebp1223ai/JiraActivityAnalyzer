# Jira Activity Analyzer v0.3.0 Package Audit

Build source: `1cba4a00f100cb7fc02728a345aa050d38b19e5c`, branch metadata `feat/v0.3.0-pending-analysis-data-export`, dirtyState `false`, Build Time `2026/08/07 12:03:15` Asia/Taipei.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `F:\AI\JiraActivityAnalyzer-v030-dist\release\Jira Activity Analyzer Setup 0.3.0.exe` | 105400357 | `969642209d315e6f05a7d01c0e6b0066fb2bcc0b0727d73a3efcb80242cd156d` |
| `F:\AI\JiraActivityAnalyzer-v030-dist\release\Jira Activity Analyzer Portable 0.3.0.exe` | 105170364 | `5bb9906d657ab109002914946500da7a38016cc80d409ce8dd8e4aedd6113b0a` |
| `F:\AI\JiraActivityAnalyzer-v030-dist\release\win-unpacked\resources\app.asar` | 16106030 | `623f4b670a2e6a2a16f67e99083bc3f9eef64c4e582b6143e946fa08e6dab030` |

Audit metrics: Installer 100.518 MiB, Portable 100.298 MiB, win-unpacked 372.321 MiB, app.asar 15.360 MiB, unexpected package entries 0.

app.asar contains `dist-electron/main.cjs`, `preload.cjs`, `database-viewer-worker.cjs`, `pending-analysis-export-worker.cjs`, renderer dist and package metadata. Inventory found no reports/tests/test-artifacts/source maps/.env/token/SQLite/DB/backups. No external SQLite native dependency was added; runtime remains Electron 43 `node:sqlite`. Current-State schema remains v3 and ENV format is unchanged.

electron-builder emitted an existing dependency-path discovery warning for transitive frontend packages, but packaging completed and both package inventory plus packaged startup/export smoke passed.
