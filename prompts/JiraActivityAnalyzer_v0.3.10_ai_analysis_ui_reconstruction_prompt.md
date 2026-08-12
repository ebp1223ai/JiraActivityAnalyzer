# Jira Activity Analyzer v0.3.10 — AI Analysis UI Reconstruction & Functional Alignment

## Codex 正式完整實作 Prompt

請在既有 `JiraActivityAnalyzer` repository 內，基於已完成實作、測試、Windows 封裝並 Push 的 **v0.3.9 ChatGPT Provider Functional Replacement**，完成 **v0.3.10 AI Analysis UI Reconstruction & Functional Alignment**。

本版的唯一主要目標是：

> 以使用者提供的 `JiraActivityAnalyzer_v0.3.9_ChatGPT_Final_Static_UI(1).html` 為 AI Analysis 唯一 UI／UX 視覺基準，重構正式 Electron App 的「AI 分析」頁面及其三個子分頁，並把靜態稿中的操作完整接回既有真實功能；除 AI Analysis 直接依賴的 main／preload／renderer／provider／rules／analysis／export／SQLite 程式外，不得任意改動其他頁面、導覽、資料流程或既有功能。

這不是靜態 UI 任務，也不是只做畫面。所有按鈕、路徑、狀態、診斷、分析、進度、取消、JSON 產出、結果載入、報告、SQLite 與錯誤顯示都必須是真實功能。

除非遇到未解決錯誤、資料安全風險、權限阻擋、必要測試失敗，或必須由使用者決定的重大產品歧義，否則不要停在原始碼、測試或 Build；必須一路完成測試、Build、Windows Installer／Portable 封裝、有限時間的 packaged smoke、執行時間／Token 帳、精準 Commit 與 Push。

---

## 一、版本、分支與基準

- Target Version：`v0.3.10`
- Theme：`AI Analysis UI Reconstruction & Functional Alignment`
- 預定 Branch：`feat/v0.3.10-ai-analysis-ui-reconstruction`
- 基準：remote 上已 Push、包含完整 v0.3.9 ChatGPT functional replacement 的最新安全 commit。
- 已知 v0.3.9 回報 HEAD：`f07675f3953d1c8f3c14abe4a2703a60e994241d`。
- 已知 v0.3.9 implementation commit：`fc10c3be7e78b7ee3967e81fc2f07d6fcb30b17c`。
- 上述 commit 只供核對，不可在未檢查 remote 前直接假設為當前基準。
- 不建立 Tag，不建立 GitHub Release。

執行前必須：

1. `git fetch --all --prune`。
2. 顯示並記錄 repository 的完整絕對路徑、remote、目前 branch、HEAD、upstream、ahead／behind。
3. 確認實際基準包含 v0.3.9 的 ChatGPT Codex App Server、AI Nexus、Offline Rule、AI Analysis DB、export 與 packaging 實作。
4. 記錄 `git status --short`、tracked diff 與 untracked 清單。
5. 若工作樹已有使用者修改，必須保留；不得覆蓋、刪除或順手提交。
6. 若 v0.3.9 remote HEAD 已前進，以包含完整 v0.3.9 功能的最新安全 commit 為準，並在最終回報列出實際基準。

---

## 二、靜態 UI 基準檔與使用方式

使用者會提供下列附件：

```text
JiraActivityAnalyzer_v0.3.9_ChatGPT_Final_Static_UI(1).html
```

Codex 開始修改前必須：

1. 找到附件在實際執行環境中的檔案。
2. 使用 `Resolve-Path` 或等價方式取得其**完整絕對路徑**。
3. 在執行紀錄與最終回報列出該完整絕對路徑。
4. 讀取並實際開啟／渲染此 HTML，逐一核對三個 AI Analysis 子分頁。
5. 若找不到檔案，不可改用記憶重畫；應停止實作並回報缺少基準檔。

基準檔只用於 UI／UX 與互動契約，不得：

- 直接以 `iframe` 嵌入正式 App。
- 把附件內的 bundled React、synthetic data、Base64 報告或假計時器直接複製進產品。
- 建立第二套平行 router、CSS framework 或 UI shell。
- 讓正式版顯示 `UI prototype`、假帳號、假方案、假額度、假分析結果、假路徑或固定統計數字。

正式實作必須使用 repository 現有的 Electron、React、TypeScript、Tailwind／design tokens、HashRouter、main／preload IPC、SQLite、provider 與 export 架構，把靜態 UI 的版面與操作轉成真實功能。

### 2.1 UI 優先順序

本版衝突處理順序如下：

1. 本 Prompt 的功能、安全、資料與驗收要求。
2. 使用者提供的 v0.3.9 Final Static UI 之 AI Analysis 畫面與互動。
3. v0.3.9 已完成且仍正確的真實功能與資料契約。
4. repository 既有共用元件與視覺規則。

不得用「既有程式比較方便」為理由忽略靜態 UI；也不得用「靜態 UI 有示意資料」為理由把假資料帶入正式版。

---

## 三、修改範圍與禁止範圍

### 3.1 本版必須修改

- AI Analysis route、sidebar entry 與三個子分頁。
- AI Analysis renderer components、state、hooks、types 與 styles。
- 為真實 UI 行為所需的 preload bridge 與 typed IPC。
- ChatGPT Codex App Server UI state mapping。
- AI Nexus 設定、診斷與執行狀態的 UI mapping；保留既有通訊契約。
- Offline Rule Analyzer 的規則驗證與執行狀態。
- 共用分析依據 folder／Manifest／Catalog／Common Rules 載入器。
- Pending Analysis JSON import、validation 與完整路徑保存。
- Analysis run、progress、cancel、completed-only JSON／SQLite persistence。
- Analyzed JSON import、result viewer、review、report 與 export。
- 直接覆蓋上述功能的測試、文件、版本、Changelog、時間／Token 帳與 packaging 設定。

### 3.2 除必要相依外不得修改

- Dashboard。
- Connections & Data Source。
- Import。
- Timeline。
- User Viewer。
- Issue Viewer。
- Activity Stream Probe／Jira Probe。
- Jira fetch、Full Fetch、DB merge、timeline parsing 或其他與 AI Analysis 無關的資料流程。
- 既有 SQLite 正式 Jira 資料內容與 schema 語意。
- 全域視覺主題、sidebar 其他項目、topbar 或 route 命名。
- 無關 dependency。

