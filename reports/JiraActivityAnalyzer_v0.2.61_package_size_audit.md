# Jira Activity Analyzer v0.2.61 Package Size And ASAR Audit

## Build Identity

- Packaged source commit: f3cd7d9de9b965eaae12b7594ba861943d70fa18
- Branch metadata: feat/v0.2.61-viewer-diff-presentation-table-ux
- Build time: 2026/08/04 14:59:54 Asia/Taipei
- Dirty state: false
- Platform: Windows x64
- Electron: 43.0.0
- electron-builder: 26.15.3
- ASAR enabled: Yes
- app.asar.unpacked: absent
- Unexpected packaged content count: 0

## Artifacts

| Artifact | Bytes | MiB | SHA-256 |
|---|---:|---:|---|
| Jira Activity Analyzer Setup 0.2.61.exe | 105,377,596 | 100.496 | 17b876a30a36f1581bd27ce668535bcc22ecf955feb6c12a80149e3543a7adfe |
| Jira Activity Analyzer Portable 0.2.61.exe | 105,147,597 | 100.277 | 7599bb876aa394aac28a75505863ecb0d1801c5ce91db13d2a436e4e08a00e98 |

## Package Metrics

| Metric | Bytes | MiB |
|---|---:|---:|
| win-unpacked | 390,262,437 | 372.183 |
| app.asar | 15,961,428 | 15.222 |
| resources | 16,068,948 | 15.325 |
| packaged node_modules | 13,575,297 | 12.946 |

## Content Audit

Required production entries were found: `dist/index.html`, renderer JS/CSS assets, `dist-electron/main.cjs`, `dist-electron/preload.cjs`, and `package.json`. No source map, test fixture, test-artifacts directory, report source, token.txt, `.env`, SQLite/database file, backup file, or Debug Folder was found in ASAR.

Machine-readable audit: `test-artifacts/v0.2.61-package-size-audit.json` (ignored, not committed).