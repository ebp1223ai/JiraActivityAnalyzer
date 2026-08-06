# Jira Activity Analyzer v0.2.65 Manual Validation

Automated status: Passed for synthetic production-query, regression, build, dist, and package audits.

Real SQLite validation: **Not Run / Pending user verification**

Full Windows GUI validation: **Not Run / Pending user verification**

## User checklist

- [ ] 1. App shows 0.2.65 and no v0.2.64 Discovery Mode.
- [ ] 2. Issue Viewer Changelog shows all three Diff quick filters.
- [ ] 3. Issue Viewer Activity Events shows the same filters.
- [ ] 4. User Viewer All Activity Events shows the same filters.
- [ ] 5. Comments do not show synthetic Before/After/Diff.
- [ ] 6. Hide No Change defaults ON.
- [ ] 7. Hide + = 0 and Hide - = 0 default OFF.
- [ ] 8. Each toggle and AND combinations return expected rows.
- [ ] 9. Unavailable/source-mismatch diagnostics remain visible.
- [ ] 10. Filtered total, pages, and rows agree beyond the current page.
- [ ] 11. Toggling returns to page 1 and retains page size.
- [ ] 12. Clear All Filters and both layout reset boundaries are correct.
- [ ] 13. User Viewer can search and select multiple users.
- [ ] 14. Chips, count, single removal, and Clear Selected work.
- [ ] 15. Clearing search does not clear selection.
- [ ] 16. One selected user matches v0.2.63 behavior.
- [ ] 17. Multiple users show union events without duplicates.
- [ ] 18. Selected Users / All Users switching restores selection.
- [ ] 19. Rapid add/remove does not show a stale prior scope.
- [ ] 20. Overall related issues are a distinct union.
- [ ] 21. Per-user event/issue/first/last values are correct.
- [ ] 22. Four distributions use union distinct issues.
- [ ] 23. Current snapshot metadata is not presented as historical metadata.
- [ ] 24. Search, date, actor, field, source, sort, page, and Excel filters work.
- [ ] 25. Required Time/Action and optional column behavior remain correct.
- [ ] 26. Restart restores filters, scope, users, sort, page size, and layout.
- [ ] 27. Switching DB removes users absent from the new DB.
- [ ] 28. Rapid Issue/User/DB/Viewer changes do not overwrite current state.
- [ ] 29. Before/After/Diff, hashes, and source identity remain correct.
- [ ] 30. Viewer interactions send no Jira request.
- [ ] 31. Windows 100%, 125%, 150%, and narrow-window layouts remain usable.
- [ ] 32. Traditional Chinese and English labels render correctly.
- [ ] 33. No Error Boundary, unhandled rejection, or material console error appears.

Tag must not be created before this checklist and real SQLite validation are completed.