若共用元件必須修改，必須證明其他頁面沒有視覺或行為回歸。

### 3.3 禁止事項

- 不得恢復 OpenAI API Provider、API Key、OpenAI Base URL 或 `api.openai.com` direct call。
- 不得改用 ChatGPT 網頁 Cookie、Local Storage 或非官方 Token。
- 不得把 ChatGPT 登入憑證寫入 `.env`、SQLite、renderer state、logs、diagnostics、export 或 debug folder。
- 不得讓 ChatGPT 執行 Shell、PowerShell、Git、任意檔案讀寫、MCP、Plugin、Skill 或工具呼叫。
- 不得讓模型自行掃描 Jira DB、APP_ROOT、使用者目錄或分析依據資料夾。
- 不得以固定 timeout、假進度、假 token、假 response 或 toast 冒充成功。
- 不得以檔名代替完整路徑。
- 不得在結果頁重新加入「下載已分析 JSON」。

---

## 四、正式 UI 架構

AI Analysis 必須維持為 sidebar 中獨立區域與單一入口，進入後固定顯示三個子分頁，順序、名稱與靜態 UI 一致：

1. `AI 連線與診斷`
2. `分析工作區`
3. `Activity Events 分析結果`

要求：

- 不新增第四個子分頁。
- 不恢復已移除的右上角診斷快捷按鈕。
- 不恢復已移除的右側 `ANALYSIS DETAIL` 面板。
- route、deep link、重新整理 hydration 必須正常。
- 窄視窗可 RWD，但桌面寬度下的卡片順序、資訊層級、留白、色彩與表格密度應貼近靜態 UI。
- 所有互動元件必須有可辨識 label／aria label；不得只靠顏色表達狀態。
- 錯誤不得顯示 `undefined: undefined`、`[object Object]` 或未處理 stack。

預設進入哪個子分頁應沿用既有 route／使用者偏好；若沒有可用偏好，使用靜態 UI 的預設值。不得為了展示而強制切到假成功狀態。

---

## 五、第 1 頁：AI 連線與診斷

### 5.1 Provider 範圍

正式 active providers 固定為：

```ts
type ActiveAiProvider = "chatgpt_codex" | "ai_nexus" | "offline_rule";
```

`AI 連線與診斷` 頁面主要顯示：

- ChatGPT。
- AI Nexus／地端 AI。

Offline Rule Analyzer 不需網路連線，但其規則可用狀態必須在分析工作區顯示。

### 5.2 ChatGPT 區塊

UI 依靜態稿顯示並由真實狀態驅動：

- Provider：`ChatGPT`，唯讀。
- 帳號狀態：分開呈現 `Signed out`、`Signing in`、`Signed in`、`Connected`、`Unavailable`、`Error`。
- ChatGPT 方案：由 app-server 帳號資料提供；不可預設硬編碼 `Pro`。
- Model：由 `model/list` 動態載入；支援 `Auto` 與帳號實際可用模型，不得把不存在的模型寫死為可用。
- Codex Runtime：顯示實際 bundled runtime 版本，不可硬編碼 UI 稿中的 `0.147.0`。
- Codex 額度：由 `account/rateLimits/read`／notification 顯示可用資料、重置時間與最後更新時間；官方未提供的欄位顯示 `Unavailable`，不可猜測。
- Prompt Template：載入實際模板清單與目前版本。
- 資料遮罩：保留 Standard／Strict／None 的既有產品定義；實際送出前必須由 main process 套用。
- 傳送範圍保護：清楚顯示只傳送已選取 Pending Dataset 中的最小化 Diff／Evidence payload。

ChatGPT 操作必須依狀態提供：

- `使用 ChatGPT 登入`
- `取消登入`
- `重新載入 ChatGPT 帳號`
- `登出`
- `執行完整診斷`

登入、帳號、模型與額度須沿用 v0.3.9 官方 Codex App Server 實作，至少正確處理：

```text
initialize / initialized
account/read
account/login/start (type = chatgpt)
account/login/completed
account/login/cancel
account/logout
account/updated
account/rateLimits/read
account/rateLimits/updated
account/usage/read（runtime 支援時）
model/list
```

以實際封裝 runtime 產生的 protocol schema 為準，不可只依此 Prompt 猜 payload。

### 5.3 AI Nexus 區塊

保留靜態稿與 v0.3.9 既有欄位及真實功能：

- Runtime／Provider。
- Endpoint URL。
- Model ID。
- API contract／generic compatible contract。
- Auth type。
- Access Token。
- timeout、Max Output Tokens、Temperature 等既有設定。
- `.env` 載入／保存與 connection test。

AI Nexus Token 必須透過實際 `.env` 管理；Renderer 只能接收遮罩後狀態，不得回讀明文 Token。不得因移除 OpenAI Provider 而破壞 AI Nexus 所需的 provider-neutral Chat Completions codec。

### 5.4 完整診斷

診斷畫面依靜態稿保留七個階段，但每一階段必須是真實結果：

1. 設定完整性。
2. 網路與 TLS／runtime transport。
3. 身分驗證。
4. 模型可用性。
5. 最小請求。
6. 回應契約。
7. 診斷紀錄落盤。

ChatGPT 診斷只可送出固定、非機密、完全不含 Jira／Activity Event／技能表／規則內容的 fixture。AI Nexus 診斷同樣不得包含 Token 或 Authorization Header。

診斷 UI 必須：

- 顯示每階段 `pending/running/passed/failed/skipped`。
- 顯示開始時間、結束時間、耗時、provider、model、run id。
- 失敗時顯示穩定 error code、可讀訊息與下一步。
- 可執行取消，且狀態不會誤報成功。
- 保存 sanitized summary、event log、sanitized request、raw response（必須先移除 secret）。
- 顯示診斷資料夾與每個輸出檔案的**完整絕對路徑**。

### 5.5 測試對話

保留 ChatGPT／AI Nexus 的手動測試對話：

- 使用者輸入純文字。
- 送出前執行敏感格式檢查。
- 顯示串流文字、執行時間與可取得的 token usage。
- 可取消執行。
- Request／Response 依既有診斷規則保存，並顯示完整輸出路徑。
- ChatGPT thread 必須是 dedicated、ephemeral、read-only、tool-disabled。
- 測試對話不得與正式 Jira 分析 thread 共用。

