# Jira Activity Analyzer v0.3.21 正式完整 Codex Prompt

## 0. 任務身分

你是 Jira Activity Analyzer（以下簡稱 JAA）Repository 的實作、測試、封裝與交付代理。

本次要在既有 v0.3.20 基礎上完成：

```text
Target Version: 0.3.21
Theme: Manifest-bound Local Golden HTML + Status Contract Alignment + Run-safe SQLite Persistence
```

你必須完成程式修改、自動測試、正式建置、Windows Installer／Portable 封裝、短啟動驗證、報告、Commit、Annotated Tag 與 Push。除非遇到無法安全處理的真實阻擋，否則不得只停在規劃或部分實作。

本 Prompt 是正式實作指令；隨附的四份 Rule／Template MD 是本版權威輸入，不得以 Repository 中同名舊版取代。

## 1. 交付目標

v0.3.21 必須同時完成以下七項已採納決策：

1. HTML 模板固定為 `Skill_Analysis_HTML_Report_Template_v1.0.0.md`。
2. Template 與三份 AI 分析依據 MD 放在同一分析依據資料夾，但 Template 不送給 ChatGPT。
3. v0.3.21 只允許 Manifest 綁定的預設模板，不提供任意模板執行或任意 Template file picker。
4. Canonical Result 建立即可檢視結果；SQLite 失敗不得封鎖 Results UI。
5. 提供「重新產生 HTML」與「重試資料庫寫入」；兩者都只使用既有 Canonical Result，不得重新呼叫 ChatGPT。
6. Catalog 維持 v0.3.1；Common Rules 升 v1.2.1；Manifest 升 Schema 0.3.0／DRAFT-03。
7. 不同 Analysis Run 的結果永久並存；同一 Run 的 SQLite commit retry 必須 idempotent。

## 2. 權威隨附文件

必須使用以下精確檔案：

| Role | File | Expected SHA-256 |
|---|---|---|
| Rule Set Manifest | `Skill_Analysis_Rule_Set_Manifest.md` | `750284a585e45d50416236cceaafaba5b1bd0f328c086da243a4be9d1b654d3b` |
| Common Rules | `Skill_Classification_Common_Rules_v1.2.1.md` | `ad2bc33e9f519f7b752b130a6c73bed6eeddb928083d8a2e28732b306de2fa07` |
| Skill Catalog | `Skill_Catalog_v0.3.1.md` | `dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d` |
| Local HTML Template | `Skill_Analysis_HTML_Report_Template_v1.0.0.md` | `aa3c7c0d4d919a7923eac3c3f43b2aad4f55ae4d39d4a4d407a63e0bce826ad9` |

另有設計背景文件：

```text
JiraActivityAnalyzer_v0.3.21_Design_Plan.md
SHA-256 f55e9b8b43db12fc64981461c0e32311dc8554913358dcc67d361b63195d9b7e
```

實作前必須：

1. 找到這些隨附檔案並計算實際 SHA-256。
2. Hash 不符時停止，不得自行重建、猜測或使用 Repository 舊版替代。
3. 將正式 Prompt 與權威 MD 依現有 Repository 結構保存到適合的 `prompts/`、rules assets 或 resources 路徑。
4. 不得修改四份權威 MD 的內容；若實作發現規格矛盾，停止並具體回報，不可靜默改檔。

## 3. Repository 與工作樹安全

開始前必須檢查：

```text
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v
git log -5 --oneline
```

規則：

- Repository 預期：`https://github.com/ebp1223ai/JiraActivityAnalyzer.git`。
- 目標 Branch：`feat/v0.3.21-manifest-html-renderer-run-safe-sqlite`。
- 不得使用 `git reset --hard`、`git clean`、破壞性 checkout 或刪除未知資料。
- 使用者既有 tracked dirty 修改與 untracked 資料都必須保留，不修改、不移動、不 stage、不 commit。
- 若工作樹已有與本任務重疊的修改，先辨識所有權與差異；無法安全分離時停止並回報。
- 只 stage 本任務明確修改的檔案，提交前逐檔確認 staged diff。
- 不讀取、不輸出、不提交 `.env`、Token、OAuth、Cookie、Authorization header、密碼、憑證或其他 Secret。
- `.env.version`／樣板可依既有規則維護；正式 `.env` 永不進 Git。

## 4. 不可變產品約束

