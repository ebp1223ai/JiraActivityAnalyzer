# Jira Activity Analyzer v0.2.61 Manual Validation

## Automated Status

- Source typecheck, focused tests, regressions, build, clean dist, artifact hashes, package-size audit, and ASAR audit: Passed.
- Short packaged app-only smoke: Not Run. The repository's existing Electron UI smoke performs a broad, long-running integration workflow rather than a short renderer-only check.
- OS desktop screenshots: Not used.

## Required User Verification

Use `release/Jira Activity Analyzer Portable 0.2.61.exe` with the same local SQLite database and Description event that exposed the original presentation issue.

1. Issue Viewer → Changelog directly shows Before Original Preview, After Original Preview, and Diff.
2. Issue Viewer → Activity Events uses the same presentation and behavior.
3. User Viewer → All Activity Events uses the same presentation and behavior.
4. Click `View Full Original / 查看完整原文` in Before, After, or Diff and confirm the expanded row shows Before Original, After Original, and Diff Hunks.
5. Confirm the same action changes to `Hide Full Original / 隱藏完整原文` in the same table-cell location and returns to preview state.
6. Confirm no `Collapse row` button is shown in the expanded comparison.
7. Scroll Before, After, and Diff independently and confirm no synchronized scrolling occurs or is offered.
8. Confirm no Filter Preset, Preset Name, Save, Apply, Rename, Update, or Delete preset controls appear on current Viewer surfaces.
9. Confirm Excel filters, search/filter fields, date range, Description Changed Only, and Clear All Filters still work.
10. Change filters, date range, page, page size, and sort; click Reset Widths and confirm only widths reset.
11. Click `Reset Table Layout / 重設表格版面` and confirm only visible columns, order, and widths reset while query/filter/date/search state remains.
12. Confirm source mismatch, stale response, or integrity mismatch remains fail-closed and never displays unrelated Comment or snapshot data.

## Manual Gate Status

| Gate | Status |
|---|---|
| Real SQLite comparison | Not Run |
| Issue Changelog UX | Pending user verification |
| Issue Activity Events UX | Pending user verification |
| User All Activity Events UX | Pending user verification |
| View / Hide in-place toggle | Pending user verification |
| Independent pane scrolling | Pending user verification |
| Table reset semantics | Pending user verification |
| Full Windows GUI validation | Not Run |
| Installer install/uninstall | Not Run |
| Overall Status | Partial |
| Tag | Not created |