---

## 六、第 2 頁：分析工作區

畫面順序與靜態 UI 一致：

1. 共用分析依據。
2. 選擇分析方式。
3. 選擇資料檔。

### 6.1 共用分析依據

使用者選擇一個分析依據資料夾。UI 必須顯示：

- 資料夾的完整絕對路徑。
- Manifest 實際綁定的三個檔案。
- 每個檔案的完整絕對路徑。
- 檔名、版本、大小、mtime、SHA-256、validation status。
- Catalog 記錄總數、唯一 Skill ID 數、重複 Skill ID 數。
- 最近驗證時間。

正式需要的三個檔案為：

```text
Skill_Analysis_Rule_Set_Manifest.md
Skill_Catalog_v0.3.0.md
Skill_Classification_Common_Rules_v1.1.0.md
```

實際檔名與版本由 Manifest 解析，不得永遠寫死；上述名稱是本次基準資料的預期值。

### 6.2 Manifest 是唯一載入來源

必須修正 v0.3.9 已觀察到的重複 Skill ID 誤判風險：

1. 選取資料夾後，先解析一份 canonical Manifest。
2. 由 Manifest 明確解析 Catalog 與 Common Rules 路徑。
3. 每個 canonical absolute path 在單次 validation／run 中最多載入一次。
4. 不得同時用「Manifest 引用」和「資料夾遞迴掃描」把同一檔案加入兩次。
5. 不得把上一次選擇的解析結果 append 到新狀態；每次 reload／reselect 前先建立新的 immutable snapshot。
6. Windows 路徑去重必須處理大小寫、`.`／`..`、separator、symbolic link／junction 可解析範圍。
7. Loader 內部以 canonical file identity 去重，但不得以去重掩蓋兩筆真正不同的 Catalog record 使用相同 Skill ID。

重複檢查至少包含：

- 原始字串完全相同。
- trim 後相同。
- Unicode 正規化後相同。
- case-insensitive 相同（即使正式規格為 case-sensitive，也必須警告容易混淆的 ID）。

若重複真的存在，UI 必須列出：

- error code，例如 `ANALYSIS_RULES_DUPLICATE_SKILL_ID`。
- 重複 Skill ID。
- 每一筆定義的完整檔案路徑。
- 行號／record index。
- 載入來源：Manifest reference、manual file 或其他合法來源。

不得只顯示：

```text
Duplicate catalog skill IDs are not allowed.
```

也不得顯示 `undefined: undefined`。

若使用本次提供的 279 筆 Catalog，預期必須得到：

```text
Catalog records: 279
Unique Skill IDs: 279
Duplicate Skill IDs: 0
```

此數字必須由實際解析結果計算，不可硬編碼為成功條件。

### 6.3 分析依據驗證與保存

- `重新驗證` 必須重新讀檔、重新計算 hash，不能只切 UI state。
- 驗證失敗時三種 Analyzer 均不可開始分析。
- 每次 analysis run 必須保存本次實際使用的三個檔案 snapshot metadata 與 SHA-256。
- 不以資料夾名稱或版本資料夾路徑代替檔案版本。
- 分析依據路徑可在 APP_ROOT 外，但必須是使用者明確選取或 `.env`／既有設定明確指定的絕對路徑。
- Git 不得管理實際公司規則內容，除非該檔原本就是已核准的 tracked test fixture。

### 6.4 選擇分析方式

保留三張 Analyzer 卡：

1. `ChatGPT 分析`
2. `地端 AI 分析`／`AI Nexus`
3. `離線分析`／`Offline Rule Analyzer`

切換 Analyzer 時：

- 不清除已驗證的共用分析依據。
- 不清除已選 Pending Dataset。
- 不用假狀態覆蓋 Provider readiness。
- 顯示該 Provider 的設定與最近一次有效診斷結果。
- 不同 Analyzer 的 run 與結果不可互相覆蓋。

開始分析前的必要條件必須分開計算並顯示：

- `rulesReady`
- `datasetReady`
- `providerConfigured`
- `providerAuthenticated`
- `providerConnected`
- `modelAvailable`
- `databaseReady`
- `noActiveRun`

Offline Rule Analyzer 不要求 provider authentication／network，但仍要求 rules、dataset、database 與 no active run。

若不能執行，按鈕附近只列出實際未通過條件；不得用混合句讓使用者誤以為 ChatGPT 未登入。

### 6.5 選擇待分析資料檔

本區只匯入與顯示 Pending Analysis Dataset JSON。

要求：

- 使用 Electron main process 的 file dialog 取得真實完整路徑；不可依賴瀏覽器環境可能不存在的 `File.path`。
- 僅接受支援的 Pending Analysis JSON schema。
- 讀檔、schema、source identity、counts、hash 與 Evidence identity 必須驗證。
- 左側清單顯示檔名、分析對象、Events、匯入時間；不要加入無意義序號。
- 右側摘要固定顯示該檔案的**完整絕對路徑**，不可只顯示檔名。
- 路徑過長時可以視覺換行或水平捲動，但 DOM／tooltip／copy value 必須保留完整內容，不可中間截斷後失去原值。
- 右側摘要顯示分析對象、日期範圍、Activity Events、Issues／Projects、Jira Server、來源 DB identity、檔案大小、SHA-256 與 integrity status。
- Preview 的前四筆資料必須來自實際檔案，不可使用 synthetic events。
- `檢查檔案完整性` 必須重新驗證，不可只顯示成功 toast。

選取新檔案只改變目前 Pending selection；不得把已分析 JSON 混入本頁清單。

### 6.6 開始分析

按下 `使用 <Analyzer> 開始分析` 後必須：

1. 在 main process 建立唯一 `analysisRunId`。
2. 重新鎖定 rules snapshot、dataset snapshot、provider snapshot 與輸出路徑。
3. 在真正執行前完成 preflight；失敗則不得建立 completed result。
4. 立即切換到 `Activity Events 分析結果`。
5. 顯示即時分析進度、階段、已完成／總數、成功／失敗／待覆核、耗時與目前 Provider。
6. 進度必須來自實際 queue／batch／turn events，不可使用固定百分比或 `setTimeout` 模擬。
7. 顯示 `取消分析`；取消必須傳到實際 provider／queue。
8. 預先計算並顯示本次預定 JSON 的完整絕對路徑。
9. 完成後直接產生 analyzed JSON，不要求使用者再按下載。

