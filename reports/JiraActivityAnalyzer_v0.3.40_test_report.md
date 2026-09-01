# JiraActivityAnalyzer v0.3.40 Test Report

## 結論

自動化核心、相容性、production build、Windows packaging、Bridge diagnostics、win-unpacked 與隔離 Portable app-only smoke 均 PASS。Windows 人工 GUI 驗收尚未執行，因此 Release Gate 維持 Partial。

| Command / Check | 結果 | Exit | Elapsed | Evidence |
|---|---:|---:|---:|---|
| Input SHA-256 verification | PASS | 0 | unavailable (pre-ledger) | 25/25 match |
| `npm.cmd run typecheck` (final) | PASS | 0 | 11.349s | renderer + Electron TS |
| `npm.cmd run test:v0.3.40` (final) | PASS | 0 | 6.877s | v040 + v039 + v038 |
| `npm.cmd run build` (final pre-package) | PASS | 0 | 16.385s | version/typecheck/Vite/Electron |
| `npm.cmd run test:unit` | PASS | 0 | 17.290s | existing unit suite |
| `npm.cmd run test:integration` | PASS | 0 | 0.980s | existing integration suite |
| `npm.cmd run test:regression` | PASS | 0 | 1.200s | existing regression suite |
| `npm.cmd run test:ui` | PASS | 0 | approx. 53s | 11 routes, 5 viewports, app-only |
| `npm.cmd run capture:ui` | PASS | 0 | approx. 210s | app-only screenshots under `test-artifacts/screenshots/` |
| `npm.cmd run dist` (first attempt) | FAIL (expected safety gate) | nonzero | 8.150s | protected tracked dirty blocked packaging |
| `$env:JAA_ALLOW_DIRTY_PACKAGE=1; npm.cmd run dist` (final) | PASS | 0 | approx. 99s | source commit e616bd7; dirtyState=true |
| Packaged Bridge diagnostic | PASS | 0 | included in dist | win-unpacked + Portable loadability |
| win-unpacked app-only smoke | PASS | 0 | 30.730s | no white screen/renderer crash |
| Portable from `release/` first smoke | FAIL (environment contamination) | 1 | approx. 124s | APP_ROOT contained existing user `database/`/settings; log retained |
| Isolated final Portable app-only smoke | PASS | 0 | 39.332s | fresh ignored APP_ROOT |
| `git diff --check` | PASS | 0 | <1s | only line-ending warnings |
| scoped sensitive-data scan | PASS | 0 | <1s | deliberate mask-test literals only |

## 失敗證據與根因

- 早期 `test-v0340.cjs` 曾因 synthetic fixture 未填 frozen `link_method` 及 test export 缺漏失敗；修正的是測試 fixture/export，未降低 production validation。最終連續通過。
- 第一次 dist 被 repository dirty-worktree guard 正確阻擋。因使用者既有 tracked 修改必須保留，採正式支援的 `JAA_ALLOW_DIRTY_PACKAGE=1`；manifest 記錄 `dirtyState=true`。
- `release/` 直接 Portable smoke 的 legacy startup audit 讀到使用者既有 APP_ROOT 資料而失敗；renderer 未 crash。相同最終 EXE 在全新 ignored 目錄 PASS，證明封裝 renderer 正常，同時保留原始失敗 log `release/logs/app/ui-smoke-20260901_192437.log`。

## Warnings

- Vite 將 shared `node:crypto` externalize 給 browser compatibility。
- minified renderer chunk 約 797 kB，超過 500 kB warning threshold。
- electron-builder 報告 duplicate dependency references。
- 未設定 application icon，使用 Electron 預設 icon。
- 以上均非 build/test failure。