以下不得改變：

- ChatGPT 正式分析仍是單一 Run、單一 Thread、單一主要 Turn。
- 正式輸入仍是 `1 Pending JSON + 3 Analysis Reference MD`。
- 不逐筆 dispatch，不新增固定 20 筆或其他固定分析 Batch。
- Transport segment 不得稱為 Analysis Batch。
- 不自動執行 Analysis Repair，不新增 Repair Turn。
- 正式 Artifact 只能提交一次。
- Bundled Codex 使用既有固定版本與 SHA-256 驗證。
- 不搜尋 PATH、不使用外部 Codex、不自動下載 Runtime、不允許 fallback。
- ChatGPT 對話與 Provider stream 只保存在 JAA 本機，不要求同步 ChatGPT 網頁。
- Conversation／Provider logs 保持 append-only 與 durable flush。
- Failed／Partial 不得寫入或冒充正式 SQLite committed。
- 未人工確認的 AI 結果維持 `PENDING_REVIEW`，不得作正式績效或人員技能結論。
- 不自動執行真實 Managed OAuth 17／117 筆分析；真實 Run 由使用者人工執行。
- 不執行長時間 smoke test；只做必要的短啟動與 renderer load 驗證。

## 5. 已確認的 v0.3.20 Regression

### 5.1 Decision semantic contract

117 筆 Standard Formal Run：

```text
runId = analysis_4937be26-595c-4720-bdf7-346897c021ca
sourceSha256 = 37aa0da07e7adcb755740caa961377a3685077f4008c2f725b62b475b0b2353b
```

Provider、Model Delivery 與 117 筆分析均完成；Decision exact count 與 index coverage 正確，但 Artifact 被拒：

```text
AI_DECISION_SEMANTIC_VALIDATION_FAILED
/decisionsDocument/1/unknownReasons
unknownReasons are only valid for UNKNOWN
```

完整提交中至少有：

- 24 筆 `EXCLUDED` 填入 `unknownReasons`。
- 4 筆 `NEEDS_REVIEW` 填入 `unknownReasons`。

### 5.2 Standard Plus 驗證與分類漂移

使用者加入欄位矩陣後的 117 筆 Run：

```text
runId = analysis_ca66bfcf-02fe-4c56-9723-b3733f7cefdd
```

結果：

- 117/117 Decision。
- 單次 Artifact submission accepted。
- Schema／semantic validation PASS。
- Canonical JSON／HTML 建立成功。
- 但狀態分布從 `71 CLASSIFIED / 24 EXCLUDED / 18 UNKNOWN / 4 NEEDS_REVIEW` 變成 `48 CLASSIFIED / 0 EXCLUDED / 69 UNKNOWN / 0 NEEDS_REVIEW`。
- 57/117 Status 改變，73/117 Skill set 改變。

因此欄位契約必須內建，但不得讓格式要求反向改變分類語意。不能把本次任何一組分類值硬編碼為 Golden label。

### 5.3 SQLite unique constraint

同一 Run 的 Canonical 內部沒有重複 `resultId` 或 `(resultId, skillId)`，但寫入已含先前 17 筆結果的 SQLite 時失敗：

```text
UNIQUE constraint failed:
classification_candidates.result_id,
classification_candidates.skill_id
```

已確認：

- 先前成功的 17 個 `resultId` 全部再次出現在 117 筆 Run。
- 至少 16 組 `(resultId, skillId)` 與既有 DB 完全重疊。
- v0.3.20 將錯誤誤標為 `provider_failed`、`AI_RESPONSE_INVALID`、`PROVIDER_DISPATCHED` 與 `result validation failed`。

本版必須把上述三組案例轉為 regression fixtures／tests。

## 6. Rule Set 與檔案角色

分析依據資料夾正式結構：

```text
<analysis-rules>/
├─ Skill_Catalog_v0.3.1.md
├─ Skill_Classification_Common_Rules_v1.2.1.md
├─ Skill_Analysis_Rule_Set_Manifest.md
└─ Skill_Analysis_HTML_Report_Template_v1.0.0.md
```

角色：

| File | Provider-visible | JAA local use |
|---|---:|---:|
| Catalog | Yes | Skill ID validation |
| Common Rules | Yes | Status／semantic validation |
| Manifest | Yes | Binding／snapshot／prompt contract |
| HTML Template | No | Local deterministic HTML renderer |