輸出檔名以靜態 UI 概念為基準：

```text
分析-<原 Pending Dataset 檔名>.json
```

實作時必須安全處理：

- 非法 Windows 字元。
- 同名 collision。
- 過長檔名。
- Unicode。
- 原檔名已帶 `分析-` 前綴。
- 同一來源以不同 Analyzer／model／run 執行。

可在必要時加入時間、run id 或短 hash，但 UI 與 JSON metadata 必須清楚保留 source filename 與 source full path。

### 6.7 completed-only 與原子寫入

- 執行中資料只可寫入 run-scoped staging／temporary path。
- 寫檔使用 atomic temp + fsync／close + rename 的平台安全策略。
- 只有所有必要 records 完成、schema validation 通過、count conservation 通過、hash 可重讀時，才建立 final analyzed JSON 並寫入正式 AI Analysis SQLite。
- `cancelled`、`failed`、`partial`、timeout 或 app-server crash 不得寫入 final analyzed JSON，也不得進入正式分析結果表。
- 失敗 run 的 sanitized diagnostics／failure manifest 可保留於既有 debug／staging 規則中，並顯示完整路徑。
- 不得覆寫來源 Pending JSON。

---

## 七、第 3 頁：Activity Events 分析結果

### 7.1 執行中狀態

由分析工作區開始後，本頁上方必須立即顯示：

- `analysisRunId`
- source filename
- source full path
- analyzer／provider
- model／rule engine version
- rules snapshot id
- 開始時間
- 已耗時間
- 完成／總數
- batch／stage
- token usage（可取得時）
- 預定 output JSON 的完整絕對路徑
- progress bar
- `取消分析`

結果可逐步呈現於記憶體 UI，但 final JSON 與正式 SQLite 仍遵守 completed-only。

### 7.2 完成摘要與 JSON

完成後上方顯示：

- `分析已完成，已自動產生資料檔`
- final filename
- final JSON 完整絕對路徑
- 實際 file size、SHA-256、completed time
- source count、result count、candidate、review、excluded／unknown 統計
- provider、model、prompt、rules snapshot、duration、input／output／total tokens（若 provider 提供）

所有數字必須由 final JSON／run result 動態計算，不可保留靜態稿中的固定 `117`、`190`、`66`、`10`、`41`、`279`。

### 7.3 選擇已分析資料檔

本頁允許匯入既有 Analyzed Activity Events Dataset JSON 供檢視。

要求：

- `選擇資料檔` 標題左側**不顯示步驟編號或序號**。
- 左側清單不顯示無意義序號。
- 右側摘要顯示已分析 JSON 的**完整絕對路徑**。
- 使用 main-process dialog 取得真實路徑。
- 匯入後驗證 schema、hash、source identity、rules snapshot、counts 與完成狀態。
- 只接受 `completed` 且可驗證的 analyzed dataset；Partial／Cancelled／Failed 不得當成正式結果載入。
- 不提供「下載已分析 JSON」按鈕；這裡是匯入／查看既有 JSON，不應再下載一次。
- 可提供 `開啟所在資料夾`、`複製完整路徑` 或 `重新驗證`，但必須安全且使用真實路徑。

### 7.4 Activity Events 分析成果

保留靜態稿的結果摘要與兩個內容區：

1. `逐筆分析結果`
2. `技能分析報告`

逐筆結果必須支援：

- 全部、技能候選、需要覆核、排除／資訊不足篩選。
- 搜尋 Issue、actor、field、skill id、skill name、evidence text。
- 大量資料的分頁或虛擬化；不得一次 render 數萬筆造成 UI freeze。
- 顯示 Activity Event ID、Issue、時間、field、Diff 摘要、skills、score／confidence、classification status、review status。
- 展開原始 Diff Evidence、判定理由、positive signals、negative checks、evidenceRefs、hash／identity。
- Skill ID 必須可追溯回本次 rules snapshot 中的 Catalog record。
- 不得把 AI 建議自動視為人工確認。

### 7.5 人工覆核

- 所有 AI 結果初始為 `PENDING_REVIEW`，除非既有明確規則另有定義。
- 支援確認、駁回、修改技能、加入備註與 undo／audit history。
- 每次覆核保存 reviewer、timestamp、before／after、reason。
- 覆核不得改寫原始 Evidence 或 provider raw result。
- 關閉 App 再開啟後覆核狀態仍可從 AI Analysis SQLite 恢復。

### 7.6 技能分析報告

- 直接使用目前選取的 analyzed JSON 產生報告，不要求再次匯入。
- 產生 self-contained HTML report；若既有功能另支援 CSV，保留它。
- 報告包含 summary、filters、逐筆結果、Skill Catalog lookup、rules／provider／source snapshot 與必要 Evidence。
- 報告中不得包含 ChatGPT credential、AI Nexus Token、Authorization Header、未遮罩路徑中的敏感值或未選取 Jira 原文。
- 產生後顯示 report 的完整絕對路徑、大小與 SHA-256。
- 報告檔名 collision-safe，且不得覆寫既有檔案而不提示。

---

## 八、ChatGPT 正式分析契約

### 8.1 App Server 架構

沿用 v0.3.9 已完成的 bundled Codex App Server。Electron main process 是唯一可啟動、監督與通訊的層；Renderer 不得直接 spawn process 或持有 protocol connection。

至少需要：

```text
thread/start 或既有相容建立方式
turn/start
item/agentMessage/delta
item/completed
thread/tokenUsage/updated
turn/completed
turn/interrupt
thread/delete
```

以 bundled runtime 的 generated schema 為準。Runtime 版本需 exact pin；不要在本版無理由升級。若必須升級以修正 blocker，先完成 schema compatibility、package content 與 regression 驗證，並在最終回報清楚說明。

### 8.2 安全執行範圍

- 使用 dedicated empty workspace。
- thread 為 ephemeral／read-only。
- tools、shell、filesystem、MCP、plugins、skills、web search、image、browser 全部禁止。
- approval policy 不得允許模型要求任意工具。
- 模型只能收到 main process 建立的 prompt 與最小 payload。
- 結束、取消、失敗後清理 thread；清理失敗要記錄但不得洩漏內容。

### 8.3 最小輸入

只送出目前選取 Pending Dataset 中分析所需資料，例如：

