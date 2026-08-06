# Jira Activity Analyzer v0.2.66 Package Size Audit

## Build Identity

- Isolated worktree: `F:\AI\JiraActivityAnalyzer-v0.2.66-dist-20260806-160705`
- Version: `0.2.66`
- Build Time: `2026/08/06 16:08:46`
- Build Time ISO: `2026-08-06T08:08:46.162Z`
- Packaged Source Commit: `8ae32a155a604198ace6f702c17af8aa06a38181`
- Dirty State: `false`
- Electron: `43.0.0`
- electron-builder: `26.15.3`

## Artifacts

| Artifact | Bytes | MiB | SHA-256 | Last Write Time |
|---|---:|---:|---|---|
| Jira Activity Analyzer Setup 0.2.66.exe | 106,295,301 | 101.371 | `CE71A34BA7071306266F5C7E13D32E6A33313CD03482281E9722AEECE4194AD7` | `2026-08-06T16:09:43.7614384+08:00` |
| Jira Activity Analyzer Portable 0.2.66.exe | 106,065,293 | 101.152 | `38432B5FF3A5C75676F55F7A25E3CFECF45238846436C019B9F1F65ADFDB8485` | `2026-08-06T16:09:48.7505882+08:00` |
| win-unpacked/Jira Activity Analyzer.exe | 235,706,368 | 224.787 | `14E2CA19BECC0AE2EEC937285FC4060A6CBC70613F6EB9FE111B732201B284F8` | `2026-08-06T16:09:14.4961703+08:00` |
| win-unpacked/resources/app.asar | 24,295,109 | 23.170 | `9BFF6AF0B7D45D7743E0EA6BBA36C321B7575DAD57764D990DA6E1EF036EB23D` | `2026-08-06T16:09:13.4610028+08:00` |

Installer 與 Portable 的 File/Product Version 均為 `0.2.66`；unpacked EXE File Version 為 `0.2.66`、Product Version 為 `0.2.66.0`。所有 EXE 均為有效 Windows PE (`MZ`) 且大小大於 0。

## Directory Metrics

- `win-unpacked`: 398,596,118 bytes / 380.131 MiB / 75 files。
- `resources`: 24,402,629 bytes / 23.272 MiB / 2 files。
- `app.asar.unpacked`: 不存在，0 bytes；所有 app code/dependencies 均在 ASAR。
- Packaged node_modules: 21,255,449 bytes / 20.271 MiB。

## ASAR Audit

- ASAR entries: `4,682`。
- Worker packaged path: `\dist-electron\database-viewer-worker.cjs`。
- `dist-electron` content: 1.062 MiB。
- Unexpected packaged content: `0`。
- Duplicate physical files: `0`。
- `.env`、token、SQLite/DB/WAL/SHM、synthetic DB、debug bundle、source archive、screenshots、videos、UI reference 與歷史 prompt 檔名掃描：未發現。

## Largest Components

| Component | MiB | Category |
|---|---:|---|
| Jira Activity Analyzer.exe | 224.787 | Electron runtime |
| locales | 46.631 | Electron locale assets |
| resources | 45.360 | App resources |
| dxcompiler.dll | 24.423 | Electron runtime |
| app.asar | 23.170 | Application package |
| app.asar/node_modules | 20.271 | Production dependencies |
| LICENSES.chromium.html | 19.372 | Runtime license data |
| icudtl.dat | 10.373 | Electron runtime |

現有 `npm.cmd run audit:package-size` 成功，完整 JSON 位於隔離 worktree的 `test-artifacts/package-size-audit.json`，該檔未提交。

## Package Safety

Viewer worker 只讀 enforcement 由 bundled worker synthetic test 驗證：`readOnly: true`、`PRAGMA query_only=ON`，DML/DDL rejection、schema digest 與 logical digest 不變均通過。Package audit 沒有發現使用者資料或 credential；本輪沒有將 binary、temporary DB 或 build output 加入 Git。
