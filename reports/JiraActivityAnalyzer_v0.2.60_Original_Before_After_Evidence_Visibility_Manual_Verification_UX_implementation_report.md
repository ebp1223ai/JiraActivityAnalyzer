# Jira Activity Analyzer v0.2.60 Implementation Report

## Delivery

- Version: 0.2.60
- Theme: Original Before/After Evidence Visibility & Manual Verification UX
- Branch: feat/v0.2.60-original-before-after-evidence-visibility-manual-verification-ux
- Baseline evidence commit: 984b7fa22298161bf58aad158d0d2246a5081875
- Source commit: 55b2d48c3f466ce935870767936c1e833f3733d8
- Packaged source commit: 55b2d48c3f466ce935870767936c1e833f3733d8
- Production implementation: Completed
- Overall status: Partial, pending real SQLite and full manual Windows GUI gates
- SQLite schema: v3 unchanged
- ENV format: unchanged
- Jira access: read-only

## Root Cause

v0.2.59 intentionally removed full Before/After values from compact rows, but the renderer replaced the table cells with "Use validated Diff controls". The legacy full-context resolver canonicalized values, so it could not prove exact original CRLF, whitespace, JSON text or raw-input hash equality. Original evidence remained available in schema-v3 activity_events.from_value_json and to_value_json; no migration or Jira refetch was required.

## Implementation

- Added exact original metadata and grapheme-safe bounded preview contracts in shared/descriptionComparison.ts.
- Bound DescriptionDiffResult to exact UTF-8 SHA-256 hashes of the raw Before/After inputs.
- Added local SQLite preview-batch and full-comparison resolvers with stable event, issue, field, changelog source, database identity and generation checks.
- Kept compact DTOs raw-free and limited preview requests to 100 unique event IDs, six logical lines or 800 code points.
- Added Electron main/preload/type contracts while retaining the v0.2.59 full-context adapter.
- Added one shared renderer preview cache grouped by database identity and generation; stale requests cannot overwrite a newer request.
- Restored Before/After previews in Issue Changelog, Issue Activity Events and User Activity Events.
- Added responsive Before Original, After Original and Diff Hunks sections with Wrap, Show Whitespace, Copy Original and synchronized scrolling.
- Source or integrity mismatch hides both original evidence and diff. HTML/ADF/JSON strings are rendered as inert text.
- Database Activity Events is N/A because this baseline has no such product route.

## Verification Summary

| Command / Gate | Result |
|---|---|
| npm run typecheck | Passed |
| npm run test:v0.2.60 | Passed |
| npm run test:integration | Passed |
| npm run test:v0.2.59 | Passed after restoring the compatible Show Full Context title |
| npm run test:v0.2.58 | Passed |
| npm run test:v0.2.57 | Passed, 56/56 plus chained regressions |
| npm run test:v0.2.56 | Passed, 24/24 plus chained regressions |
| npm run test:v0.2.53 | Passed |
| npm run test:v0.2.51 | Passed |
| npm run test:ledger | Passed existing v0.2.45 ledger validator |
| npm run build | Passed |
| npm run dist | Passed in a detached clean worktree |
| Package-size / ASAR audit | Passed, unexpectedCount 0 |
| Portable app-only DOM smoke | Passed: React root, 8 sidebar links, Build Version and Debug Log |
| Real SQLite failure-case reproduction | Not Run, no authorized real database supplied |
| Full Windows GUI manual comparison | Not Run |
| Installer install/uninstall | Not Run |

## Test Coverage

The v0.2.60 synthetic schema-v3 fixture covers CRLF, tabs, leading/trailing spaces, blank lines, emoji, HTML literals, 200-line originals, bounded previews, exact full values, UTF-8 metadata, empty versus unavailable, same-time Comment isolation, source mismatch, issue mismatch, stale database identity, 101-ID rejection and integrity mismatch.

## Packaging

- Build time: 2026/08/04 12:39:32 Asia/Taipei
- Electron: 43.0.0
- electron-builder: 26.15.3
- Installer: release/Jira Activity Analyzer Setup 0.2.60.exe
- Portable: release/Jira Activity Analyzer Portable 0.2.60.exe
- Dirty state embedded in package: false
- Default Electron icon warning and existing Vite chunk-size warning remain.
- npm ci reported the existing dependency audit state: 9 vulnerabilities (1 moderate, 8 high); no dependency was changed in this version.

## Security

The v0.2.60 source set contains no credential pattern. electron/main.ts contains the pre-existing synthetic string ui-smoke-runtime-token from commit 42ccbc40; it is not a real credential and was not introduced or modified here. No .env, token.txt, database, debug bundle, installer or Portable file is tracked. Package audit found zero unexpected packaged entries.

## Known Limitations

- Overall status remains Partial until the user validates original evidence against the real failure database and completes the full Windows GUI checklist.
- The inherited v0.2.57 Debug Folder database evidence projection limitation remains unchanged.
- Very large content remains subject to the existing diff-too-large guard.
- The full inherited multi-size UI smoke and test:v0.2.45 stale text assertion were not run, per the v0.2.60 scope.