- stable Activity Event／Evidence ID。
- Issue key 或已定義的最小 reference。
- actor stable identity（依 masking policy）。
- field name、event time。
- added／removed Diff。
- 必要上下文。
- 本次 rules snapshot 中需要的規則與 Catalog entries。

禁止送出：

- 整個 SQLite。
- 完整 Full Fetch archive。
- 未選取 issue／event。
- 本機完整路徑。
- `.env`。
- ChatGPT／AI Nexus credential。
- 不必要附件與公司資料。

### 8.4 Structured output

AI response 必須先通過嚴格 schema validation，至少包含既有正式欄位：

```text
activityEventId / evidenceId
analyses[]
group
skillId
skillName
score
confidence
confidenceReason
positiveSignals[]
negativeChecks[]
evidenceQuote / evidenceRefs[]
classificationStatus
exclusionReason
reviewStatus
```

- 不接受 Markdown code fence 當作已驗證 JSON。
- 未知欄位、缺欄、型別錯誤、不存在 Skill ID、Evidence 不匹配必須明確失敗或進入 bounded repair。
- Repair 次數有限，且每次 request／response／token／duration 都計入 run ledger。
- 模型輸出不得直接改寫 Catalog 或 Common Rules。

### 8.5 Batching、順序與守恆

- 大型 dataset 必須 bounded batching，不可整份無限制塞入單一 turn。
- 保留來源順序與 stable identity。
- retry 不得產生重複 records。
- 成功完成時，input／processed／success／excluded／failed／output 的守恆關係必須可驗證。
- 某 batch 永久失敗時整個 run 不得標記 completed；保留 failure manifest 供除錯。

---

## 九、AI Nexus 與 Offline Rule Analyzer

### 9.1 AI Nexus

- 保留 v0.3.9 真實 connection test、diagnostics、analysis、cancel、timeout、retry、token usage 與 export。
- UI 改為靜態稿配置，但不得改變既有 endpoint／contract 語意。
- Access Token 僅由 `.env`／main process 處理。
- 與 ChatGPT 使用同一份已驗證 rules snapshot 與 Pending Dataset contract。

### 9.2 Offline Rule Analyzer

- 完全不呼叫網路或 AI。
- 使用相同 Manifest／Catalog／Common Rules snapshot。
- 輸出同一正式 analyzed JSON envelope，provider-specific metadata 可不同。
- 結果 deterministic；相同 input 與 rules hash 應得到相同分類內容。
- 必須通過「279 records／279 unique／0 duplicate」fixture 測試，但不得將 279 寫死到產品邏輯。

---

## 十、路徑處理的統一規則

本版所有與檔案相關的 UI、紀錄與最終回報都必須提供完整絕對路徑。

至少涵蓋：

- 靜態 UI 基準檔。
- 分析依據資料夾。
- Manifest、Catalog、Common Rules。
- Pending Analysis JSON。
- Analysis staging／failure manifest。
- final Analyzed JSON。
- 已匯入 Analyzed JSON。
- HTML／CSV report。
- diagnostics folder 與檔案。
- AI Analysis SQLite。
- Installer、Portable、win-unpacked EXE。
- screenshots／test artifacts。
- execution time／token ledger。

實作要求：

- 路徑由 main process 解析與驗證。
- Renderer 不自行把檔名拼成假路徑。
- JSON metadata 同時保存 `fileName` 與 `absolutePath`；若安全匯出政策要求遮罩，另存 display／redacted 欄位，不能混淆真實本機狀態。
- UI 可提供複製完整路徑；複製值必須與畫面選取檔一致。
- 所有 `Open folder` 操作先驗證目標存在且是預期範圍。
- Portable APP_ROOT containment 規則沿用既有設計，不得回退 `%LOCALAPPDATA%` 產生未授權檔案。

---

## 十一、JSON 與 SQLite

### 11.1 Analyzed JSON envelope

沿用既有 v0.3.9 schema 並補足 UI 所需欄位，不可無理由破壞相容性。至少保存：

- schema／format version。
- export id。
- analysisRunId。
- status：只有 `completed` 可作正式結果。
- source filename、source absolute path、source SHA-256、source DB／Jira server identity。
- source counts 與 query／selection snapshot。
- rules Manifest／Catalog／Common Rules filename、absolute path、version、SHA-256。
- analyzer type、provider id、runtime、model、prompt template／hash、masking policy。
- startedAt、completedAt、durationMs。
- request／batch／retry counts。
- input／output／total tokens（可取得時）。
- records 與 analyses[]。
- summary／disposition counts。
- review state summary。

讀取舊版 analyzed JSON 時應提供向後相容；缺少新欄位顯示 `Unavailable`，不可捏造。

### 11.2 AI Analysis SQLite

- Jira 原始 SQLite 維持唯讀。
- AI Analysis 使用既有獨立 SQLite／tables。
- 只有 completed run 與 validated final records 可寫入正式表。
- review audit 使用 transaction。
- DB migration 必須有 version、backup／rollback 或既有安全機制，並測試舊 DB 開啟。
- 不把 ChatGPT credential、AI Nexus Token、Authorization Header、完整 prompt secret 寫入 DB。

### 11.3 自動 JSON 與 DB 一致性

- final JSON 與 DB records 必須共用同一 `analysisRunId`、source hash、rules snapshot hash 與 counts。
- 任一方寫入失敗時不得把 run 標記 completed。
- 重新開啟 final JSON 與查詢 DB 後必須可交叉驗證。

---

## 十二、`.env` 與秘密管理

沿用 `ENV_FORMAT_VERSION=4`，除非本版真的新增不相容 env schema；不可只因版本升到 v0.3.10 就提高 ENV format。

- Git 只管理 `.env.version`。
- `.env.version` 必須維持安全預設值與中英註解。
- `.env` 不得加入 Git。
- 操作者由 `.env.version` 複製成 `.env` 後自行填值。
- AI Nexus Endpoint／Model／Token 等既有欄位維持 `.env` 流程。
- ChatGPT credential 不進 `.env`。
- 專用 `CODEX_HOME`、keyring 與 credential store 沿用 v0.3.9 安全設計。
- diagnostics、debug、export、renderer、IPC 與 logs 不得出現 secret 明文。

若本版不需修改 `.env.version`，不得為了製造 diff 而修改。

---

