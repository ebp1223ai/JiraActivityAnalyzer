# Jira Activity Analyzer v0.3.1 Manual Validation Checklist

Automated build status: Ready for Manual Validation.

- [ ] Launch `Jira Activity Analyzer Portable 0.3.1.exe` and confirm Build Info shows version `0.3.1` and source commit `c94ef8d...`.
- [ ] In User Viewer, apply a real filter, export Pending Analysis, and confirm the full frozen filtered set is exported rather than the current page only.
- [ ] In Issue Viewer, repeat the export and confirm record, count, Diff, Before/After, and hash consistency.
- [ ] Confirm path-like Jira evidence, including `beforeRaw`, remains unchanged and does not trigger `EXPORT_INTEGRITY_FAILED`.
- [ ] During export, confirm duplicate start is unavailable, Cancel remains actionable, and progress is monotonic from `0 / N` and 0%.
- [ ] Confirm only successful completion reaches 100%.
- [ ] Cancel one export and confirm no final or partial success file remains.
- [ ] Export a Debug Folder and confirm Pending Analysis lifecycle diagnostics are present but contain no Jira evidence, credentials, Token, SQLite path, APP_ROOT, userData, temp, staging, profile, or executable path.
- [ ] Confirm Installer launch and win-unpacked launch behave consistently with Portable.
- [ ] Record successful real SQLite export before unblocking business review.

Do not use or expose real Jira credentials during this manual package check.