Model Delivery Receipt 必須維持：

```text
expectedFileCount = 4
1 JSON + 3 MD
```

HTML Template 不得：

- 出現在 Provider request file count。
- 出現在 delivered model bytes／segment count。
- 被 inline 到 Prompt。
- 被模型讀取、修改或回傳。

JAA 本機 Rule Set Snapshot 則必須記錄四份 MD 的 role、filename、version、bytes 與 SHA-256。

## 7. Standard Formal 與 Decision Contract

### 7.1 Standard Formal

把 Common Rules v1.2.1 的 Status matrix 正式內建至 `STANDARD_FORMAL`：

1. 先依 Evidence 語意決定 Status。
2. 再依 Status 寫入合法欄位。
3. 不得為了通過 Schema、降低 warning、提高分類率或貼近範例而改變 Status。
4. 不得追求固定狀態分布、固定 Skill 數量或固定分類率。
5. 提交前 self-check 全部 N 筆、八個欄位、exact index coverage 與 Status matrix。
6. 正式 Artifact 仍只提交一次。

`STANDARD_PLUS_USER_INSTRUCTION` 只追加真正的使用者分析焦點，不應再要求使用者重貼 Standard Formal 已包含的欄位契約；若使用者內容與不可變契約衝突，依既有安全規範拒絕衝突部分並保存 effective instruction evidence。

### 7.2 Status matrix

| Status | `skillIds` | `positiveEvidence` | `unknownReasons` | Reason location |
|---|---|---|---|---|
| `CLASSIFIED` | non-empty | non-empty | `[]` | evidence／checks／rationale |
| `UNKNOWN` | `[]` | `[]` | non-empty | unknownReasons／rationale |
| `NEEDS_REVIEW` | candidates allowed | required when candidates exist | `[]` | rationale／checks |
| `EXCLUDED` | `[]` | `[]` | `[]` | negativeChecks／rationale |
| `CATALOG_DETAIL_MISSING` | actual candidates | actual evidence | `[]` | rationale |
| `FAILED` | `[]` | `[]` | `[]` | rationale／structured error |

Status decision order：

```text
clearly non-skill evidence → EXCLUDED
insufficient technical information and no reasonable candidate → UNKNOWN
reasonable candidate but attribution/boundary/completeness/conflict needs human judgment → NEEDS_REVIEW
sufficient independent traceable evidence → CLASSIFIED
technical evidence but catalog detail insufficient → CATALOG_DETAIL_MISSING
unrecoverable per-record technical error → FAILED
```

### 7.3 Single contract source

以下必須一致，禁止各自手寫出現漂移：

- Dynamic Tool input JSON Schema。
- `control/output-schema.json`。
- Standard Formal Prompt 文本。
- TypeScript types。
- Decode／normalization。
- Semantic validator。
- Canonical assembler。
- Test fixtures。

優先建立單一 contract definition 或可驗證的 contract parity tests。

JSON Schema 應在可行範圍使用 conditional `if/then`／`allOf` 表達 Status matrix；仍需 semantic validator 提供可讀 finding。

Validator 必須收集全部 findings，不只回傳第一筆。每筆 finding 至少包含：

```text
code
jsonPointer
recordIndex
status
expected
observed
message
```

不得自動 Repair、不得自動發起第二次 Artifact submission。

## 8. Manifest-bound Local Golden HTML

### 8.1 Template identity

正式模板固定為：

```text
File: Skill_Analysis_HTML_Report_Template_v1.0.0.md
Template ID: JAA-SKILL-ANALYSIS-GOLDEN-HTML
Template Version: 1.0.0
Template Schema: jaa-html-report-template-v1
Minimum Renderer: JAA-LOCAL-HTML-RENDERER-1.0.0
```

JAA 只能從 Manifest 的 `html_report_template_file` binding 解析模板，不掃描資料夾猜測、不依排序取第一個 MD、不提供任意 Template file picker。

### 8.2 Template parser safety

只解析模板內：

```text
<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->
...
<!-- END JAA_HTML_REPORT_TEMPLATE_JSON -->
```

之間唯一的 fenced JSON object。

要求：

- Marker 必須各出現一次且順序正確。
- JSON 必須 strict parse 並通過 template schema。
- Marker 外 Markdown 只供人閱讀，不執行。
- 禁止 eval、Function constructor、任意 script、Node require、Shell 或外部程式。
- Template 中 Jira／使用者可控文字一律視為不可信資料。
- Template ID／Version／Hash／Renderer compatibility 不符時 fail closed。