## 十三、IPC、狀態機與錯誤契約

### 13.1 Typed IPC

- Renderer 只透過 context-isolated preload API 呼叫 main process。
- 所有 request／response／event 都有 TypeScript type 與 runtime validation。
- 不暴露 raw `ipcRenderer`、child process、filesystem handle 或 Codex transport。
- run-scoped subscription 必須在切頁、取消、完成與 unmount 時清理。
- late event 不得污染新 run。

### 13.2 Analysis run states

至少定義：

```text
idle
preflighting
queued
running
cancelling
completed
cancelled
failed
```

狀態轉移必須可驗證，terminal state 不可回到 running。切換子分頁後再返回必須 hydrate 當前 run 的真實狀態與進度。

### 13.3 Error codes

至少涵蓋：

```text
ANALYSIS_RULES_FOLDER_NOT_FOUND
ANALYSIS_RULES_MANIFEST_MISSING
ANALYSIS_RULES_MANIFEST_INVALID
ANALYSIS_RULES_FILE_MISSING
ANALYSIS_RULES_HASH_MISMATCH
ANALYSIS_RULES_DUPLICATE_SKILL_ID
ANALYSIS_DATASET_INVALID
ANALYSIS_DATASET_SOURCE_MISMATCH
ANALYSIS_PROVIDER_NOT_CONFIGURED
ANALYSIS_PROVIDER_NOT_AUTHENTICATED
ANALYSIS_PROVIDER_NOT_CONNECTED
ANALYSIS_MODEL_UNAVAILABLE
ANALYSIS_ALREADY_RUNNING
ANALYSIS_CANCELLED
ANALYSIS_TIMEOUT
ANALYSIS_RESPONSE_SCHEMA_INVALID
ANALYSIS_RESPONSE_EVIDENCE_MISMATCH
ANALYSIS_OUTPUT_WRITE_FAILED
ANALYSIS_DATABASE_WRITE_FAILED
CHATGPT_RUNTIME_UNAVAILABLE
CHATGPT_LOGIN_REQUIRED
CHATGPT_RATE_LIMITED
AI_NEXUS_AUTH_FAILED
```

每個錯誤 UI 至少顯示：

- code。
- 可讀訊息。
- 發生階段。
- 是否可重試。
- 建議下一步。
- sanitized detail。
- 相關檔案存在時顯示完整路徑。

不得把 secret、raw OAuth、Authorization Header、完整敏感 request 或 stack trace 直接呈現給一般使用者。

---

## 十四、取消、Timeout、Retry 與 Recovery

- 使用者取消後立即進入 `cancelling`，禁止新 batch／turn。
- ChatGPT 呼叫 `turn/interrupt`，等待 bounded terminal event；必要時終止專用 app-server 並重新建立乾淨 session。
- AI Nexus 使用 AbortController／既有取消機制。
- Offline Rule 停止 queue 並釋放資源。
- timeout 分為 provider connect、first response、idle stream、per batch、whole run；沿用既有可設定上限。
- 只有 transient network、429、5xx、runtime restart 等既有安全類別可 bounded retry。
- 401／403、invalid schema、duplicate Skill ID、source mismatch 不自動盲目重試。
- retry 使用 stable idempotency／batch identity，避免重複結果。
- App crash／reload 後不得把未完成 run 誤標 completed；可恢復顯示 failure／cancelled 狀態，但本版不新增未經決議的 Resume 功能。

---

## 十五、測試要求

先檢查 repository 既有測試命令與命名慣例，再新增 `v0.3.10` 專屬測試。不得只改舊測試讓它通過；必須測到真實契約。

### 15.1 Unit tests

至少包含：

- Manifest 解析與三檔綁定。
- canonical path 去重。
- Manifest 引用檔案同時存在掃描資料夾時只載入一次。
- reselect／reload 不累加上一次 records。
- 279 records／279 unique／0 duplicate fixture。
- 真正重複 Skill ID 可列出 ID、完整路徑與 record location。
- Unicode／case／trim ambiguous ID。
- Pending JSON schema、source identity、counts、hash。
- output filename sanitation／collision。
- analyzed JSON schema 與 completed-only gate。
- progress conservation。
- provider readiness 狀態。
- error mapping 不產生 `undefined: undefined`。
- path formatter 不丟失完整原值。
- token／duration aggregation。
- review audit。

### 15.2 Integration tests

至少包含：

- Renderer → preload → main 的 folder dialog 與完整路徑。
- Renderer → preload → main 的 Pending／Analyzed file dialog。
- Rules validation → readiness → start analysis。
- Manifest 不會與 folder scan 雙重載入 Catalog。
- ChatGPT fake app-server contract：account、model、rate limits、stream、token、complete、interrupt、crash。
- AI Nexus fake server：success、stream／non-stream、401、429、5xx、timeout、cancel。
- Offline Rule full run deterministic。
- 開始分析立即出現 result page 與真實 progress events。
- completed run 自動建立 JSON 並寫 DB。
- cancelled／failed／partial 不建立 final JSON／正式 DB records。
- final JSON reopen、hash、count 與 DB cross-check。
- 匯入 analyzed JSON 後直接顯示結果，不再下載一次。
- report 由目前 selected analyzed JSON 產生。

### 15.3 UI／component tests

至少驗證：

- 只有三個 AI Analysis 子分頁，順序與名稱正確。
- AI Analysis sidebar 仍為獨立區域。
- 其他 sidebar／route 未改動。
- 共用分析依據顯示資料夾與三個檔案完整路徑。
- Pending file 右側摘要顯示完整路徑。
- Analyzed file 右側摘要顯示完整路徑。
- 結果頁 `選擇資料檔` 左側沒有步驟編號。
- 沒有「下載已分析 JSON」按鈕。
- 沒有 OpenAI API、API Key、OpenAI Base URL UI。
- Signed in 與 Connected 狀態分開顯示。
- Rules invalid、dataset invalid、provider invalid 各自顯示正確 blocker。
- Run Analysis 不會被已登入狀態與 rules 狀態混淆。
- 執行中可取消；切頁返回可 hydrate。
- 數字來自 fixture，而非硬編碼靜態稿數字。
- 長 Windows 路徑、中文、空白與窄視窗可讀。

### 15.4 Regression

至少執行：

