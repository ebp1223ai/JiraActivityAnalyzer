# JiraActivityAnalyzer v0.3.42 Test Report

## Overall

Automated gates: **PASS**. Manual GUI release gate: **PENDING**.

| Gate | Result | Evidence |
|---|---|---|
| ZIP safety and SHA-256 | PASS | ZIP `ddb46465...15fec8b`; unsafe entries 0 |
| `SHA256SUMS.txt` | PASS | 34/34, missing 0, mismatch 0 |
| Input validator | PASS_WITH_SKIPS | 164 pass, 0 fail, 1 Windows-inapplicable Linux Playwright path skip |
| Typecheck | PASS | Final run exit 0, 10.573 s |
| `test:v0.3.42` | PASS | Final run exit 0, 9.266 s; v0.3.38-v0.3.41 regressions included |
| Production build | PASS | Executed by final `test:ui` and `dist`; Vite 1667 modules |
| Current-contract UI smoke | PASS | 11 routes, 5 viewports, Debug Log expanded/collapsed; final 45.520 s |
| App-only capture | PASS | 110 PNG files, 12,700,872 bytes; `BrowserWindow.capturePage()` only |
| Portable create/import smoke | PASS | Exit 0, 45.684 s; 44-record REVIEW_COMPLETED Golden package |
| Portable relocated reopen | PASS | Exit 0, 39.070 s; APP_ROOT-relative DB 622,592 bytes recovered |
| win-unpacked UI smoke | PASS | Exit 0, 30.809 s |
| Packaged bridge diagnostics | PASS | win-unpacked and Portable artifact/loadability validation |
| Sensitive-data scan | PASS | No forbidden staged file or new credential; two baseline test/scanner literals reviewed as false positives |
| `git diff --check` | PASS | No whitespace errors |

## Golden Coverage

Validated all 3-record and 44-record packages for every review rank, the negative missing-diff fixture, 44 records/113 findings, rank mismatch, record order, duplicate primary identity, layer identity, preflight byte immutability, transaction rollback, idempotency, rank protection, exact Source Trace read-back, append-only link ERROR history, dynamic future JSON fields, inclusive/open date ranges, invalid date blocking, Raw LEFT JOIN, and Integrated closed/no-match/schema-error states.

## Warnings

- Vite reports a pre-existing browser externalization warning for `node:crypto` in `shared/descriptionDiff.ts`.
- Vite reports a chunk larger than 500 kB.
- electron-builder uses the default Electron icon.
- electron-builder reports duplicate dependency references while resolving modules.
- Initial `dist` attempt exited 1 before creating v0.3.42 artifacts because the intentionally preserved v0.2.47 tracked modification made the worktree dirty. The authorized retry used `JAA_ALLOW_DIRTY_PACKAGE=1` and embedded the exact source commit.
- In-app static-image visual inspection could not initialize because the local Windows sandbox helper failed. DOM clipping/overflow checks and app-only captures passed; human visual judgement remains part of the pending release gate.
