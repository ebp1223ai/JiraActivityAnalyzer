# Jira Activity Analyzer v0.3.0 Manual Validation Checklist

Contract status remains Review Draft until this checklist is completed with real local data.

## Issue Viewer -> Activity Events

- [ ] Open a real approved SQLite database.
- [ ] Apply date, text, event/field and Diff Quick Filters; record filtered count.
- [ ] Run `Export Pending Analysis Data / 匯出待分析資料`.
- [ ] Confirm exported count equals filtered count and exceeds the current page when applicable.
- [ ] Inspect Issue Key, Activity Event, exact Before/After, Diff, Field, Actor, current Issue context and source identity.
- [ ] Compare a record with Viewer full comparison and hashes.

## User Viewer -> All Activity Events

- [ ] Repeat with selected/all-user scope and multiple filters.
- [ ] Find the same event in Issue Viewer and compare evidenceId, Before/After hashes, Diff and context.

## Path and Failure UX

- [ ] Portable APP_ROOT and Installer paths.
- [ ] Chinese and space-containing APP_ROOT.
- [ ] Cancel while running; confirm no final JSON/partial remains.
- [ ] Zero-result filter disables the button with bilingual reason.
- [ ] Unwritable APP_ROOT reports an error and does not fallback.
- [ ] JSON is readable UTF-8 and uncompressed.
- [ ] No Token, Authorization, Cookie, password, local DB absolute path, APP_ROOT path or Windows username appears in the file.

## Product Review

- [ ] Decide context fields to keep/add/remove.
- [ ] Decide whether cross-page selected sets are needed.
- [ ] Decide whether same-history, Description, Comments or adjacent events should be added.
- [ ] Decide internal/full versus minimized external payloads.
- [ ] Do not approve an AI Analysis/Analyzer contract until real exports are reviewed.
