# Jira Activity Analyzer v0.2.50 Manual Validation

Overall manual status: **Not Run / Unverified**

Automated app-only and packaged checks are recorded separately in the implementation report. They do not replace human visual or approved real-data validation.

## Windows GUI Checklist

1. Launch `release/Jira Activity Analyzer Portable 0.2.50.exe` with no real Jira credentials.
2. Confirm the shell and sidebar appear before database sections finish loading; record window, shell, overview, list and distribution timestamps for three cold starts.
3. In Database Issue List, enter and clear Chinese text in Key and Summary at least 20 times. Confirm no query is sent before IME composition ends.
4. For each table in `docs/v0.2.50-table-verification-matrix.md`, verify Columns, Required labels, resize, reset widths, reset table, filter, sort and 25/50/100 paging.
5. At narrow width, right edge and non-default zoom, open the User Viewer Key filter and verify it remains inside the app viewport.
6. In Issue/User Activity Events, test Actor, Issue Key, Action, Field, Source, Before, After and Diff individually and in combinations; verify an empty match remains a normal empty state.
7. Compare one approved, non-sensitive Changelog event with Issue/User Activity Events for identical Before, After and provenance.
8. Confirm Description events default to Diff in User All Activity Events while Before/After remain available through Columns.
9. Validate approved HTML, ADF and Jira Wiki samples, images, tables, links and long content; confirm no raw active HTML or renderer freeze.
10. Page rapidly and verify no duplicate, omission or stale overwrite.
11. Close and reopen the app and verify each table restores its own preferences.
12. Create a Debug Folder and confirm summary/manifest/IPC status agree and the error-free counters remain zero.

## Real-data Cases

- COPGEN1-144603: **Not Run**. No approved de-identified fixture was supplied.
- COPGEN1-138930: **Not Run**. No approved de-identified fixture was supplied.
- Real company Jira/Confluence: **Not Run by policy**.
- Real XML / large SQLite: **Not Run**.

Do not copy real XML, SQLite, Full Fetch, Source Archive, Debug Folder, token or credentials into the repository or release folder.
