# Jira Activity Analyzer v0.2.62 Manual Validation

## Automated Status

- Typecheck, focused synthetic SQLite tests, v0.2.58-v0.2.61 regressions, production build, clean dist, artifact hashes, package-size and ASAR content audit: Passed.
- Short packaged app-only smoke: Not Run.
- OS desktop screenshots: Not used.

## Required User Verification

Use `release/Jira Activity Analyzer Portable 0.2.62.exe` with a trusted local Current-State SQLite v3 database.

1. Issue Viewer contains Overview, Description, Changelog, Comments, Issue Links, Activity Events, and Raw Evidence.
2. Worklogs, Attachments Metadata, and Remote Links tabs are absent.
3. Changelog and Activity Events show the same Before, After, Diff, View/Hide Full Original, Wrap, Show Whitespace, and Copy Original behavior for the same Description event.
4. Changelog displays correct history ID, item index, actor, timestamp, field, source, and exact event identity.
5. Source/hash mismatch remains fail closed and never substitutes Comment or snapshot content.
6. User Viewer selector contains `All Users / 所有使用者` plus individual stable-user entries.
7. All Users rows retain Actor and Stable User identity; equal display names do not merge accounts.
8. All Users date, project, issue type, status, priority, event filters, search, Clear All Filters, sort, and paging work against SQLite.
9. Related Issues count, rows, distinct candidates, and distributions agree under the same scope and filters.
10. Switch Individual -> All Users -> Individual rapidly and confirm no stale rows, counts, charts, or metadata appear.
11. Switch databases and confirm previous scope data/cache is cleared.
12. Confirm Filter Preset removal, independent comparison scrolling, Reset Widths, and Reset Table Layout semantics remain unchanged.

## Manual Gate Status

| Gate | Status |
|---|---|
| Real SQLite comparison | Not Run |
| Issue Changelog UX | Pending user verification |
| Removed Issue tabs | Pending user verification |
| User All Users scope | Pending user verification |
| Scope switch stale protection | Pending user verification |
| Full Windows GUI validation | Not Run |
| Installer install/uninstall | Not Run |
| Overall Status | Partial |
| v0.2.62 Push / Tag | Not performed / Not created |