### 8.3 Preflight 與 Frozen Snapshot

Provider dispatch 前完成：

1. 三份 AI Reference MD preflight。
2. Template file／ID／Version／Hash／machine block／Renderer compatibility preflight。
3. 建立 Frozen Rule Set／Renderer Snapshot。
4. 將模板 frozen copy 保存到 Run，例如：

```text
render-workspace/html-report-template.md
```

Template preflight 失敗時不得 dispatch Provider，避免浪費 Token。

### 8.4 Canonical-only rendering

Golden HTML 唯一權威輸入：

```text
canonical-output/analysis-result.json
```

禁止使用以下資料作 HTML 權威來源：

- ChatGPT `analysis-report.md` count。
- Final assistant message。
- Provider stream delta。
- 未通過驗證的 Decision submission。
- SQLite 查詢結果覆蓋 Canonical count。

Renderer 流程：

```text
validate Canonical schema/hash
→ immutable View Model
→ local authoritative counts
→ HTML escape untrusted text
→ render self-contained HTML
→ .tmp write
→ fsync
→ atomic rename
→ reopen
→ SHA-256 verify
→ durable HTML render receipt
```

### 8.5 HTML output

輸出：

```text
canonical-output/analysis-result.html
canonical-output/html-render-receipt.json
debug/html-render-diagnostics.json
```

HTML 必須：

- 單檔 self-contained。
- 完全離線可用。
- 不使用 CDN、遠端 font、遠端 image、analytics 或 network fetch。
- 對所有來源文字 HTML escape。
- 使用不可執行的 `application/json` data block。
- 有 restrictive CSP。
- 支援鍵盤操作與列印。
- Status 同時顯示文字與色彩，不只靠色彩。
- 空陣列顯示 `—`，不捏造內容。

HTML 至少提供：

- Hero／Run metadata。
- Analysis／Artifact／Validation／Canonical／HTML／SQLite 分離狀態 Banner。
- Authoritative status／skill／multi-skill／review counts。
- Rule Set／Template／Renderer／Canonical Hash snapshot。
- Keyword／Issue／Actor／Field／Status／Group／Skill／Review filters。
- Record table 與完整 Diff／Decision details。
- Copy authoritative summary。
- Export current filtered CSV（UTF-8 BOM）。
- Print mode。
- Provenance footer。

HTML render failure 不得改寫已完成的 Provider、Artifact、Validation 或 Canonical status。

### 8.6 Determinism

相同：

```text
Canonical bytes + Template bytes + Renderer version + Frozen Render Context
```

必須產生相同 HTML bytes／SHA-256。若輸出需時間戳，從固定 Render Context 取得，不在 render 時使用不受控 `now()`。

## 9. UI 實作

### 9.1 Analysis workspace

Rule Set 區塊分成：

```text
AI 模型輸入（3 MD）
├─ Manifest
├─ Common Rules
└─ Skill Catalog

本機 HTML Renderer（不送給 ChatGPT）
└─ Skill_Analysis_HTML_Report_Template_v1.0.0.md
```

每一列顯示：

- Role。
- Full path。
- Filename。
- Parsed version／ID。
- Bytes。
- SHA-256。
- Validation status。
- Copy full path。

Template 額外顯示：

- Template ID／Version。
- Required／actual Renderer Version。
- Manifest binding status。
- 「查看模板規格」。
- 明確標示「不送給 ChatGPT」。

v0.3.21 不提供任意 Template 選檔；模板來自 Manifest。

### 9.2 Preflight UI

dispatch 前顯示：

```text
Provider input: 1 JSON + 3 MD
Local renderer input: 1 Template MD
Template sent to ChatGPT: No
```

缺檔／Hash mismatch／Version mismatch／Renderer incompatible 時顯示具體檔案與 finding，阻擋分析。

### 9.3 Results UI gate

只要：

```text
canonicalStatus = created
```

就允許進入「檢視 AI 分析結果」。SQLite 不再是 Results UI gate。

結果頁必須分開顯示：

- Provider Turn。
- Model Delivery。
- Analysis。
- Artifact Submission。
- Validation。
- Canonical Assembly。
- HTML Render。
- SQLite Commit。

