# Jira Activity Analyzer v0.2.57 Manual Validation

## Status

Automated synthetic verification, Windows packaging, artifact audit, and short offline process smoke passed. Real Jira, real SQLite, and full human GUI acceptance remain Pending User.

## Required Manual Checks

- [ ] Launch `release/Jira Activity Analyzer Portable 0.2.57.exe` and verify Version, Build Time, commit, branch, and APP_ROOT.
- [ ] Connect to the intended Jira endpoint in read-only mode and confirm server identity.
- [ ] Build one completed standard Activity Timeline and create the Fetch Queue from that same Timeline Run.
- [ ] Confirm navigation, queue edits, hydration, and preflight do not create a Full Fetch attempt.
- [ ] Click Run Full Fetch and confirm the attempt is created only after confirmation and all gates pass.
- [ ] Confirm a successful run reports Count Reconciliation PASSED and Issue Key Reconciliation MATCH.
- [ ] Navigate to Issue Viewer/User Viewer and return; verify the completed result identity remains unchanged.
- [ ] Save Full Fetch Result once and verify JSON plus SQLite commit/readback/FK evidence.
- [ ] Record SQLite Issues, Raw Payloads, Activity Events, Changelog, Comments, Worklogs, and Metrics counts.
- [ ] Save the same result again; confirm `ALREADY_SAVED`, no second JSON export, and all SQLite counts remain unchanged.
- [ ] Run a later blocked/partial/failed/cancelled attempt and confirm it does not replace the prior completed result tuple.
- [ ] Export Debug Folder after navigation; confirm attemptId, timelineRunId, fullFetchRunId, stagingId, saved status, and database evidence all match.
- [ ] Confirm `historicalStagingIncluded=false` and no global latest staging/database evidence is substituted.
- [ ] Confirm tuple mismatch returns `FULL_FETCH_IDENTITY_MISMATCH` and missing matching staging returns `FULL_FETCH_RESULT_STALE`.
- [ ] Confirm Partial, Failed, Cancelled, count mismatch, and issue-key mismatch cannot save formal SQLite.
- [ ] Confirm Portable outputs remain under APP_ROOT and no secret/runtime data is packaged.
- [ ] Install, launch, and uninstall the Setup build.

## Acceptance State

- True Jira Full Fetch Verification: Pending User
- True SQLite First Save Verification: Pending User
- Idempotent Repeat Save Verification: Pending User
- Navigation / Attempt Lifecycle Verification: Pending User
- Debug Folder Identity Verification: Pending User
- Portable GUI Verification: Pending User
- Installer Verification: Pending User
- Tag: Not created
- Overall Status: Partial