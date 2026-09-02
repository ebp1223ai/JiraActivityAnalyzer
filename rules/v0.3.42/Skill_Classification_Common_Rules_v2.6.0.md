# 技能分類通用規則 v2.6.0

- File: `Skill_Classification_Common_Rules_v2.6.0.md`
- Version: `2.6.0`
- Previous Version: `2.5.0`
- Status: `approved-baseline`
- Language: `zh-TW`
- Scope: 僅定義 AI 如何根據 Pending Analysis JSON 進行技能分類

## 1. 文件定位

本文件只規範技能分類語意。它不定義檔案傳輸、Bridge、segment、cursor、ACK、Provider lifecycle、Artifact tool、Canonical assembly、HTML、SQLite、Debug Folder、UI 或軟體測試流程。

分析器必須同時遵守本文件、同一組 Rule Set Manifest 與 Skill Catalog。三者衝突時，以 Manifest 的輸入／輸出契約為準，以本文件的分類語意為準，以 Catalog 的 Skill ID、名稱與邊界為準；不得自行補寫三份文件都沒有的正式規則。

## 2. 分析單位與資料來源

1. 輸入 JSON 根物件的 `records[]` 是唯一分析母體。
2. `recordIndex` 是 record 在 `records[]` 中的零起始陣列位置；即使來源 record 沒有 `recordIndex` 欄位，也必須依陣列位置產生。
3. 每個 record 的來源身分必須原樣複製：
   - `reference.evidenceId`
   - `reference.sourceRecordStableId`
   - `reference.issueKey`
4. 主要分析內容來自該 record 的 `diff.diffHunks[].lines[]`。
5. `kind=insert`、`kind=delete` 或其他實際變更行可作為 Primary Change；未變更 context 只能作輔助背景。
6. `reference` metadata 只用於歸屬與追溯，不可單獨支撐技能分類。
7. 不得把其他 record、其他 Issue 或連結目標的內容自動歸給目前 record 的作者。

## 3. 分類流程

對每個 record 依序執行：

```text
確認來源身分與 Diff 完整性
→ 還原可讀的 Added／Removed／Comment 內容
→ 判斷作者歸屬
→ 辨識 Primary Change
→ 列出所有合理 Skill 候選
→ 對每個候選檢查正向訊號與負面條件
→ 執行同 Group 與跨 Group 邊界判斷
→ 決定保留的 Skill Findings
→ 執行跨 Skill Evidence 覆蓋檢查
→ 決定 Record Status 與 Confidence
→ 建立可回查原始 JSON 的 Evidence 引用
→ 完整自我檢查後輸出
```

禁止只做 keyword match，也禁止找到第一個候選後就停止。

## 4. Evidence 權重

| Evidence 類型 | 參考權重 |
|---|---:|
| 使用者本人 Comment 的實際技術內容 | 0.98 |
| 本人 Description／Page Body Delta | 0.95 |
| Jira Description | 0.82 |
| Summary／Title | 0.72 |
| 本人 Changelog Delta | 0.65 |
| Labels／Custom Fields | 0.50 |
| 本人 Attachment Metadata | 0.35 |
| Activity Stream metadata | 0.20 |
| Robot／Automation | 0.00 |
| Context Link Only | 0.05 |

權重是判斷參考，不是要求模型輸出浮點計算過程。

## 5. Author Attribution

| Attribution | 參考權重 |
|---|---:|
| 本人直接作者 | 1.00 |
| 本人上傳附件 | 0.80 |
| 本人 changelog actor | 0.70 |
| 只有 Assignee／Reporter／Creator 關係 | 0.30 |
| 其他人內容 | 0.10 |
| Robot／Automation | 0.00 |

只有關聯身分而沒有本人可歸因內容，不得高信心分類。

## 6. Confidence

Record 與 Skill Finding 的 `confidence` 都只能使用 JSON number：

```text
0
0.3
0.6
0.9
```

