# JiraActivityAnalyzer v0.3.14 Implementation Report

## 結論

- Version: 0.3.14
- Theme: AI Request Transparency, Conversation Persistence & Response Contract Alignment
- Overall status: Partial
- Source release commit: `cb395c00a37e267c8bccffc406c79f592511f944`
- Partial 原因：程式、targeted/integration tests、build、dist 與正式 Portable renderer 啟動皆完成；v0.3.14 Real 117 未執行，因本輪無法從非秘密診斷安全確認 ChatGPT authentication，且正式 Portable GUI 尚需人工選取真實 Pending JSON 與三份規則。未讀取或搬移 auth state，也未用 fixture/POC 冒充。

## v0.3.13 基線與根因

指定 Run `analysis_d4b0bbcd-34bb-4721-a5ff-03f238e950b6` 已完成單一 Provider dispatch/thread/turn，usage 為 input 144,667、output 24,984、reasoning 590、total 169,651，後於 `validating_response` 被全域 `negativeChecks` 非空規則拒絕。完整 response raw SHA-256 為 `1c83daa226e32f1cb973d5fabdae35de8302582e4b1914cdfa97bf529c2f7ce3`；舊 Debug attachment 僅 8,192 bytes，SHA-256 `5ff6253e584a1e7f4f64a87009a0a5a2c309259e83aa4873102eb8bf9dc83697`。

截斷來源是 `redactChatGptText()` 的固定 `.slice(0, 8192)` 被誤用於 canonical Debug evidence。v0.3.14 保留此函式只供 preview/log，新增完整 deterministic redaction writer；raw JSON、gzip、canonical JSON、Debug copy 與 manifest 各自保存 bytes/hash，Debug raw copy必須與 manifest raw SHA-256 一致。

## Request Package 與 Provider delivery

- Typed domain：`AiAnalysisRequestPackage`。
- 真實模式：`INLINE_EXACT_CONTENT`；未宣稱 Native attachment。
- 同一 turn 內固定 5 個 model-visible exact UTF-8 blocks：1 Pending JSON、Common Rules、Skill Catalog、Rule Set Manifest/第三份規則、analysis instruction。
- Strict Output Schema 走 App Server schema channel，仍納入 package manifest/hash。
- Snapshot 固定 original/snapshot bytes、SHA-256、filename、role、source kind、complete/truncated、Pending source hash、record count 與 Stable ID set hash。
- final payload 在 `thread/start` 前重新 SHA-256；delivery mode、source hash、Stable ID、count、snapshot 或 payload 任一不符即 fail closed。
- Core instruction：`jira-activity-analysis-core-instruction / 0.3.14-v1`；UI 顯示唯讀內容。Supplemental instruction 併入同一 user message，不建立第二 Turn。

## Run archive 與 conversation

Canonical root：`<APP_ROOT>/app-data/ai-analysis/runs/YYYY/MM/DD/<local-time-ms>_<runId>/`。每次有效開始先建立唯一目錄、request package、`conversation.jsonl` 與 `provider-stream.jsonl`，再允許 dispatch。

Conversation writer 在 Electron main 以 append loop + `fsync` 寫入 sequence、event/message identity、role、visibility、local/UTC time、content bytes/SHA-256、Provider correlation、previous hash/event hash。Provider stream 另存 sequence、event type、雙時區、redaction policy、payload bytes/SHA-256。`conversation.md` 是由 canonical JSONL deterministic 產生的 readable derivative。

Restart 時 terminal Run 正常載入，非 terminal Run 標為 Interrupted且不重送。尾端 partial line另存 recovery evidence，再回到最後完整 sequence。UI 使用 200 筆分頁讀取、三種 visibility filter、開啟 Run folder/conversation.md、歷史 Run 與 terminal-only confirmed deletion。

## Canonical Response Contract

Schema：`jira_activity_analysis_v0314` / `ai-analysis-output-v3`。Record status：MATCHED、EXCLUDED、UNKNOWN、CATALOG_DETAIL_MISSING、NEEDS_REVIEW；Candidate status 除 UNKNOWN 外均支援。

- MATCHED：至少一個 MATCHED candidate、positive evidence 與 matched rule；negativeChecks 可空。
- EXCLUDED：record candidate 為 0，exclusionReason 與 record negativeChecks 必填。
- UNKNOWN：candidate 為 0，unknownReason 與缺少 evidence 的 audit check 必填。
- CATALOG_DETAIL_MISSING：保留 exact Catalog candidate、`catalogDetailAvailable=false`、positive evidence、failed Catalog detail check、NEEDS_REVIEW attention。
- NEEDS_REVIEW：review/status reason 必填，並保留 evidence 或 audit check。

Semantic finding 包含 severity、JSONPath、JSON Pointer、record index、Stable ID、candidate index、Skill ID、expected/actual 與 rule ID。驗證順序為 full raw/hash → JSON parse → Strict Schema → identity/Catalog/evidence ownership → status-aware semantics → artifacts → SQLite transaction。Provider-returned、parsed、schema-valid、semantic-valid、formal、SQLite counts 分開保存。

Golden HTML 顯示 candidate status/status reason；SQLite status column 優先保存 `candidateStatus`，完整 candidate JSON 保留所有欄位。舊 analyzed files 仍由 versioned legacy adapter 載入，不會被冒充本版 Provider 成功。

## 測試與邊界

- `npm.cmd run typecheck`: PASS。
- `npm.cmd run test:v0.3.14`: PASS；v0.3.14 43 assertions、v0.3.13 35、v0.3.12 14、v0.3.12 integration 5。
- `npm.cmd run test:v0.3.11:integration`: PASS；包含 v0.3.11、v0.3.10、v0.3.9 fake App Server、v0.3.8 architecture。
- `npm.cmd run build`: PASS。
- `npm.cmd run dist`: 第一次由既有 tracked v0.2.47 report dirty gate 正確拒絕；第二次依使用者要求保留該修改，使用 repository 提供的 `JAA_ALLOW_DIRTY_PACKAGE=1` 完成。該 report 不在 packaged files，也未提交。
- 長時間 UI smoke、真實 Jira/AI Nexus/Jira API、真實 SQLite integration 未執行。

## 安全

未提交 `.env`、token、auth state、Authorization、Cookie、真實 Pending JSON、公司規則、Provider response、Run archive、Debug bundle、SQLite 或 release binary。ENV format 維持 v4。預定提交檔案掃描只找到執行期 `Authorization: Bearer ${secret}` 程式碼與 `[masked]` evidence，沒有嵌入 credential。