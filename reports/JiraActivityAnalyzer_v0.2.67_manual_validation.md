# Jira Activity Analyzer v0.2.67 Manual Validation

## Acceptance Summary

- Acceptance date: 2026-08-06
- Real company SQLite / Full Windows GUI: Accepted
- Manual validation: Passed
- Overall status: Completed

## Automated Evidence

| Case | Result | Evidence |
|---|---|---|
| Stored `"null"` Description becomes before-unavailable | Passed | canonical and SQLite UDF parity tests |
| Hide filter removes Description before-unavailable | Passed | Issue Changelog, Issue Events, User Events synthetic tests |
| Non-Description unavailable/comment label survives | Passed | v0.2.65/v0.2.66 negative regressions |
| Progressive 8,520 / 6,338 scope completes | Passed | 87 progress batches; exact final count |
| More than 20 seconds is not a total timeout | Passed | injected clock test completes beyond 20,000 ms |
| Cancel / latest request wins / DB switch | Passed | typed cancellation, supersession, and stale DB rejection |
| Checkpoint resume | Passed | cancelled first batch resumed to identical rows/count |
| Read-only and digest invariants | Passed | query_only plus rejected CREATE/DELETE and before/after digest |
| Packaged renderer startup | Passed | app-only diagnostics: did-finish-load, renderer_boot, First Paint, Shell Visible, Initial Route Ready |

## Windows GUI / Real SQLite Cases

| # | Manual case | Status |
|---|---|---|
| 1 | Open a real Current-State SQLite in Issue Viewer Changelog | Passed |
| 2 | Confirm known Description `Before unavailable` row is visible with filter off | Passed |
| 3 | Enable Hide Before unavailable and confirm that row disappears | Passed |
| 4 | Confirm filtered count, page count, and visible rows agree | Passed |
| 5 | Confirm Comments and non-Description diagnostics remain | Passed |
| 6 | Confirm Changed, No Change, and After unavailable are unaffected | Passed |
| 7 | Clear All Filters resets Hide Before unavailable | Passed |
| 8 | Restart App and verify Viewer preference restoration | Passed |
| 9 | Run 8,520-event / 6,338-field-change real scope and observe progress | Passed |
| 10 | Cancel during filtering and retry | Passed |
| 11 | Rapidly change filters and confirm latest result wins | Passed |
| 12 | Switch databases while filtering and confirm no stale rows | Passed |
| 13 | Repeat large filtering ten times and observe long-session memory | Passed |

The automated packaged startup evidence was captured from App-only diagnostics without desktop screenshots. The user subsequently completed real company SQLite and Windows GUI manual verification and accepted v0.2.67 on 2026-08-06.

Manual acceptance confirms that Hide Before unavailable behaves correctly, large Diff filtering progresses without the former fixed-timeout failure, the real SQLite/Windows GUI flow does not crash, and the v0.2.67 build is reproducible from the recorded Source SHA.