提供：

```text
[檢視結果]
[開啟 HTML]
[重新產生 HTML]
[複製 HTML 路徑]
[重試資料庫寫入]
[查看診斷]
```

### 9.4 Re-render HTML

「重新產生 HTML」：

- 只讀取既有 Canonical Result 與 Frozen Template。
- 不建立 AI Run。
- 不呼叫 ChatGPT／Codex Provider。
- 不消耗 Token。
- 不改寫 Decision／Canonical／SQLite。
- 建立新的 render receipt 或明確版本鏈。
- UI 顯示 started／completed／failed 與 output path／hash。

### 9.5 Retry database commit

「重試資料庫寫入」：

- 只讀取既有 validated Canonical Result。
- 不建立 AI Run。
- 不呼叫 ChatGPT。
- 先執行 DB collision／idempotency preflight。
- 成功後更新 database commit receipt 與 lifecycle component status。
- 不改寫原始 Artifact／Canonical files。

### 9.6 Existing-run comparison

若存在相同：

```text
sourceSha256 + rulesSnapshotId + modelId
```

的舊 Canonical Run，可本機產生 comparison evidence：

- status changed count。
- skill set changed count。
- distribution delta。
- changed sourceStableId／recordIndex list。

Comparison 只作人工覆核，不自動重跑、不自動阻擋、不把任一單次結果升格成 Golden label。

## 10. Run-safe SQLite Persistence

### 10.1 Identity

不同 Run 的結果必須並存。建議 Result identity 至少包含：

```text
analysisRunId
+ sourceRecordStableId
+ sourceContentHash
+ analysisSourceIdentity
```

可使用 deterministic hash 或符合既有 schema 的 run-scoped ID，但不得再只依來源 Evidence 產生跨 Run 相同 `resultId`。

要求：

- 不同 Run／相同 Evidence／相同 Skill：不同 `resultId`，可共存。
- 同一 Run 重試：相同 `resultId`，idempotent。
- Candidate unique key 可維持 `(result_id, skill_id)`，但 writer 必須處理同 Run retry。
- 原有歷史結果不得物理刪除。

### 10.2 Migration

依現有 DB schema 設計安全 migration：

- 保留所有既有 rows。
- 不任意重寫舊 `resultId`。
- 新 Run 使用新 identity contract。
- 若新增 `analysis_run_id`／index／receipt table，必須有 schema version、migration test 與 rollback-safe behavior。
- DB backup／copy 策略沿用既有產品規則；不得用破壞性重建掩蓋 migration。

### 10.3 Transaction and idempotency

每次 commit：

1. Preflight 計算 insert／update／already-committed／conflict count。
2. Begin transaction。
3. 寫 parent results。
4. 寫 child candidates。
5. 同 Run existing child set 完全相同時視為 already committed。
6. 同 Run需更新時，原子取代該 result 的完整 child set或使用正確 upsert。
7. 全部成功才 commit。
8. 任一錯誤完整 rollback。
9. 建立 commit receipt 或 failure evidence。

不得使用只 replace parent、卻留下既有 child rows 的作法。

### 10.4 Evidence

成功：

```text
progress/database-commit-receipt.json
```

失敗：

```text
progress/database-commit-failure.json
```

至少保存：

```text
runId
databaseIdentityFingerprint
schemaVersion
transactionId
attemptNumber
preflightCounts
insertedResultCount
updatedResultCount
alreadyCommittedResultCount
insertedCandidateCount
updatedCandidateCount
committedRecordCount
rolledBack
failedTable
constraint
resultId
skillId
existingRunId
incomingRunId
errorCode
message
startedAt
completedAt
```

不得把 DB path 或機密連線資料傳給 Provider。

## 11. Lifecycle 與錯誤分類

Component status 必須獨立：

```text
providerTurnStatus
modelInputStatus
analysisStatus
artifactStatus
validationStatus
canonicalStatus
htmlRenderStatus
sqliteStatus
```

若 Canonical／HTML 已完成但 SQLite 失敗：

```text
overallStatus = completed_with_persistence_error
failedStage = committing_database
rootErrorCode = AI_SQLITE_UNIQUE_CONSTRAINT | AI_SQLITE_COMMIT_FAILED
providerTurnStatus = completed
artifactStatus = published
validationStatus = completed
canonicalStatus = created
htmlRenderStatus = completed
sqliteStatus = commit_failed
```

