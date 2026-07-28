# Jira Activity Analyzer v0.2.43 Manual Validation

## Launch and Shell

1. Launch the unpacked or Portable Electron app.
2. Confirm the title and Build information show v0.2.43.
3. Navigate through Jira Connection, Database Overview, Data Collection, Issue Viewer, User Viewer, Activity Stream Probe, Jira Probe, and Settings.
4. Confirm the same Sidebar and Top Status Bar remain visible.

## Debug Log

1. Generate one WARN or ERROR entry.
2. Confirm the top badge counts it and opening the drawer does not reset the badge.
3. Test level filters, search, auto-scroll, copy, export, and clear.
4. Confirm an empty drawer says `目前沒有除錯日誌 / No debug logs`.
5. Inspect exported diagnostics before sharing and confirm credentials remain masked.

## Local Database

1. With Jira offline and a compatible local database ready, open Database Overview.
2. Run Quick Refresh and confirm no Jira request is made.
3. Manually run Full Health Check and confirm start/completion and result appear.
4. Search the Issue list and open an Issue.
5. Test valid, lower-case, invalid, and not-found Issue Keys.
6. Inspect all Issue tabs; confirm attachments are metadata-only.
7. Open User Viewer and select two users with distinct stable IDs.
8. Confirm identical display names are not merged.

## Data Collection

1. Confirm locked Activity Stream settings remain one calendar month, three rounds, five seconds, and Force All.
2. Run Stage 1 and verify round/event/Issue Key progress.
3. In Stage 2, switch project filters and verify the global selection remains intact.
4. Confirm Select/Clear Visible affects visible rows only and the new selection replaces the prior queue.
5. Run Stage 3 and confirm real queue counts, progress, pagination, retry, Partial, and Failed states.
6. In Stage 4, confirm Run or Skip must be selected explicitly.
7. In Stage 5, confirm export and database-write results are separate, and Partial/Failed records are rejected.

## Responsive

Validate 1366x768, 1600x900, and 1920x1080. Confirm the Debug Log overlays rather than shrinking content, tables scroll within their own containers, bilingual labels do not overlap, and primary controls remain reachable.

## Security

Confirm no POST, PUT, PATCH, or DELETE is available in either Probe, no attachment bodies are downloaded, and no Token, Authorization, Password, Cookie, or Secret appears in logs or exports.