- `0.9`：本人高權重 Evidence、明確技術行為、通過相近技能負面檢查。
- `0.6`：存在可信技術訊號，但內容、界線或 Catalog 定義仍有限。
- `0.3`：只有弱訊號、簡短技術描述或歸屬／上下文不足。
- `0`：EXCLUDED、FAILED，或沒有可保留的技能判斷。

不得輸出 `HIGH`、`MEDIUM`、`LOW`、`NONE`，也不得輸出 0.8、0.95 等未定義數值。

## 7. Negative Rules

1. 單一 keyword、縮寫、Title Tag、Status 或 substring 不足以分類。
2. `status=DEBUGGING` 不足以分類 Debug。
3. Group 名稱、附件檔名、log 檔名不可單獨分類。
4. Template、placeholder、通用格式符號不是技能 Evidence。
5. Robot／Automation 不算人員技能。
6. 不得把歷史值或他人引用內容全部歸給本次修改者。
7. 只有「請提供 log／dump／資料」而沒有本人分析或技術判讀，不得強迫分類。
8. 只有「已上 Code／已完成／請驗證／上 Develop_Test 燒機未再出現」等完成或驗證結果通知，而沒有本人實際修正內容、Branch 維護決策或分析過程，不得強迫分類；通常應為 `EXCLUDED`。
9. 只有 Remote Link／Context Link，不得把目標內容歸給目前 Evidence 作者；但作者明確記錄「經檢查後確認為相同／相似問題」時，該判斷行為可成為 Debug 初步歸類候選，仍不得把連結目標內未出現在本筆的技術內容當成本筆 Evidence。
10. 不得為提高覆蓋率、符合範例、達成固定 Skill 數量或避免 UNKNOWN 而強迫分類。
11. 不得複製相同的 Evidence 說明到多筆 record；每筆理由必須對應該筆來源內容。
12. Catalog 缺少正式細節時，不得自行虛構 Skill 定義。

## 8. Multi-skill 規則

1. 同一 record 可以對應零個、一個或多個 Skill，沒有固定上限。
2. 同 Group 或跨 Group 的多個 Skill 都可以共存，但每個 Skill 都必須有獨立技術面向。
3. 每個 Skill Finding 必須各自具有 Evidence、Evidence Explanation、Negative Checks 與 Rationale。
4. 可用不同 Evidence 片段時，可以讓不同 Skill 使用最能直接支持自身技術面向的片段；但不得因此省略同時直接支持多個 Skill 的關鍵片段。
5. 同一段 Evidence 確實同時包含多個技術面向時必須共用到所有直接受支持的既有 Skill Finding，且每個 Skill 必須清楚說明不同的支持理由。
6. 多個 Skill 若只有完全相同的一句話且無法區分技術面向，不得複製理由湊成 multi-skill。
7. 排除看似合理的相近 Skill 時，應在 `recordNegativeChecks` 或該 Finding 的 `negativeChecks` 留下具體理由。
8. Debug Skill 不會取代領域 Skill。若 Evidence 同時呈現 GC、System、RW、Flash 等領域流程／狀態知識，以及問題歸類、根因推理或改善方法，必須分別檢查並保留有獨立支持的領域 Skill 與 Debug Skill。
9. 反之，只有 Debug 行為而缺少可辨識的領域技術內容時，不得為了湊成「Debug＋領域」而強迫新增領域 Skill。

### 8.1 跨 Skill Evidence 覆蓋檢查

完成 Skill 候選與邊界判斷後，必須再執行一次 Evidence-to-Skill 關聯檢查：

1. 逐一檢查本 record 中已選用的每段 Evidence，列出它直接支持的所有保留 Skill Finding。
2. 若同一個 `sourceJsonPointer + quote` 直接支持兩個以上的 Skill，該 Evidence object 必須出現在每個相關 Skill Finding 的 `evidence[]` 中。
3. 若目標 Skill Finding 已存在，只能把 Evidence 加入既有 Finding；不得建立第二個相同 `skillId`，也不得把它誤判成漏判 Skill。
4. 不要求所有 Evidence 都複製到所有 Skill。只有內容本身直接支持該 Skill 的技術面向時才建立關聯。
5. Evidence 共用不代表理由共用。各 Finding 的 `evidenceExplanation`、`negativeChecks` 與 `rationale` 仍必須分別說明領域知識、分析行為、根因推理或其他獨立技術面向。
6. 分析結果 JSON 不使用 `additionalEvidenceAssignments`。該欄位只屬於人工 Review JSON；正式分析結果必須直接把經確認的 Evidence 寫入目標 Skill Finding 的 `evidence[]`。

