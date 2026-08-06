# Jira Activity Analyzer v0.2.67 Package Audit

## Build

- Isolated clean worktree: `F:\AI\JiraActivityAnalyzer-v0267-build`
- Source: `cccad2fd268b076096fcc6124c81a754a4ddbea4`
- Version: `0.2.67`
- Electron: `43.0.0`
- electron-builder: `26.15.3`
- Build time: `2026/08/06 18:01:49` (Asia/Taipei)
- Main delivery path: `F:\AI\JiraActivityAnalyzer\release`

## Artifacts

| Artifact | Bytes | MiB | SHA-256 |
|---|---:|---:|---|
| Jira Activity Analyzer Setup 0.2.67.exe | 106,298,401 | 101.374 | `C5788250E5724D402F002BC99C7BB945A2AD511021F8CA77EE192A90E7F72682` |
| Jira Activity Analyzer Portable 0.2.67.exe | 106,068,411 | 101.155 | `B28496E86C70065D5AB9857BFC2FBDD7C3EDEC6B0D502264A10EF25816CAD1B7` |
| win-unpacked/Jira Activity Analyzer.exe | 235,706,368 | 224.787 | `4627FB5B91CBA055C476030617EC63C112DEB02D828DDC6CD547DDCAFC5795B9` |
| win-unpacked/resources/app.asar | 24,315,192 | 23.189 | `F21969D4F79CF566B9FFD0C678EDC80FC973026C3EF0F3AE2448FC60F9CF9B9C` |

## ASAR Audit

Required entries were present: renderer `dist/index.html`, Electron main/preload, `database-viewer-worker.cjs`, and `package.json`.

No `.env`, token file, SQLite/DB/WAL/SHM, backup, debug bundle, test artifact, synthetic fixture database, or prompt archive was present in ASAR. The package uses the existing Electron/node:sqlite runtime and adds no external SQLite native dependency.

## Startup Smoke

The unpacked executable remained running for the 12-second background smoke. App-only persistent diagnostics recorded `did-finish-load`, `renderer_boot`, First Paint, Shell Visible, and Initial Route Ready for the packaged `file://.../app.asar/dist/index.html` route. No `did-fail-load`, renderer-gone, or uncaught exception was observed.

The first validator command returned exit code 3 because it searched only the top-level `logs` folder; diagnostics were correctly written under `logs/sessions/<session>`. Reading that App-only session proved the launch passed. No OS-level screenshot was taken.
