# Jira Activity Analyzer v0.2.58 Manual Validation

Automated focused checks are complete. The following GUI/package checks remain manual and must not be reported as automated Pass.

## Development UI

- [ ] Database Overview: verify all six date shortcuts and all three date modes.
- [ ] Database Overview: verify distributions and Issue List update together.
- [ ] Issue Viewer Changelog: verify Actor, Field, Source multi-select and Before/After text filters.
- [ ] Issue Viewer Changelog: verify Description Changed Only and Include Before unavailable.
- [ ] Issue Viewer Comments: verify Created default, Last Updated mode, Created fallback badge, and missing-date count.
- [ ] Issue/User Activity Events: verify date range, Excel candidate search, Clear Column, Clear All, and Esc.
- [ ] User Viewer: verify the selected period is shared by Related Issues and All Activity Events.
- [ ] Step 2: verify Select/Deselect All Filtered Results spans all filtered rows and Project filter preserves global selection.
- [ ] Presets: Save, Apply, Rename, Update confirmation, Delete confirmation, duplicate guard, and viewer/tab isolation.
- [ ] IME: compose Traditional Chinese in Step 2 and text filters without premature apply.
- [ ] Verify no filter row overlays table data.

## Packaged Windows application

- [ ] Launch Installer build.
- [x] Launch packaged `win-unpacked` renderer in a short offline background smoke; title and local `app.asar` URL loaded successfully.
- [ ] Launch Portable build interactively.
- [x] Confirm generated Build Info version, source commit, branch, build time, and clean state.
- [ ] Repeat the Development UI checks against packaged renderer.
- [ ] Confirm no Jira write and no database schema migration.

Automated package evidence: Installer and Portable were generated, hashed, and ASAR-audited. The short smoke did not capture the desktop and did not contact Jira. Installer installation/removal and Portable interactive behavior remain user validation gates.