Debug 與領域 Skill 共存時，至少執行以下雙向檢查：

- Debug Finding 使用的 quote 若同時直接描述 GC、System、RW、Flash 等領域流程、狀態、資料結構或變數關係，必須檢查該 quote 是否也應加入已存在的領域 Skill Finding。
- 領域 Finding 使用的 quote 若同時直接呈現問題定位、因果鏈、關鍵條件推理或改善方向，必須檢查該 quote 是否也應加入已存在的 Debug Skill Finding。

範例：

```text
「因未考量到 Copy Data 追上 Build GCSA，導致 Program Index 大於 Read Index」
```

若同一 record 已保留 `GC_006` 與 `DEBUG_004`，這段文字同時描述 GC 內部資料／索引關係及根因定位，因此應同時出現在兩個 Finding 的 `evidence[]`，但兩者的支持理由必須不同。

```text
「GC Suspend 時，Copy Data State 切換錯誤。」
```

若同一 record 已保留 `GC_007` 與 `DEBUG_004`，這段文字同時描述 GC Suspend 狀態轉移及錯誤定位，因此應同時出現在兩個 Finding 的 `evidence[]`；不得因 `GC_007` 已使用另一句 GC Flow Evidence，就省略此段與 `GC_007` 的直接關聯。

## 9. Catalog 完整度

Catalog 目前仍是 `review-draft`，許多 Skill 只有名稱與 Group 層級線索。

每個 Skill Finding 必須輸出：

```text
catalogSupport = DEFINED | LIMITED
```

- `DEFINED`：Catalog 已提供足以辨識該 Skill 的說明、線索或 disambiguation。
- `LIMITED`：Skill 候選合理，但 Catalog 只有名稱、Group 線索或不完整定義。

`catalogSupport=LIMITED` 不會把整筆 record 改成失敗；它只是提醒操作者後續應補強 Catalog。模型不得把 suggestion 冒充正式 Catalog 定義。

## 10. Record Status

只允許以下四種狀態：

| Status | 使用條件 | `skillFindings` | `unknownReasons` |
|---|---|---|---|
| `CLASSIFIED` | 至少一個 Skill 有可歸因且足以保留的技術 Evidence | 非空 | `[]` |
| `UNKNOWN` | 不是明確非技能內容，但技術資訊或歸屬不足，無法保留 Skill | `[]` | 非空 |
| `EXCLUDED` | 明確為 automation、workflow-only、request-only、completion-only、context-link-only、模板或非技能內容 | `[]` | `[]` |
| `FAILED` | 該 record 解析或完整性錯誤，無法完成分析 | `[]` | `[]` |

`CLASSIFIED` 是 Record 層級結論，只代表至少有一個 Skill Finding 足以保留；它不表示模型列出的每個 Skill 都正確，也不表示沒有遺漏其他 Skill。Record Status 正確性、既有 Skill Finding 正確性與遺漏 Skill 檢查是三個不同判斷層次，不得互相取代。

Status 判斷順序：

```text
record 自身不可恢復錯誤 → FAILED
明確非技能 Evidence → EXCLUDED
技術資訊或歸屬不足、無法保留 Skill → UNKNOWN
至少一個 Skill 通過 Evidence 與負面檢查 → CLASSIFIED
```

Catalog 定義不足由 `catalogSupport=LIMITED` 表示，不再混入 Record Status。

## 11. DriveLog、相同問題與領域技能邊界

### 11.1 DriveLog 與 `SYSTEM_029`

