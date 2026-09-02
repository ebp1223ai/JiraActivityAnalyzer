# JiraActivityAnalyzer v0.3.41 Test Report

## Summary

Core v0.3.41 implementation, regression, renderer, packaging and frozen-byte checks passed. One explicitly extra legacy v0.3.28 packaged-manifest harness failed because it still requires the removed `analysis-bridge-v0328.cjs`; the current v0.3.37 packaged bridge verifier passed for both win-unpacked and Portable.

## Passed checks

| Check | Result | Evidence |
| --- | --- | --- |
| Input SHA verification | PASS | 34/34 files, 0 missing, 0 mismatch |
| Frozen source installation | PASS | 9/9 byte-identical |
| `npm.cmd run typecheck` | PASS | Exit 0, 12.691 s |
| `npm.cmd run test:v0.3.41` | PASS | Exit 0, 10.186 s |
| Golden package | PASS | 3 contracts, 3 records, lossless readback |
| Import idempotency and review rank | PASS | Re-import stable; Completed review protected |
| Migration | PASS | 59 migrated, 59 legacy preserved, 59 PARTIAL trace, rollback and backup PASS |
| Link/query | PASS | Primary match 1; unanalysed row preserved; hash join count 0 |
| Workbench | PASS | Empty-file boot, v2 package, immutable gate; no iframe/network APIs |
| v0.3.40/v0.3.39/v0.3.38 regression | PASS | Included in `test:v0.3.41` |
| `npm.cmd run build` | PASS | Exit 0, version verified 0.3.41 |
| `npm.cmd run test:ui` | PASS | Exit 0; 11 routes x 5 viewports; screenshots disabled |
| `npm.cmd run dist` | PASS | Installer, Portable and win-unpacked produced |
| Packaged bridge verifier | PASS | v0.3.37 bridge identity/hash/loadability for win-unpacked and Portable |
| win-unpacked UI smoke | PASS | Exit 0 |
| Isolated Portable UI smoke | PASS | Exit 0; copied EXE hash equals formal Portable hash |
| Packaged frozen bytes | PASS | 9/9 source-to-package SHA-256 matches |
| Package-size audit | PASS with finding | Exit 0; one 5,544-byte transitive dependency test fixture reported |
| Staged secret scan | PASS | 0 forbidden filenames; 0 credential pattern hits |
| `git diff --check` | PASS | Exit 0 |

## Expected limitations and retained evidence

1. `npm.cmd run test:packaged-runtime-manifest-contract` exited 1. This optional legacy v0.3.28 harness hard-codes `dist-electron/analysis-bridge-v0328.cjs`. v0.3.41 formally packages `analysis-bridge-v0337.cjs`; the current verifier executed by `dist` passed identity, SHA-256 and loadability. No production bridge/security contract was weakened and no post-EXE test edit was made.
2. The first Portable smoke from `release/` exited 1 because a user-owned v0.3.40 Portable was already running against the same `release/app-data`. That process was preserved. The same v0.3.41 EXE was copied byte-for-byte to `test-artifacts/v041-portable-smoke` and passed with exit 0 in an isolated runtime root.
3. The package-size audit reports `resources/app.asar/node_modules/json-schema-traverse/spec/fixtures/schema.js` (5,544 bytes) as unexpected transitive dependency content. This is not user data or a credential and does not affect runtime correctness.
4. Vite reports `node:crypto` externalization for browser compatibility and a 789.73 kB minified chunk. Electron-builder reports duplicate dependency references and use of the default Electron icon. These are warnings, not build failures.

## Data gates

- Safe golden fixture: 3/3 PASS.
- Synthetic v1 migration fixture: 59/59 PASS.
- Real 76-record acceptance: not executed because no explicitly safe real-data input was available. No real Jira, AI provider or user SQLite data was opened.