- `npm.cmd run typecheck`
- repository 既有完整 unit／integration 測試。
- v0.3.9 ChatGPT contract tests。
- AI Nexus regression tests。
- Offline Rule regression tests。
- SQLite／export／ledger tests。
- 新增的 `test:v0.3.10` 與 `test:v0.3.10:integration`（命名依 repository 慣例可調整）。
- `git diff --check`。

不得跳過失敗測試。若既有測試因正式需求改變而需要更新，必須說明需求差異，不可只是刪除 assertion。

---

## 十六、Build、Dist 與 Packaged Smoke

所有必要測試通過後必須：

1. 執行正式 production build。
2. 執行 Windows dist，產生 Installer、Portable、win-unpacked。
3. 驗證版本顯示 `0.3.10` 與正確 Build Time。
4. 驗證 packaged app 使用 bundled Codex runtime，不依賴全域 Codex CLI。
5. 驗證 SQLite 不需使用者另行安裝。
6. 驗證 Portable 不會把 AI Analysis 輸出回退到 `%LOCALAPPDATA%`。
7. 執行有限時間、可重現的 packaged smoke；不要執行長時間 smoke。

Packaged smoke 至少核對：

- App 可啟動且無白畫面。
- AI Analysis route 可開啟。
- 三個子分頁存在且可切換。
- 靜態 UI 核心版面已落實。
- 共用分析依據完整路徑可見。
- Pending／Analyzed 右側摘要完整路徑可見。
- 結果頁沒有左側步驟編號與「下載已分析 JSON」。
- ChatGPT、AI Nexus、Offline Rule 三個 Analyzer 可見。
- 未登入／規則錯誤／資料錯誤會正確阻擋。
- bundled runtime signed-out probe／account read 可在不洩漏帳號資料下完成。

若真實 ChatGPT browser login 需要人工操作：

- 可請使用者接手完成登入，再繼續真實 ChatGPT 診斷與小型分析驗證。
- 若執行環境無法人工登入，不得偽造成功；標示 `Partial — automated implementation and packaging complete; real ChatGPT account validation pending`。
- 只要所有不需真實帳號的必要自動驗證通過，人工登入 pending 不阻擋 Commit／Push。
- 若已存在可用登入狀態，應執行最小、非機密 ChatGPT 診斷與小型 fixture analysis；不得輸出帳號憑證。

至少保存 app-only screenshots：

- AI 連線與診斷。
- 分析工作區。
- Activity Events 分析結果。
- Rules duplicate error detail（可用 test fixture）。
- 分析執行中 progress。
- 分析完成與 JSON 完整路徑。

所有 screenshot 與產物最終回報都提供完整絕對路徑。

---

## 十七、Package Content 與秘密稽核

對 Installer、Portable、win-unpacked／app.asar 執行稽核：

- bundled Codex runtime 存在且版本符合 lock。
- 無 `.env`。
- 無 ChatGPT auth cache／`auth.json`。
- 無真實 AI Nexus Token。
- 無 Jira 原始 JSON／SQLite／附件。
- 無使用者規則資料夾內容。
- 無 debug folder、test secrets 或手動測試輸出。
- `.env.version` 只有安全預設值。
- 沒有 `api.openai.com` active call path。
- 沒有硬編碼使用者 Windows 路徑。

若 static UI 基準檔不是產品 runtime 所需，不得把它誤打包進 release。

---

## 十八、執行時間帳與 Token 帳

建立：

```text
reports/JiraActivityAnalyzer_v0.3.10_execution_time_ledger.json
```

內容至少包含：

- schemaVersion。
- targetVersion。
- taskStartAt／taskEndAt／wallClockSeconds。
- timezone。
- machine／OS／Node／npm／Electron／electron-builder／Codex runtime version。
- base branch／base commit／working branch／final commit。
- 每個階段：start、end、duration、command、exitCode、result。
- typecheck、各測試、build、dist、smoke、package audit、git checks、push。
- Installer／Portable／win-unpacked／app.asar 的完整絕對路徑、bytes、SHA-256。
- warnings、retries、known limitations。

Token 帳必須分開記錄：

1. **Codex 實作工作階段 Token**：平台或執行環境可取得時，記錄 input／cached input／output／total；若無法取得，值填 `null` 並記錄 `unavailableReason`，不得估算或捏造。
2. **App 驗證分析 Token**：ChatGPT／AI Nexus fixture run 可取得時，記錄 provider、model、input／output／total、batch／retry；Offline Rule 為 `0`。

如果 repository 已有獨立 token ledger 格式，沿用並在 execution ledger 中引用其完整路徑。所有時間使用實測值，不得手填猜測。

---

## 十九、版本、文件與 Prompt 保存

更新所有 repository 既有正式版本來源：

- `VERSION`
- `package.json`／lockfile（依 repository 慣例）
- Build Version／Build Time 注入來源
- `CHANGELOG.md`
- `README.md`
- `PROJECT.md`
- 必要架構／schema／migration 文件

新增正式實作文件，例如：

```text
docs/v0.3.10-ai-analysis-ui-reconstruction.md
```

文件至少說明：

- UI 基準檔的實際完整絕對路徑與 SHA-256（路徑只記錄於執行文件／ledger，不必把機器特定路徑寫進產品 runtime）。
- 三頁 UI mapping。
- rules loader 修正。
- path contract。
- run state machine。
- JSON／SQLite completed-only 流程。
- ChatGPT／AI Nexus／Offline 安全邊界。
- 測試與封裝結果。
- 已知限制與人工驗收項目。

把本次使用的 Prompt 逐字保存到 repository 的 `prompts/`，檔名例如：

```text
prompts/JiraActivityAnalyzer_v0.3.10_ai_analysis_ui_reconstruction_prompt.md
```

不得只保存摘要。

---

## 二十、Git、Commit 與 Push

### 20.1 Commit 前

- 顯示 `git status --short`。
- 顯示本版 tracked file 清單。
- 執行 `git diff --check`。
- 確認沒有 `.env`、Token、auth cache、Jira data、SQLite、release、screenshots、test artifacts 或使用者無關檔案進 staging。
- 禁止 `git add .` 與 `git add -A`；使用明確檔案清單。

### 20.2 Commit 條件

只有下列條件成立才可 Commit：