`SYSTEM_029` 代表實際 Drive log 讀取、解析與判讀能力，不代表所有「資料曾來自 DriveLog」的分析。

可以建立 `SYSTEM_029` 候選的情況（至少符合一項，而且結論必須主要由 log 本身推導）：

1. 作者比較多筆 log row、不同 `*_LOG` event、時間先後或狀態轉移，並用它們重建流程或推導技術結論。
2. Evidence 顯示對 DriveLog 欄位、位址、編碼或值進行實際解碼／解析，而不是只閱讀已具領域語意的變數名稱。
3. 作者以多個 log 欄位或 event 的關聯，說明預期／實際差異、異常點或因果關係。

不足以建立 `SYSTEM_029` 候選的情況：

1. 只有「從 DriveLog 分析／檢查 DriveLog」的來源描述。
2. 只有 log 檔名、圖片、附件、要求提供 DriveLog，或單一 `*_LOG` 名稱。
3. 只列單一 snapshot、一筆 `*_LOG`，或少數已具領域語意的 GC 變數和值，再直接判斷 GC state、Flow 或相同問題；即使同時寫了預期值，仍不足以證明 `SYSTEM_029`。
4. 透過位址搜尋到函式後，後續主要證據是 `gpVT->GC.*`、`gGC.*`、Read／Program Index、GCSA／CopyData state 等 GC 內部變數；此時 DriveLog 只是資料來源，應優先判斷 GC Skill。

`GC_*_LOG`、`XX_LOG` 或其他 event 名稱本身不是 `SYSTEM_029` 的充分條件；只有實際解析其中欄位、值、狀態或時序並用於判斷時，才可保留 `SYSTEM_029`。

### 11.2 相同／相似問題判定

1. 只有貼出 Issue URL 或要求查看另一題，是 context-link-only，不能分類。
2. 作者明確表示已檢查並確認「相同問題／相似問題／已知問題」，代表完成初步比對或歸類，可建立 `DEBUG_001` 候選。
3. 若本筆沒有寫出比對依據，`DEBUG_001` 通常只能使用 `0.3`；若有現象、狀態或 log 特徵的比對依據，可依證據提升至 `0.6`。
4. 相同問題的判斷不能自動帶入連結 Issue 的 GC、System 或其他領域 Skill；領域 Skill 仍須由本筆原文獨立支持。

### 11.3 Debug 與領域 Skill 共存

1. Evidence 若同時說明領域流程／狀態與初步歸類，應分別檢查領域 Skill 與 `DEBUG_001`。
2. Evidence 若同時說明領域流程／狀態與根因鏈、關鍵條件推理或具體改善方向，應分別檢查領域 Skill 與 `DEBUG_004`。
3. 例如 GC Suspend、GCSA、CopyData、Read／Program Index 或 GC state 的分析，不應只留下 Debug Skill；有足夠 GC Evidence 時也要保留相符的 GC Skill。
4. 同一段文字可以共同支援兩個 Skill；若內容確實直接支持兩者，必須把相同 Evidence object 寫入兩個 Finding，且兩者的 `evidenceExplanation`、`negativeChecks` 與 `rationale` 必須分別說明「領域知識」與「分析深度」。

### 11.4 GC Read、COP0、RCQ 與 Flash Cop0 邊界

1. `COP0API_SendSQ_GCRead*`、`FTLGCReadDataByRCQ*`、`FTLGCReadDataSendSQ*` 等名稱中的 GCRead 代表 GC read flow。只有簡短函式名稱或 Input 變更時，應優先保留 `GC_006`，不得僅因 `COP0API`、`SendSQ` 或 `RCQ` token 自動建立 `RW_005`／`RW_002`。
2. `RW_002` 必須有 RCQ 產生、組裝、queue entry、欄位或送出行為；函式只是「ByRCQ」呼叫路徑不足。
3. `RW_005` 必須有 COP0 Read SQ command 組裝、參數、attribute、queue 或送出機制；單一 `SendSQ_GCRead` API 名稱不足。
4. Evidence 明確描述 COP0／COP0SQ 內部功能、初始化、模組位置、command attribute 或功能搬移時，除相符 GC／RW Skill 外，也必須檢查 `FLASH_002 · Cop0`。只有 `COP0API` 函式前綴而沒有 COP0 技術行為時，不得自動建立 `FLASH_002`。
5. 詳細 Evidence 可以同時支持 `GC_006 + RW_002 + RW_005 + FLASH_002`；每個 Finding 必須由不同技術面向支持，不能把短函式名展開成固定 Skill 組合。

