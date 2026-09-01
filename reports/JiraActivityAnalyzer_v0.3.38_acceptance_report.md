# Jira Activity Analyzer v0.3.38 Acceptance Report

## 結論

自動化驗收狀態為 **PASS / MANUAL GUI VALIDATION PENDING**。Legacy full UI smoke 的首要失敗已確認為 test harness 沿用不存在的 `connections.testAndSave`，不是正式 App regression。更新為現行 preload／IPC 契約後，development renderer、win-unpacked 與隔離 APP_ROOT 的 Portable UI smoke 均通過。依使用者指示仍不建立 Tag、不 Push，等待人工 GUI 驗收。

## Harness Drift 證據

- 正式 preload 只公開 `connections.loadEnv / chooseEnv / list / test / onStateChanged`。
- `electron/v0237Integration.test.ts` 明確禁止 `testAndSave`、`connection:save` 與 `connection:set-active`。
- 舊 smoke 在第一個例外前尚未完成 route navigation，造成後續 Sidebar／Debug Log／route 全尺寸連鎖誤報。
- 舊 smoke 另使用已過期的 `Dashboard` sidebar 字樣、只能關不能開的 Debug panel toggle，以及已被各版本獨立 regression tests 取代的 v0.2.4x 深度互動 selectors。
- 原始失敗輸出保留於 ignored `test-artifacts/v038-legacy-smoke-after-contract-fix.log`；摘要保留於 Test Report。

## 修正原則

- production preload、IPC handlers、context isolation、`nodeAccess=false` 與 DB server-identity validation 均未降低或放寬。
- current smoke 使用 `connections.list()` 檢查 renderer contract，不發送真實 Jira request。
- 未認證 DB 建立測試改驗證 `SOURCE_SERVER_IDENTITY_MISSING` 安全阻擋。
- Debug panel 改用正式 `open-debug-log` 與 Close button。
- 預設 `test:ui` 驗證 11 routes、5 viewports、Debug 展開／收合、overflow 與 clipping。
- 歷史深度 harness 原碼保留，可用 `npm run test:ui:legacy-deep` 顯式執行。

## 驗收矩陣

| Requirement | Status | Evidence |
|---|---|---|
| Strict AI package / Golden 59 records, 86 findings | PASS | `test:v0.3.38` |
| Review protection / idempotency / rollback / Source Link | PASS | `test:v0.3.38` |
| Production preload／IPC security contract | PASS | static regression + runtime current smoke |
| Existing non-AI routes | PASS | Connections, Database, Collection, Issues, Users, Activity Stream, Jira Probe, Settings |
| New AI routes | PASS | AI Database, AI Results, Integrated Results |
| Development renderer UI smoke | PASS | 11 routes × 5 viewports |
| win-unpacked UI smoke | PASS | packaged `app.asar/dist/index.html`, 11 routes × 5 viewports |
| Portable UI smoke | PASS | copied artifact with isolated APP_ROOT, 11 routes × 5 viewports |
| Packaged bridge diagnostics | PASS | win-unpacked and Portable receipts |
| Manual GUI acceptance | PENDING | waiting for user validation |

## Safety

未執行真實 Jira、AI provider 或 production SQLite 整合。Git 不包含 Token、密碼、Cookie、`.env`、Database、Debug Bundle、Installer 或 Portable。使用者既有 v0.2.47 tracked 修改與未追蹤資料保持原樣。
