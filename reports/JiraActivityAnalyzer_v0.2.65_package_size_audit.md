# Jira Activity Analyzer v0.2.65 Package Audit

## Traceability

- Packaged version: `0.2.65`
- Packaged Source SHA: `f5f4fea1312061810652c69daccecc3719c0ca3c`
- Build time: `2026/08/06 10:59:09` Asia/Taipei
- Build host: `Windows_NT 10.0.26100 x64`
- Electron: `43.0.0`
- electron-builder: `26.15.3`
- Clean detached worktree: yes
- Builder dirty state: false

## Artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `release/Jira Activity Analyzer Setup 0.2.65.exe` | 106,293,269 | `c4cc12b650b9b5f7276b8ddd86eb9763a0a74038993d9ba2dec9e2a9c64c2b3c` |
| `release/Jira Activity Analyzer Portable 0.2.65.exe` | 106,063,194 | `2fa46dd04e530a843a852d5fcaa76163452066eca910001969c39a5ec474f732` |
| `release/win-unpacked-v0.2.65/Jira Activity Analyzer.exe` | 235,706,368 | `dd339e2c82fe603ed2af762e666e6a63ee781ea82eef89e3f945a9719767fd23` |
| `release/win-unpacked-v0.2.65/resources/app.asar` | 24,276,719 | `b59f9fb89d012fb3931e63e29f2a455ef94c7447284a2ff22fe05aadad33bd6d` |

`win-unpacked` total: 398,577,728 bytes. ASAR entries: 4,681.

## Content audit

- Repository package-size audit: Passed
- Package `unexpectedCount`: `0`
- Corrected offline ASAR audit: Passed
- ASAR `unexpectedCount`: `0`
- Source SHA present in renderer: yes
- Quick filter and Selected Users production controls present: yes
- v0.2.64 Updated-Date production strings present: no
- Source maps, top-level tests/reports, `.env`, token file, DB/WAL/SHM, backups, and test artifacts: absent
- SQLite schema remains v3

## Smoke status

Short packaged app-only smoke: **Not Run**. The repository's only `ELECTRON_UI_SMOKE` path is a long multi-route, multi-viewport, workflow/data fixture suite. Running it would violate the bounded short-smoke boundary and the user's explicit request to avoid time-consuming tests. No OS desktop screenshot was taken.