## 12. Evidence 引用

每個 Skill Finding 的 `evidence[]` 至少包含一筆：

```json
{
  "sourceJsonPointer": "/records/0/diff/diffHunks/0/lines/1/text",
  "quote": "因未考量到 Copy Data 追上 Build GCSA..."
}
```

要求：

1. `sourceJsonPointer` 必須指向目前 record 內實際存在的字串欄位。
2. `quote` 必須是該欄位中的原文連續子字串，不得翻譯、摘要、補字或改寫。
3. 可從 JSON 字串的 `body` 內容擷取人類可讀片段，不必引用 `{`、`body`、`commentId`、escape syntax 等包裝符號。
4. 引用必須包含足以支持該 Skill 的技術內容，不得只引用通用標題或格式標籤。
5. 同一 Evidence 引用可以支援多個 Skill，但必須遵守 Multi-skill 規則。
6. 不得自造 Evidence ID、Quote ID、hash、offset 或來源路徑。
7. Finding 已經有一筆有效 Evidence，不代表可以略過其他同時直接支持該 Finding 的關鍵 Evidence；必須完成第 8.1 節的跨 Skill Evidence 覆蓋檢查。

## 13. Non-substantive 與 Boilerplate

只有標題、連結、檔名、圖片名、通用完成通知、一般 log 前綴、格式符號或無辨識力短句，不足以作為 Skill Evidence。單獨記錄「已上 Code 到 Develop_Test 燒機且未再出現」仍屬 completion／verification outcome；若沒有修正內容或 Branch 維護決策，應判為 `EXCLUDED`，不能只因未重現就建立 `DEBUG_007`。

合理的短技術 token，例如錯誤碼、函式名、參數名、`HTTP 500`、`NullPointerException` 或 `fsync`，如果能與本次變更及分析理由建立明確關係，不得只因字數短而拒絕。

每筆 `evidenceExplanation`、`negativeChecks`、Skill `rationale` 與 Record `rationale` 必須具體對應該筆 Evidence。禁止用同一套通用句型大量複製。

## 14. 結果語言與文字品質

1. 所有說明欄位使用繁體中文。
2. Skill ID、Skill Name、程式符號、函式名與來源技術文字保持原文。
3. 說明應明確指出「哪段內容」「支持什麼技術行為」「排除了哪些相近技能」。
4. 不得在結果中討論 Bridge、Token、Provider、JAA UI、HTML、SQLite 或軟體執行狀態。
5. 不得輸出分析過程、思考鏈或 Markdown 報告；只輸出 Manifest 定義的 JSON。

## 15. 完成前自我檢查

模型在送出唯一結果前必須確認：

