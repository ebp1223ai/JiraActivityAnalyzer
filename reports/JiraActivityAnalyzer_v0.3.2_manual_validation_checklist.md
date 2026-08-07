# Jira Activity Analyzer v0.3.2 Manual Validation Checklist

Automated status: Ready for Manual Validation.

- [ ] Launch the Portable EXE and confirm Build Info shows version `0.3.2` and source commit `0572420...`.
- [ ] Export from User Viewer with a real filtered set and confirm all filtered records are included, not only the visible page.
- [ ] Export the same events from Issue Viewer and confirm compact record identity and hashes match.
- [ ] Confirm exported records contain only `reference`, `diff`, and `integrity` top-level fields.
- [ ] Confirm no full Before/After, parsed duplicate, comment body, compatibility alias, SQLite path, APP_ROOT, or credential is present.
- [ ] Confirm Diff hunks retain required inserted/deleted/context lines and counts.
- [ ] Use `sourceDatabaseId + activityEventId` to locate the source event and independently verify Before/After SHA-256.
- [ ] Confirm the UI clearly states that the export is not self-contained and full content requires the source database.
- [ ] Cancel one export and confirm no final or partial success file remains.
- [ ] Confirm Installer and win-unpacked startup behavior matches Portable.