- 必要 typecheck／tests／integration／build／dist／packaged smoke／package audit 全部通過。
- 沒有未解決 blocker 或資料安全問題。
- v0.3.10 文件、Prompt、ledger 已完成。
- 人工 ChatGPT OAuth pending 是唯一例外；必須明確標示 Partial，但不阻擋已完成自動驗證後的 Commit／Push。

建議 Commit 分成：

1. implementation／tests。
2. docs／ledger／prompt／package provenance。

實際可依 repository 慣例調整，但不得把無關使用者修改混入。

### 20.3 Push

- Push 到 `origin/feat/v0.3.10-ai-analysis-ui-reconstruction`。
- 設定 upstream。
- Push 後核對 local HEAD、remote HEAD、ahead／behind = `0 / 0`。
- 不 force push。
- 不建立 Tag／Release。

若任何必要驗證未通過，不得 Commit／Push 一個宣稱完成的版本；應保留工作樹、提供失敗 command、error、完整相關路徑與下一步。

---

## 二十一、正式驗收條件

只有全部符合才可將 v0.3.10 標示為 `Completed`：

### UI 與範圍

- AI Analysis 與提供的 Final Static UI 在資訊架構、三頁布局與指定互動上對齊。
- 其他頁面、sidebar 區段與既有功能未被任意改動。
- 不存在 OpenAI API／API Key／Base URL 使用者流程。

### 完整路徑

- 共用分析依據資料夾顯示完整路徑。
- Manifest／Catalog／Common Rules 各自顯示完整路徑。
- Pending JSON 右側摘要顯示完整路徑。
- Analyzed JSON 右側摘要顯示完整路徑。
- 分析中與完成後顯示 output JSON 完整路徑。
- diagnostics／reports／artifacts／release 最終回報顯示完整路徑。

### 規則

- 本次 279 筆 Catalog 驗證為 279 unique、0 duplicate。
- 同一 Catalog 不會因 Manifest＋folder scan 載入兩次。
- 真重複時列出 ID、完整來源路徑與位置。
- 不再出現籠統誤判或 `undefined: undefined`。

### 分析

- ChatGPT、AI Nexus、Offline Rule 都可使用同一 validated rules snapshot。
- Provider readiness 與 rules／dataset readiness 分開顯示。
- Run Analysis 使用真實 pipeline。
- 進度、取消、timeout、retry 與 crash recovery 正常。
- 完成後自動建立 JSON；取消／失敗／Partial 不建立 final JSON。
- final JSON 與 AI Analysis SQLite 可交叉驗證。

### 結果

- Activity Events 結果頁 `選擇資料檔` 左側沒有編號。
- 已分析摘要顯示完整路徑。
- 沒有「下載已分析 JSON」。
- 結果、篩選、搜尋、Evidence、review audit 與 report 使用真實資料。
- 報告直接基於目前 selected analyzed JSON 產生。

### 交付

- 所有必要測試通過。
- Build、Installer、Portable、win-unpacked 成功。
- 有限 packaged smoke 通過。
- package secret audit 通過。
- execution time／token ledger 完整。
- Commit 與 Push 成功，ahead／behind = `0 / 0`。

若唯一未完成項目是真實 ChatGPT 人工登入／額度／實際 Jira 分析驗證，狀態必須為：

```text
Partial — AI Analysis reconstruction, automated tests, build, packaging and push completed; real ChatGPT account validation pending.
```

不得宣稱 Completed。

---

## 二十二、Codex 最終回報格式

最終回報使用繁體中文，依序提供：

1. **完成狀態**：Completed／Partial／Blocked，附一行精確原因。
2. **版本與主題**。
3. **實際 repository 完整路徑**。
4. **靜態 UI 基準檔完整路徑與 SHA-256**。
5. **實際 base branch／commit、working branch、final commit、remote**。
6. **AI Analysis 三頁完成內容**。
7. **規則載入與 duplicate Skill ID 修正結果**。
8. **完整路徑 UI 驗證結果**。
9. **ChatGPT／AI Nexus／Offline Rule 驗證結果**。
10. **JSON／SQLite／report 驗證結果**。
11. **測試命令、結果與各自實測秒數**。
12. **Build／Dist／packaged smoke 結果與實測秒數**。
13. **Installer／Portable／win-unpacked／app.asar 完整路徑、bytes、SHA-256**。
14. **Screenshots／test artifacts 完整路徑**。
15. **Execution time／Token ledger 完整路徑**。
16. **Git status、Push、upstream、ahead／behind**。
17. **未提交且完整保留的使用者既有檔案／修改**。
18. **警告、已知限制與尚待人工驗收項目**。

所有檔案一律提供完整絕對路徑，不只提供檔名或相對路徑。

---

## 二十三、建議執行順序

1. 讀取 repo instructions、版本、Git 與工作樹。
2. Resolve 並渲染靜態 UI 基準檔，建立三頁 UI mapping 清單。
3. 對現有 v0.3.9 AI Analysis 做 inventory；標記可保留、需重構、需刪除的 UI。
4. 先補 regression／contract tests，重現 duplicate Skill ID 誤判與 path 問題。
5. 修正 Manifest／rules loader 與完整錯誤 detail。
6. 建立統一 full-path model、dialogs 與 typed IPC。
7. 重構 `AI 連線與診斷` 並接回真實 ChatGPT／AI Nexus。
8. 重構 `分析工作區` 並接回 rules、Pending JSON、readiness、run／cancel。
9. 重構 `Activity Events 分析結果` 並接回 progress、JSON、SQLite、review、report。
10. 執行 unit／integration／UI／regression；修到全數通過。
11. 更新版本、Changelog、README、PROJECT、docs 與保存 Prompt。
12. Build、Dist、有限 packaged smoke、screenshots、package audit。
13. 完成 execution time／token ledger。
14. `git diff --check`、精準 staging、Commit、Push。
15. 核對 remote HEAD 與 ahead／behind，依指定格式回報。

不要在一般可自行修復的錯誤後停下來詢問；在授權範圍內持續診斷、修正、重跑並完成交付。

---

## 二十四、官方參考

實作 ChatGPT／Codex App Server 時，必須以執行當下官方文件與 bundled runtime generated schema 為準：

- Codex App Server：`https://developers.openai.com/codex/app-server`
- ChatGPT／Codex Authentication：`https://developers.openai.com/codex/auth`

不得用第三方 reverse engineering、ChatGPT Web API、browser cookies 或自行猜測的 protocol 取代官方流程。