1. 已讀取全部輸入 JSON 與三份 MD。
2. `results.length` 等於輸入 `records.length`。
3. `recordIndex` 完整覆蓋 `0..N-1`，不重複、不缺漏。
4. 每筆來源身分都與相同位置的 input record 一致。
5. 所有 Skill ID、Skill Name 與 Group 都存在於 Catalog。
6. 每個 CLASSIFIED record 至少有一個 Skill Finding。
7. 每個 Skill Finding 至少有一筆可回查的原文 Evidence。
8. UNKNOWN、EXCLUDED、FAILED 的 `skillFindings` 都是空陣列。
9. Summary count 與 results 實際狀態一致。
10. 最終回覆只有一個完整 JSON，不包含 code fence、前言、摘要或下載連結。
11. 沒有把 DriveLog 當成來源描述就自動分類為 `SYSTEM_029`。
12. Debug Evidence 若明確依賴領域知識，已檢查並保留有證據的領域 Skill；沒有把 Debug Skill 當成領域 Skill 的替代品。
13. 只有相同問題結論時，沒有把連結 Issue 的領域內容帶入本筆。
14. 每段已選用 Evidence 都已檢查是否直接支持另一個已保留的 Skill Finding。
15. 同一句 Evidence 若直接支持多個既有 Skill，已加入每個目標 Finding 的 `evidence[]`，沒有建立重複 `skillId`。
16. 沒有把人工 Review JSON 專用的 `additionalEvidenceAssignments` 寫入正式分析結果。
17. GCRead／COP0／RCQ 內容已依第 11.4 節檢查，沒有只靠 token 建立 RW Skill，也沒有漏掉有直接 COP0 實作證據的 `FLASH_002`。
18. 單純「上 Code 燒機未再出現」且沒有修正或 Branch 維護內容時，已判為 `EXCLUDED`，沒有誤建 `DEBUG_007`。

## 16. 統一 AI 分析 Package 的分類層責任

1. 本文件仍只決定 `records[].aiAnalysis` 的技能分類語意，不決定 HTML 版面或 SQLite 實作。
2. Manifest v1.6.0 要求將分類結果封裝為 `jaa-ai-analysis-package v2.0.0`；Schema SHA-256 以同層 `SHA256SUMS.txt` 與 Manifest 綁定值為準。
3. 雲端 AI 首次分析時，每筆 `manualReview` 必須為 `null`，Package 的 Review Coverage 必須為 `NONE / AI_ONLY`。
4. `sourceReference`、`sourceSnapshot` 必須由 Pending 同位置 record 原樣或依 Manifest 的確定性規則建立，不得由技能推論補寫 Issue Type、Priority 或 Issue Status。
5. `records[].aiAnalysis` 仍必須完全遵守本文件的 Confidence、Evidence、Multi-skill、Status 與負面檢查規則。
6. HTML 人工驗收只可新增或更新 `manualReview` 層；不得修改既有 `sourceReference`、`sourceSnapshot` 或 `aiAnalysis`。
7. AI_ONLY、REVIEW_PARTIAL、REVIEW_COMPLETED 使用同一 v2 Package；不得再建立或依賴 Review Progress 專屬 JSON，暫停與跨版本續作一律使用 `REVIEW_PARTIAL` Package。
8. Schema 檔由 Cloud AI、HTML、JAA 與驗證器共同使用；日常雲端分析由 Manifest 與 Template 明確引用其契約身分。

## 17. Source Trace 不可變與資料責任

### 17.1 唯一來源

Pending Analysis JSON 是 Source Trace 的唯一來源。分析器必須逐筆原樣保留 Pending 已提供的完整 `reference`、`diff`、`integrity`，以及 Package-level `sourceDatabase`、`sourceView`、`querySnapshot` 與 `exportMetadata`。

不得只挑出分類所需欄位，也不得因欄位無法理解而刪除、重排、正規化、縮寫、翻譯或重建來源資料。

### 17.2 Mutation Boundary

- Cloud AI 只能新增或更新 `records[].aiAnalysis`。
- Cloud AI 不得修改 `sourceTrace`。
- HTML 人工驗收只能新增或更新 `records[].manualReview`。
- JAA 只能新增 Import、Database、Link Attempt 與查詢狀態。
- `UNKNOWN`、`EXCLUDED` 與沒有 Skill Finding 的 Record 仍必須完整保留 Source Trace。

Source Trace 缺失屬於 Package Contract Error，不能以 `UNKNOWN`、`EXCLUDED` 或低 Confidence 代替。

### 17.3 Evidence 與來源資料

Skill Evidence 必須引用目前 Record Source Trace 中實際存在的文字與 JSON Pointer。AI 生成的 Explanation、Rationale、Summary 或人工備註不得反過來成為原始 Evidence。

### 17.4 Hash 邊界

