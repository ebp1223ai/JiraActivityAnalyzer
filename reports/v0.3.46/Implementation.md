# v0.3.46 Implementation / Scope Report

## Binding and Status

- deliveryMode: DEVELOPMENT; artifactTargets: win-unpacked (complete folder ZIP).
- Standard: JAA_Codex_Delivery_Standard_v2.0.0.md; 69619 bytes; SHA-256 205f8b2dcc66d718ebcf33f17eedbe3750d0cd59973183d1e7c16917cc22f0b8.
- Input SHA256SUMS: 80/80 verified; input validator 470 PASS / 0 FAIL. Frozen DDL validator PASS using Python UTF-8 mode (initial Windows CP950 attempt failed).
- Baseline HEAD: f286e5ab36cc6f7e9e63f1121351d0e21a39209b.
- Branch: feat/v0.3.46-comment-fulltext-query-performance.
- Manual GUI Validation Pending. No Tag / Push / Release. Packaging receipt is recorded separately after production.
- K46-01: previous Installer uninstall data-loss finding is NOT FIXED. Installer/Portable are N/A_MODE, not PASS. Formal release is NOT_READY.

## Implemented Scope

| Requirement | Changes and production-path evidence |
|---|---|
| R46-01 | Shared Comment body decoder and display policy render create/update full body, preserve literal escapes and escape HTML. Derived counts are null / NOT_APPLICABLE. Original SourceTrace and Review Rank remain untouched. Description full/compact evidence retains existing formatter. |
| R46-02 | Description-only predicates retain Comment/other events and unknown metrics. All 16 combinations pass unit and actual Electron UI cases. Source trace counts are not overwritten; computed export fields use presentation semantics. |
| R46-03 | Scalar predicate projection avoids repeatedly decoding large source documents. Bounded short-body metric memo avoids repeated canonical diff work. Actual large-query stall led to row-correlated index selection; EXPLAIN QUERY PLAN is recorded. |
| R46-04 | Same-result/inflight cache behavior retained, stale response sequence strengthened; v045 preference scopes now survive validation alongside v043. Evicting a result cache no longer resets physical database revision watchers. |
| R46-05 | Worker budget enforcement moved inside each job (previously startup only). Per-worker heap/cache/listener samples and one current RSS per PID are exposed through existing guarded diagnostics. Twenty mixed cycles include real cancellation; no forced GC or process restart hides growth. |
| R46-06 | Target cancellation remains CANCELLED; queued work displaced by worker termination is SUPERSEDED. Actual worker stop acknowledgement is retained. Real SQLite failure remains failure. |
| R46-07 | Picker cancellation is retained across the waiting period and checked before processing/publication. Original export query remains fixed while filters change; database change rejects publication. Only the job's own partial is removed. Legacy explicit/unknown preferences are verified in actual UI and after renderer reload. Existing Golden/relink/date/typed-field/diagnostic regressions are reused. |
| R46-08 | A dedicated packaging entry point explicitly targets dir only. Full ZIP has inventory/hash/CRC and a first-EXE freeze guard. The unchanged tests run against the extracted delivery EXE; human approval remains separate. |
| R46-09 | Scoped source changes, historical failure evidence, operation/quota checkpoints and final accounting are retained. Exact token usage is unavailable, not zero. |

## Evidence-Driven Dependencies

- databaseRevisionV045: observed SQLITE_BUSY during normal startup; same existing read-only busy timeout policy added. No DDL change.
- DashboardPage: observed renderer .items.map crash from a failed/non-list response. Shape validation now takes the error path instead of crashing or presenting a fake successful empty result.
- uiTestControlV044: existing nonce + isolated-root gates unchanged; held/released/cancelled synthetic picker controls added for real IPC race testing.
- No frozen rules, Package schema, SourceTrace, Raw/AI DDL, Workbench or actual Jira/AI service calls changed.
- No user's original DB, ENV, token.txt or untracked assets were read for implementation.

## Performance Interpretation

