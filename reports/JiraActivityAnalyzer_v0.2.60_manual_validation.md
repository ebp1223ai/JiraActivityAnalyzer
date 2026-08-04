# Jira Activity Analyzer v0.2.60 Manual Validation

## Automated App-Only Check

Status: Passed

The packaged Portable executable was started in the background with a localhost Chromium DevTools endpoint. No OS desktop screenshot was taken. The final synchronous DOM snapshot confirmed:

- React root child count: 1
- Sidebar links: 8
- Build Version 0.2.60 visible: Yes
- Debug Log visible: Yes
- Renderer URL: packaged app.asar/dist/index.html#/database

Two earlier diagnostic attempts are retained in the ledger: the first used an English Dashboard text assertion that did not match the restored database route; the second temporary Promise probe returned undefined. The final direct DOM snapshot passed.

## Required User Verification

Status: Not Run

Use release/Jira Activity Analyzer Portable 0.2.60.exe with the intended local SQLite database.

1. Open Issue Viewer and select a Description changelog event.
2. Confirm Before and After table cells show bounded Original Preview text, not the old placeholder.
3. Expand the row and confirm Before Original, After Original and Diff Hunks are visible together on desktop.
4. Confirm the event ID, issue, history/item and field correspond to the same Description event.
5. Compare displayed character, UTF-8 byte, line and SHA-256 metadata with the expected evidence.
6. Toggle Wrap and Show Whitespace and confirm Copy Original remains byte-for-byte unchanged.
7. Confirm CRLF, tabs, blank lines, leading/trailing spaces, emoji and literal HTML/ADF/JSON remain visible as text.
8. Repeat in Issue Activity Events and User Activity Events.
9. Confirm source or integrity mismatch displays an error and does not show unrelated Comment or snapshot data.

## Manual Gate Status

| Gate | Status |
|---|---|
| Original real SQLite failure case | Not Run |
| Issue Changelog comparison | Not Run |
| Issue Activity comparison | Not Run |
| User Activity comparison | Not Run |
| Narrow-window stacked layout | Not Run |
| Copy Original clipboard comparison | Not Run |
| Installer install/uninstall | Not Run |
| Overall | Partial |