Hash 只能作為選用的 Integrity Receipt，用來比較某份資料與一個既有可信任摘要是否改變。Hash 不得用於：

- 判斷 AI Record 與原始 SQLite Record 是否有關聯。
- 建立 Primary／Fallback Source Link。
- Relink 候選選擇。
- 判斷資料是否可追溯。
- 阻止 Identity 已命中的 Integrated Result 顯示。

AI Status、Skill Findings、Confidence、Rationale、Manual Review、Rule／Template Version、Import Batch 與 Database Path 均不得混入 Source Trace Integrity Receipt。

## 18. 版本紀錄

### v2.6.0

- 綁定 Rule Set Manifest v1.6.0 與 HTML Template v1.13.1。
- 移除 Review Progress 專屬 JSON 的續作用途；三種 Review Rank 統一使用同一 Package v2。
- Skill 分類語意、279 個 Skill ID 與 Evidence 判斷不變。

### v2.5.0

- 分類語意與 v2.4.0 相同，不重判既有規則。
- 新增 Lossless Source Trace、Mutation Boundary、Evidence 來源限制與 Hash 非關聯規則。
- 正式輸出升級為 `jaa-ai-analysis-package v2.0.0`。
- 明定首次分析輸出為 `AI_ONLY`，人工驗收只能修改 `manualReview` 層。



### v2.3.0

- 依完成的 65/65 Review JSON v1.3.0，補強 GCRead、COP0、RCQ 與 Flash Cop0 的跨 Group 邊界。
- 簡短 `COP0API_SendSQ_GCRead*`／`FTLGCReadDataByRCQ*` 優先支持 `GC_006`，不得只靠 token 自動建立 `RW_002`／`RW_005`。
- 有 COP0SQ 內部功能、初始化、attribute 或功能搬移時，必須額外檢查 `FLASH_002`。
- 單純「上 Code 到 Develop_Test 燒機未再出現」而沒有修正內容或 Branch 維護決策，明定為 completion／verification-only，不能建立 `DEBUG_007`。

### v2.2.0

- 依 Review JSON v1.2.0 的 17 筆契約回歸結果，新增跨 Skill Evidence 覆蓋檢查。
- 明定同一個 `sourceJsonPointer + quote` 若直接支持多個既有 Skill，必須出現在每個相關 Finding 的 `evidence[]`。
- 明定已存在的 Skill 只能補充 Evidence，不得重複建立 Skill Finding，也不得誤列為漏判 Skill。
- 新增 Debug 與領域 Skill 的雙向 Evidence 關聯檢查，以及 `GC_006 + DEBUG_004`、`GC_007 + DEBUG_004` 範例。
- 明定 `additionalEvidenceAssignments` 只屬於人工 Review JSON，正式分析結果必須直接整合到既有 Finding。

### v2.1.0

- 將 `CLASSIFIED` 明確限定為 Record 層級「至少一個 Skill 可保留」，不等同所有 Skill Findings 都正確或沒有遺漏。
- 依 17 筆人工驗收結果補強 DriveLog 資料來源與 `SYSTEM_029` 實際解析能力的界線。
- 明定 `GC_*_LOG`／`XX_LOG` 只有在欄位、值、狀態或時序被實際判讀時才支持 `SYSTEM_029`。
- 將「經檢查確認為相同／相似問題」納入 `DEBUG_001` 候選，但禁止帶入連結 Issue 的領域內容。
- 明定 Debug Skill 不取代 GC 等領域 Skill，兩者有獨立 Evidence 時可以共存。

### v2.0.0

- 從 v1.6.6 移除所有 JAA Host、Bridge、Provider lifecycle、Artifact、Canonical、HTML、SQLite、Debug 與測試規格。
- 改為可直接分析原始 Pending Analysis JSON，不依賴預先產生的 Evidence Quote Catalog。
- Evidence 改用 `sourceJsonPointer + exact quote`，便於人工檢查。
- 將 Catalog 完整度從 Record Status 分離為每個 Skill Finding 的 `catalogSupport`。
