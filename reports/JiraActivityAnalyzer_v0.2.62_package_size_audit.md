# Jira Activity Analyzer v0.2.62 Package Size And ASAR Audit

## Build Identity

- Packaged source commit: `b917017891e960df061e83c63da62cd04179d7a1`
- Branch metadata: `feat/v0.2.62-issue-viewer-changelog-all-users`
- Build time: `2026/08/04 16:03:49` Asia/Taipei
- Dirty state: `false`
- Platform: Windows x64
- Electron: `43.0.0`
- electron-builder: `26.15.3`
- ASAR enabled: Yes
- `app.asar.unpacked`: absent
- Unexpected packaged content count: `0`

## Artifacts

| Artifact | Bytes | MiB | SHA-256 |
|---|---:|---:|---|
| Jira Activity Analyzer Setup 0.2.62.exe | 105,376,336 | 100.495 | `70573c032e9b96716bd9432e1ee4687e687a3ddef3f059f7537d9260f19ea938` |
| Jira Activity Analyzer Portable 0.2.62.exe | 105,146,280 | 100.275 | `8c2f0ac68323fc23845b9edec55279c2ed4e95e4b32891404963beb72808c68c` |

## Package Metrics

| Metric | Bytes | MiB |
|---|---:|---:|
| win-unpacked | 390,255,308 | 372.176 |
| app.asar | 15,954,299 | 15.215 |
| resources | 16,061,819 | 15.318 |
| packaged node_modules | 13,575,297 | 12.946 |

## Content Audit

Required production entries were found: `dist/index.html`, renderer JS/CSS, `dist-electron/main.cjs`, `dist-electron/preload.cjs`, and `package.json`. No source map, tests/fixtures, test-artifacts, token file, actual `.env`, SQLite/database, backup, Debug Folder, or Source Archive was found in ASAR.

Machine-readable audit: `test-artifacts/package-size-audit.json` (ignored, not committed).