不得標成：

```text
provider_failed
AI_RESPONSE_INVALID
PROVIDER_DISPATCHED
Not written — result validation failed
```

Completion Manifest 可表示 Canonical completed；Database Commit Receipt 是獨立 persistence truth。UI 必須清楚說明「分析產物有效，但資料庫寫入失敗」。

## 12. Debug Folder 與 Canonical Evidence

Debug Folder 必須從選定 Canonical Run 收集並在 copy 前 flush writers。

至少包含：

```text
control/final-effective-instruction.md
control/output-schema.json
control/instruction-mode.json
input-workspace/pending-analysis.json
input-workspace/common-rules.md
input-workspace/skill-catalog.md
input-workspace/rule-set-manifest.md
render-workspace/html-report-template.md
progress/source-input-receipt.json
progress/model-delivery-receipt.json
progress/artifact-receipt.json
progress/artifact-submission-attempts/*
progress/analysis-progress.jsonl
progress/lifecycle-summary.json
progress/database-commit-receipt.json          # 成功時
progress/database-commit-failure.json          # 失敗時
ai-output/ai-analysis-decisions.json
ai-output/analysis-report.md
ai-output/final-assistant-message.txt
canonical-output/analysis-result.json
canonical-output/analysis-result.html
canonical-output/completion-manifest.json
canonical-output/validation-report.json
canonical-output/html-render-receipt.json
debug/html-render-diagnostics.json
debug/run-comparison.json                       # 有比較來源時
logs/conversation.jsonl
logs/conversation.md
logs/provider-stream.jsonl
```

Debug completeness 必須區分：

- 真正漏包。
- Instruction Mode 不適用。
- Run 在該階段前終止而預期不存在。
- Template missing／invalid。
- HTML 尚未產生。
- HTML render failed。
- Canonical completed／SQLite failed。

所有 source／destination hash、flush result、missing、expected absent、hash mismatch 都要有 durable manifest。

## 13. Security

- HTML 全面 escape Jira、Comment、Diff、User instruction 與 Rule prose。
- 禁止模板任意 code execution。
- HTML 禁止 network access／remote resources。
- CSP 至少依 Template contract；如 inline script 無法避免，資料必須是不可執行 JSON，且不得包含未 escape 的 `</script>` breakout。
- CSV 防止公式注入：以既有安全策略處理 `= + - @` 開頭欄位並記錄。
- 不收集 Secret 到 Debug Folder。
- ASAR 不得包含 `.env`、token、credential、auth cache、使用者 DB、真實 Run data 或未核准測試資料。
- 只封裝核准的 bundled Codex／Bridge／Rule baseline／Renderer assets。

## 14. 自動測試要求

建立或更新：

```text
npm.cmd run test:v0.3.21
```

### 14.1 Decision contract tests

- 六種 Status 合法欄位組合全部 PASS。
- 非 UNKNOWN 的 non-empty `unknownReasons` 全部 FAIL。
- UNKNOWN 缺少 `unknownReasons` FAIL。
- CLASSIFIED 缺少 Skill／Positive Evidence FAIL。
- EXCLUDED reason 位於 checks／rationale PASS。
- NEEDS_REVIEW reason 位於 rationale PASS。
- v0.3.20 的 24 EXCLUDED＋4 NEEDS_REVIEW regression fixture 一次回報全部 28 findings。
- exact N／index order／duplicate／missing／out-of-range／extra property。
- Catalog invalid Skill ID。
- Contract parity：Tool Schema／output-schema／Prompt／TS／validator versions and hashes aligned。

### 14.2 Prompt／transport tests

- Standard Formal 內建 Status matrix。
- Standard Plus 不需要貼同一 workaround 才能通過。
- Model Delivery 仍是 1 JSON＋3 MD。
- Template 不在 Provider file／bytes／segments。
- 單一 Thread／Turn／Artifact submission。
- batchCount=0、repairTurnCount=0、fallbackRequestCount=0。

### 14.3 Template／renderer tests

- 正確 Manifest binding PASS。
- Missing template／Hash mismatch／Version mismatch／duplicate markers／invalid JSON／Renderer incompatible 在 dispatch 前 FAIL。
- Marker 外 code 不執行。
- XSS／`</script>`／HTML／Jira markup fixture 被安全 escape。
- Canonical 0／17／117 records render。
- Self-contained、no remote URL／fetch／XHR／WebSocket。
- Filters、details、copy summary、CSV、print 基本行為。
- Same frozen input deterministic SHA-256。
- Render failure 不改變 Provider／Canonical status。
- Re-render 不呼叫 Provider、不新增 token usage。