Paired 39,281-row / 40 long-content-row service profile:
- Initial cold query: 1336.415 ms. Final: 2079.418 ms. **No cold-query improvement claim**; new correct semantic derivation adds work.
- Display-name facet: 592.893 -> 429.184 ms; field facet: 590.294 -> 422.794 ms; warm facet: 60.252 -> 59.459 ms.
- Large numeric quick filter: final 1465.847 ms. Earlier actual UI SQL remained running beyond 40 seconds; UI and service datasets differ, so these are not advertised as a strict speedup ratio.
- A 307240960-byte active snapshot exceeded the 268435456-byte retained-cache budget; eviction and real rebuild preserve the same content revision. Active-job peak allocations are distinct from retained cache bounds.
- Seconds are observations, not substituted acceptance thresholds. Finite tests do not prove the absence of every memory leak.

## Failure Evidence (Never Rewritten)

- baseline-1788935243591: Comment counts / quick filters failed before implementation.
- ui-1788936263248: startup SQLite lock and renderer shape failure.
- ui-1788936712801: large numeric SQL stall.
- ui-1788937111603: all16 quick filters PASS; subsequent old Time locator FAIL.
- ui-1788938018607: real cancellation during picker incorrectly published output before fix.
- pref-before: current scope dropped (expected 1, actual 0); initial reproducer path invocation also failed and was corrected.
- ui-1788938620652: harness expected Other User count was wrong; corrected using fixture cardinality.
- ASAR preflight found platform-specific list/stat path failures; structured raw-header traversal replaced it before any v0.3.46 EXE existed.
- 7zip-bin was unavailable; the preflight-tested .NET ZIP / Python CRC toolchain needs no new dependency.
- All other command failures, retries and tool limitations are listed in accounting and test reports.

## Scoped Files

- VERSION
- package.json
- package-lock.json
- electron/aiAnalysisDatabaseIpcV042.ts
- electron/aiResultsIndexV044.ts
- electron/aiResultsQueryV043.ts
- electron/aiResultsServiceV044.ts
- electron/aiResultsWorkerV044.ts
- electron/databaseRevisionV045.ts
- electron/main.ts
- electron/uiTestControlV044.ts
- shared/aiViewerPreferencesV043.ts
- shared/activityPresentationV046.ts
- src/components/ActivityComparisonTable.tsx
- src/components/DiffCell.tsx
- src/components/TraceEvidenceView.tsx
- src/routes/AiDatabaseViewerPagesV043.tsx
- src/routes/DashboardPage.tsx
- src/utils/activityEventDisplayPolicy.ts
- scripts/test-v0344-ui.cjs
- scripts/package-v0346.cjs
- scripts/test-v0346-service.cjs
- scripts/test-v0346-ui.cjs
- scripts/test-v0346.cjs
- scripts/v0346-ui-checks.cjs
- scripts/v0346-ui-edgechecks.cjs
- tests/fixtures/v0.3.46/05_fixtures/v046/presentation-cases.json
- tests/fixtures/v0.3.46/05_fixtures/v046/quick-filter-cases.json
- tests/fixtures/v0.3.46/05_fixtures/v046/diagnostic-outcomes.json

CHANGELOG and this version's reports are additional documentation-only changes.

## Preserved User Work

The original v0.2.47 report hash remains 9862e5dd2748f3c6624b94d4a98dbefc1146128766692dac1f92271a96e5934d.
It must not be staged. The original 15 untracked entries remain excluded, including UI assets, historic prompts, private test folders, database/ and token.txt.

## Reproduction

- npm.cmd run typecheck
- npm.cmd run build
- npm.cmd run test:v0.3.46
- npm.cmd run test:ui:v0.3.46 (default all quick combinations and mixed workflow)
- JAA_V046_UI_FOCUS=edges selects focused picker/preference races; workflow reuses separately recorded quick-filter evidence.
- Existing test-v0343.cjs, test-v0343-integration.cjs, test-v0343-correctness.cjs and test-v0344-correctness.cjs are focused contract regressions.
- npm.cmd run package:v0.3.46 requires JAA_V046_PACKAGE_EVIDENCE and committed source. Never rerun after the first version EXE; factual reports only may then change.
