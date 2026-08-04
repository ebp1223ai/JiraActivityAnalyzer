# Jira Activity Analyzer v0.2.59 Package Size Audit

## Build identity

- Version: `0.2.59`
- Build Time: `2026/08/04 11:21:51` (Asia/Taipei)
- Source commit: `fa8341421df6df880e3224fb53d042cd17655ba6`
- Branch: `feat/v0.2.59-description-diff-source-identity-hunk-rendering-correctness`
- Dirty state: `false`

## Artifacts

| Artifact | Bytes | MiB | SHA-256 |
|---|---:|---:|---|
| `release/Jira Activity Analyzer Setup 0.2.59.exe` | 106,287,150 | 101.363 | `a825db086d3e42823ada6553e55d6f800e47df96ba4521174888012ce242b5e2` |
| `release/Jira Activity Analyzer Portable 0.2.59.exe` | 106,057,143 | 101.144 | `1a1647d58d62e6a1f8f1a8863137e703ae41f2673695471e4139ccb5455dccff` |
| `release/win-unpacked/resources/app.asar` | 24,241,967 | 23.119 | `0cf7a626237bb855b768908946a9d5a75149aa14c47b003213bfce0b7b814dd7` |

## Package metrics

| Scope | Bytes | MiB |
|---|---:|---:|
| win-unpacked | 398,542,976 | 380.080 |
| resources | 24,349,487 | 23.221 |
| app.asar | 24,241,967 | 23.119 |
| packaged node_modules | 21,255,449 | 20.271 |
| app.asar.unpacked | 0 | 0 |

ASAR entries: 4,681. Required `dist/index.html`, `dist-electron/main.cjs`, `dist-electron/preload.cjs`, and `package.json` are present. Unexpected packaged content: 0. Sensitive path scan found no `.env`, token.txt, DB/SQLite, backup, Source Archive, Debug Bundle, or Full Fetch staging path.

## v0.2.58 comparison

| Scope | v0.2.58 bytes | v0.2.59 bytes | Delta |
|---|---:|---:|---:|
| Installer | 105,370,785 | 106,287,150 | +916,365 |
| Portable | 105,140,723 | 106,057,143 | +916,420 |
| win-unpacked | 390,223,678 | 398,542,976 | +8,319,298 |
| app.asar | 15,922,669 | 24,241,967 | +8,319,298 |
| packaged node_modules | 13,575,297 | 21,255,449 | +7,680,152 |

The EXE delta is about 0.874 MiB. The larger raw ASAR is dominated by production dependency package content from a clean `npm ci` layout (notably React DOM development/profiling, React Router production/development, and Lucide formats). `package-lock.json` dependency graph was not upgraded; only the app version changed. No runtime files were deleted to reduce size.

## Largest content summary

Top directories include `locales` 46.631 MiB, `resources` 45.259 MiB, app.asar virtual content 22.037 MiB, packaged node_modules 20.271 MiB, React DOM 6.979 MiB, Lucide 3.347 MiB, React Router 3.194 MiB, and Recharts 2.454 MiB. Largest files are the Electron executable 224.787 MiB, dxcompiler.dll 24.423 MiB, app.asar 23.119 MiB, Chromium licenses 19.372 MiB, ICU data 10.373 MiB, and required graphics/media runtimes.

The complete Top 50 files, Top 20 directories, category totals, and duplicate groups are preserved in ignored machine evidence `test-artifacts/package-size-v0.2.59.json`; Node `JSON.parse` validation passed. This JSON is not committed because `test-artifacts/` is intentionally ignored.

## Smoke

- win-unpacked: renderer title/URL loaded from local app.asar; Passed.
- Portable: title `Jira Activity Analyzer v0.2.59`, local app.asar route `#/database`; Passed.
- Method: app-only DevTools endpoint; no desktop screenshot, no real Jira.
- Installer installation/removal and full interactive GUI remain Not Run.