### 14.4 SQLite tests

- Clean DB：17 筆首次 commit。
- Same Run retry：成功且不新增重複 row。
- 17 筆 Run 已存在，再 commit 包含同一 17 筆的不同 117 筆 Run：成功並存。
- 完全相同 117 筆、不同 Run：成功並存。
- 相同 Run candidate set 完全相同：already committed。
- 相同 Run candidate set 變更：原子 child-set replacement／upsert。
- Child insert 故意失敗：全部 rollback。
- Migration 保留既有資料。
- Unique error evidence 包含 table／constraint／result／skill／run identities。

### 14.5 Lifecycle／UI tests

- Canonical created＋SQLite failed：Results UI 可進入。
- HTML completed＋SQLite failed：Open HTML 可用。
- Correct overall／component statuses and error code。
- Retry HTML／DB 不 dispatch Provider。
- Custom Diagnostic 仍不可產生正式 Canonical／SQLite。

## 15. 手動與封裝驗證

必須執行並記錄實際耗時：

```text
npm.cmd run typecheck
npm.cmd run test:v0.3.21
npm.cmd run build
npm.cmd run dist
git diff --check
```

另執行：

- ASAR inventory。
- Sensitive filename／secret pattern scan；不得輸出 Secret 內容。
- 確認只保留本版核准 Bridge／Renderer assets，排除 stale bridge／template。
- `win-unpacked` 短啟動：renderer boot、initial route、無 did-fail-load／crash。
- Portable 隔離短啟動：不得使用使用者既有 production data；啟動後正常關閉。
- 不終止使用者正在執行的舊版 JAA Process。
- 不執行長時間 smoke。

真實 Managed OAuth 17／117、正式 SQLite 與乾淨 Windows Installer GUI 若未由使用者提供授權與測試環境，標記 `Manual Validation Pending`，不得假裝通過。這不阻止自動測試與正式封裝完成後的 Partial delivery。

## 16. Version／Build／Reports

更新所有正式版本來源為：

```text
0.3.21
```

包括 package、app metadata、build-info、UI、installer／portable filenames、Changelog、Prompt／Pipeline／Renderer version bindings 與測試名稱。

建立：

```text
reports/JiraActivityAnalyzer_v0.3.21_test_and_verification_report.md
reports/JiraActivityAnalyzer_v0.3.21_artifact_manifest.json
reports/JiraActivityAnalyzer_v0.3.21_execution_time_ledger.json
reports/JiraActivityAnalyzer_v0.3.21_contract_alignment_report.json
reports/JiraActivityAnalyzer_v0.3.21_html_renderer_validation_report.json
reports/JiraActivityAnalyzer_v0.3.21_sqlite_overlap_regression_report.json
```

### 16.1 Execution time ledger

每個主要階段記錄：

```text
phase
command_or_action
startedAtLocal
startedAtUtc
completedAtLocal
completedAtUtc
durationMs
status
exitCode
notes
```

至少包含：

- Initial audit。
- Reference file／hash validation。
- Implementation phases。
- Typecheck。
- Test。
- Build。
- Dist。
- ASAR／security scan。
- win-unpacked／Portable short launch。
- Git commits／tag／push。
- Total wall-clock delivery time。

不得用估算值冒充實際時間。

### 16.2 Token telemetry

若目前 Codex／環境提供 actual token telemetry，記錄：

```text
inputTokens
cachedInputTokens
outputTokens
reasoningTokens
totalTokens
```

若無法取得，必須明確寫：

```text
availability = unavailable
reason = <actual limitation>
```

不得自行估算後冒充 actual telemetry。

### 16.3 Artifact manifest

列出至少：

- Installer EXE full path／size／SHA-256。
- Portable EXE full path／size／SHA-256。
- win-unpacked EXE full path／size／SHA-256。
- Build Time。
- Package Source Commit。
- Bundled Codex version／manifest hash／actual hash。
- Bridge version／hash。
- HTML Renderer version／hash。
- Rule files／Template filenames／versions／hashes。
- ASAR sensitive scan result。

