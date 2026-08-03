# Jira Activity Analyzer v0.2.56 Manual Validation

## Status

Automated verification may be completed by Codex. The following real Jira, real SQLite, and human GUI checks remain Pending User and must not be reported as passed until observed.

## Required Manual Checks

- [ ] Connect to the intended Jira read-only endpoint and confirm the selected server identity.
- [ ] Build a completed standard Activity Timeline and create the Fetch Queue from that same Timeline Run.
- [ ] Run Full Fetch and confirm all selected issues complete with Count Reconciliation Passed and Issue Key Reconciliation MATCH.
- [ ] Navigate to Issue Viewer and User Viewer during Full Fetch, then return to Data Collection and confirm progress continues.
- [ ] Immediately save the completed Full Fetch result; confirm no FULL_FETCH_RESULT_STALE error.
- [ ] Leave and re-enter Data Collection, then save the same completed result again.
- [ ] Confirm the second save does not duplicate formal SQLite issues, snapshots, raw gzip payloads, Activity Events, Changelog, Comments, or Worklogs.
- [ ] Export Debug Folder and verify full-fetch-attempt.json reports completed or saved, stagingAvailable=true, and historicalStagingIncluded=false.
- [ ] Verify run-reconciliation.json Full Fetch identity matches the attempt, Timeline Run, staging, and database save chain.
- [ ] Confirm Partial, Failed, Cancelled, or reconciliation-incomplete runs cannot save.
- [ ] Confirm Portable output remains inside APP_ROOT and does not fall back to %LOCALAPPDATA%.
- [ ] Launch the Installer build, verify startup, then uninstall it.

## Acceptance State

- True Jira Verification: Pending User
- True SQLite Verification: Pending User
- Portable GUI Verification: Pending User
- Installer Verification: Pending User
- Debug Folder Verification: Pending User
- Tag: Not created
- Overall Status: Partial