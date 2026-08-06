# Jira Activity Analyzer v0.2.67 Manual Validation

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
| 1 | Open a real Current-State SQLite in Issue Viewer Changelog | Not Run |
| 2 | Confirm known Description `Before unavailable` row is visible with filter off | Not Run |
| 3 | Enable Hide Before unavailable and confirm that row disappears | Not Run |
| 4 | Confirm filtered count, page count, and visible rows agree | Not Run |
| 5 | Confirm Comments and non-Description diagnostics remain | Not Run |
| 6 | Confirm Changed, No Change, and After unavailable are unaffected | Not Run |
| 7 | Clear All Filters resets Hide Before unavailable | Not Run |
| 8 | Restart App and verify Viewer preference restoration | Not Run |
| 9 | Run 8,520-event / 6,338-field-change real scope and observe progress | Not Run |
| 10 | Cancel during filtering and retry | Not Run |
| 11 | Rapidly change filters and confirm latest result wins | Not Run |
| 12 | Switch databases while filtering and confirm no stale rows | Not Run |
| 13 | Repeat large filtering ten times and observe long-session memory | Not Run |

The packaged App was launched in the background without desktop screenshots. No real company Jira connection or company SQLite content was opened.