## 17. Git／Commit／Tag／Push

在自動驗證、build、dist、security scan 與短啟動通過後：

1. 確認 staged files 只包含本任務內容。
2. 建立 Package Source Commit。
3. 從該 commit 執行最終正式 dist，確保 artifact 可追溯。
4. 完成 reports／artifact hashes／ledger。
5. 建立 Final Delivery Commit。
6. 建立 annotated tag：

```text
v0.3.21
```

7. Tag 必須指向 Final Delivery Commit。
8. Push Branch 與 Tag 到已驗證的預期 remote。
9. 驗證 upstream ahead／behind = `0/0`，remote branch／tag SHA 一致。

若自動測試、build、dist、安全掃描或 artifact verification 仍失敗：

- 優先在本任務範圍內修正並重跑必要測試。
- 無法修正時停止，不建立成功 Tag，不 Push 未驗證交付。
- 保留所有非本任務既有資料，具體回報 blocker。

僅有 Manual Validation Pending 時，可以建立正式 Partial delivery、commit、tag、push，但不得宣稱 Overall Completed。

## 18. Acceptance Criteria

### 18.1 Functional

- Standard Formal 不需附加 workaround 即符合 Status matrix。
- 1 JSON＋3 MD Provider contract 未改變。
- Template 明確為 `Skill_Analysis_HTML_Report_Template_v1.0.0.md`，不送 Provider。
- Manifest 唯一解析 Template。
- Canonical JSON 可本機產生 self-contained Golden HTML。
- Re-render HTML 不呼叫 ChatGPT。
- Canonical 已建立時，SQLite 失敗仍可檢視結果／HTML。
- 不同 Run 的相同 Evidence／Skill 可並存。
- Same Run DB retry idempotent。

### 18.2 Correctness

- Status matrix 在 Prompt／Schema／Type／Validator／Assembler 一致。
- 不以欄位格式驅動 Status 漂移。
- Authoritative counts 只來自 validated Decision／Canonical。
- HTML 不重新分類或改 count。
- SQLite failure 不再誤標 Provider failure。

### 18.3 Evidence

- Artifact／Validation／Canonical／HTML／SQLite 各自有 durable evidence。
- Debug Folder complete，missing／expected absent／hash mismatch／flush 狀態正確。
- DB conflict 顯示具體 table／constraint／result／skill／Run identities。
- HTML receipt 可證明 Template／Renderer／Canonical／Output hashes。

### 18.4 Delivery

- typecheck／test:v0.3.21／build／dist／git diff check PASS。
- Installer／Portable／win-unpacked 產物可追溯且有 SHA-256。
- 短啟動 PASS。
- Branch／Final Commit／Annotated Tag／Push 完成。
- Existing dirty／untracked user data preserved。

## 19. 最終回報格式

最終回覆使用繁體中文，至少包含：

### 版本結果

```text
Target Version
Overall Status
Branch
Package Source Commit
Final Delivery Commit
Annotated Tag／Tag target
Push／upstream ahead-behind
```

### 主要成果

- Status contract alignment。
- Standard Formal integration。
- Manifest-bound HTML Template／Renderer。
- Results UI／re-render。
- Run-scoped SQLite identity／idempotency。
- Honest lifecycle／debug evidence。

### 驗證結果

列出每個 command 的 PASS／FAIL 與實際 duration。

### 封裝產物

列出 Installer／Portable／win-unpacked 的完整路徑、bytes、SHA-256、Build Time。

### Rule／Renderer identity

列出四份 MD、Renderer、Bridge、Bundled Codex 的版本與 SHA-256。

### 人工驗證待辦

明確列出 Managed OAuth 17／117、Installer GUI、真實 DB／Debug completeness 是否尚待人工執行。

### Reports

提供所有正式 report 的完整路徑。

### Token telemetry

只回報 actual；不可取得時寫 `unavailable` 與原因。

### 工作樹保護

明確說明既有 tracked dirty／untracked 是否完整保留，以及本版是否仍有未 push commit。

## 20. 執行原則

先以安全、可驗證、可追溯的方式檢查現況，再一路完成實作、測試、封裝與交付。不要以「看起來可以」取代 durable evidence；不要用重跑模型掩蓋 Contract、Renderer 或 SQLite 缺陷；不要把本機下游錯誤錯報成 ChatGPT／Provider 失敗。
