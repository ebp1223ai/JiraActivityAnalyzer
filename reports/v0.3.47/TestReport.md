# v0.3.47 Test Report

Source Gate: PASS。實際開發 ZIP 封裝及解壓 EXE UI PASS；人工 GUI PENDING，正式發布 NOT_READY。後段 operations 110 起的結果／失敗與產物見 [DevelopmentDeliveryReport](DevelopmentDeliveryReport.md) 及 WorkTimeline。

## 有效證據

- service: [test-artifacts/v0.3.47/service-1788955150051/report.json](../../test-artifacts/v0.3.47/service-1788955150051/report.json)
- profile: [test-artifacts/v0.3.47/paired-profile-1788955176817/report.json](../../test-artifacts/v0.3.47/paired-profile-1788955176817/report.json)
- ui: [test-artifacts/v0.3.47/ui-1788955618819/report.json](../../test-artifacts/v0.3.47/ui-1788955618819/report.json)
- dates: [test-artifacts/v0.3.47/ui-1788955339990/report.json](../../test-artifacts/v0.3.47/ui-1788955339990/report.json)
- deliverySource: [test-artifacts/v0.3.47/ui-1788956194077/report.json](../../test-artifacts/v0.3.47/ui-1788956194077/report.json)
- worker: [test-artifacts/v0.3.46/worker-1788956170110/report.json](../../test-artifacts/v0.3.46/worker-1788956170110/report.json)
- types: [test-artifacts/v0.3.43/correctness-1788956747047/results.json](../../test-artifacts/v0.3.43/correctness-1788956747047/results.json)
- integration: [test-artifacts/v0.3.43/integration-1788956796396/results.json](../../test-artifacts/v0.3.43/integration-1788956796396/results.json)

## 指令與重試

所有命令的完整字串、前後額度與起訖見 [WorkTimeline](WorkTimeline.md) 及 [WorkLedger](WorkLedger.json)。下表每列是同一 operation，不能再與總時間相加。

| operation | 工作 | exit | 秒 |
|---|---|---:|---:|
| 6 | 驗 SHA256、輸入與 DDL 驗證；核對作用範圍、契約角色及 Git 基準 | 0 | 12.881 |
| 16 | R47-03/04：共用可信 Description 来源選取與 query/export 同源 metadata | 1 | 6.906 |
| 17 | 修復 patch 工具命令列長度問題並核對部分套用 | 0 | 7.222 |
| 18 | R47-03/04：拆段套用 query/renderer 同源修正（重試，不改原始契約） | 0 | 12.511 |
| 19 | R47-01/02/05：五種 AI 狀態、空集合、清除/預設、持久化與欄頭共用 state | 1 | 7.382 |
| 21 | 精確核對部分 patch 的完成邊界，避免重套或覆蓋既有內容 | 0 | 4.911 |
| 22 | R47-01/02 UI：依已確認邊界完成狀態控制與 empty-set 表格相依 | 0 | 10.829 |
| 23 | 首輪型別檢查並核對真 importer fixture 適配方式 | 0 | 25.282 |
| 24 | 定位現有 integrity 驗證与 worker barrier 可測入口 | 0 | 5.492 |
| 25 | 對齊既有 trace integrity 語意與 v0.3.47 版本指令，不修改 Frozen Schema | 0 | 7.946 |
| 26 | 確認 fixture 語意檢查、query worker 與 filter header 行為 | 0 | 4.986 |
| 27 | 新增真 importer/SQLite 服務測試：32 狀態、16 快篩、來源、偏好與四種完整匯出 | 0 | 9.074 |
| 28 | 加入五個 hash 相同合成 fixture 並執行 v0.3.47 服務測試 | 1 | 12.281 |
| 29 | 分析 synthetic adapter preflight 的具體契約錯誤 | 1 | 6.499 |
| 30 | 以絕對路徑重試讀取 preflight 診斷 | 0 | 5.653 |
| 31 | 修正 synthetic adapter 的 Evidence pointer/quote，保留 importer 嚴格驗證 | 0 | 6.667 |
| 32 | 重跑已修正 adapter 的服務測試 | 1 | 9.343 |
| 33 | 確認 production Relink helper 的真正參數契約 | 0 | 6.704 |
| 34 | 修正測試 Relink 呼叫，候選由實際 Raw SQLite 讀取 | 0 | 6.504 |
| 35 | 執行 32 狀態與來源/匯出正式服務回歸 | 0 | 18.184 |
| 37 | 定位 User 真 UI 選擇、現有 cache 與 harness 收尾保障 | 0 | 5.226 |
| 38 | R47-UI：加入 nonce test-mode worker barrier，沿用正式 Bridge UI harness | 0 | 9.529 |
| 39 | 讀取既有真 UI 斷言與合成種子結構 | 0 | 5.274 |
| 40 | 定位 UI filter 與來源標籤斷言，重核正式限制 | 0 | 5.644 |
| 41 | 讀取 Description 合成期待值與實際列識別方式 | 0 | 5.033 |
| 42 | R47-UI：新增真實頁面組合、三頁同事件、barrier 切換與匯出測試 | 0 | 8.555 |
| 43 | v0.3.47 UI 與 test-control 型別驗證 | 0 | 21.690 |
| 44 | v0.3.47 source Electron build（尚未封裝 EXE） | 0 | 36.467 |
| 45 | 執行聚焦真 UI gates（120筆隔離合成資料） | 1 | 74.305 |
| 46 | 診斷 CLASSIFIED 計數失敗並核對既有打包入口 | 0 | 5.499 |
| 47 | 修正合成 seed oracle：依實際 status/time 計算，不改正式 UI 期待契約 | 0 | 7.490 |
| 48 | 重跑聚焦 UI（修正硬編碼測試 oracle） | 1 | 139.706 |
| 49 | 修正 Chromium datetime-local 零秒正規格式（保留毫秒邊界測試） | 1 | 5.620 |
| 50 | 核對剩餘邊界、匯出競態與效能測試可沿用範圍 | 0 | 5.180 |
| 51 | 精確錨點修正 datetime-local 測試格式 | 0 | 5.260 |
| 53 | 重跑 UI 日期原生格式及後续實際流程 | 1 | 160.991 |
| 54 | 定位 D47-01 主 Diff UI 與欄位索引失敗 | 0 | 4.946 |
| 55 | 依 Diff DOM before/after 語義核對共用文字，保留失敗 cell 實際內容 | 0 | 27.622 |
| 56 | 重跑真 UI 並保留 main Diff DOM 證據 | 1 | 220.842 |
| 58 | 沿用 User 既有候選值表頭；新增聚焦續跑模式並不冒稱未跑的 Gate | 1 | 7.184 |
| 59 | 聚焦三頁 Diff 與查詢競態，不重跑已驗日期組合 | 1 | 80.070 |
| 61 | 精確修正 User 既有文字 filter，加入只補未過 Gate 的 test focus | 0 | 6.474 |
| 62 | 只補三頁 Diff、快取、競態與匯出真 UI | 1 | 80.732 |
| 63 | 定位 User Raw 主 Diff 是否為既有懶載入預覽 | 0 | 4.855 |
| 64 | 追查 User 原始 Description 的正式來源驗證要求 | 0 | 6.015 |
| 65 | 保存 User 實際 Diff 錯誤內容並等待既有 debounce 查詢真正完成 | 0 | 6.090 |
| 68 | 修正合成 Description provenance，區分 AI DB 未選取與已選但不可讀 | 0 | 7.791 |
| 69 | 重新驗證實際 importer 接受正確 changelog fixture 與服務回歸 | 1 | 10.050 |
| 70 | Source build：AI 不可讀診斷 guard | 0 | 31.760 |
| 71 | 聚焦 User/AI/Integrated 同事件与實際查詢競態 | 1 | 37.208 |
| 72 | 診斷 Source Trace 與 AI Analysis identity 配對欄位 | 0 | 5.602 |
| 73 | 同步合成 AI Analysis identity，保持正式 importer 層間一致性檢查 | 0 | 7.232 |
| 74 | 验证修正合成層間 identity 後的正式 importer | 0 | 19.498 |
| 75 | 重驗三頁同事件、barrier 與完整匯出 | 0 | 162.231 |
| 76 | 補 Raw Description 共用 formatter 與標示；增加 ambiguity 與即時 UI 進度證據 | 0 | 33.693 |
| 77 | 補 picker/writing/restart 邊界、20輪資源檢查及同資料 before/after profile | 0 | 7.377 |
| 78 | 補即時逐檔 churn、分類淨差異、監測缺口與帳本重試一致性 | 0 | 7.833 |
| 79 | 記帳風險檢查與新增 ambiguity 回歸 | 1 | 18.644 |
| 83 | 以兩個符合 fallback 身分且無 primary 的候選建立真正歧義 | 0 | 5.596 |
| 84 | 歧義配對 Raw fallback 回歸 | 1 | 17.740 |
| 86 | 分開計數 AI 配對歧義與 Raw 身分衝突，保留原匹配規則 | 0 | 7.413 |
| 87 | 完成配對歧義與所有服務回歸 | 0 | 18.758 |
| 88 | 執行相同 39,281 Raw／55 AI 的唯讀基線與新版比較 | 0 | 27.977 |
| 89 | 補 query-inflight 日期與真三頁留言全文；批次讀取 diff 降低記帳成本 | 0 | 8.135 |
| 90 | 封裝前最新 source build | 0 | 37.011 |
| 91 | 完整 39,281 筆真 UI：日期、三頁、競態、匯出與資源上限 | 1 | 228.546 |
| 92 | 以實際表頭定位 Raw-only 事件，不假定39,281筆中的頁次 | 0 | 6.074 |
| 93 | 沿用 dir-only 封裝流程，強制三個 source UI Gate 與逐項 coverage | 0 | 7.745 |
| 94 | 續驗大資料真 UI 未完成段落；日期 Gate 沿用同輪已通過證據 | 0 | 354.717 |
| 95 | 封裝前 git 狀態、有效舊證據、驗收矩陣與現有 scripts 審查 | 0 | 6.930 |
| 96 | 逐項覆蓋審查與 frozen／worker 回歸有效證據 | 0 | 5.963 |
| 97 | 完成解壓 EXE 共用核心驗證、16真UI快篩與版本文件 | 0 | 8.788 |
| 98 | 沿用實際 worker revision/noop/rollback/cancel/SQL error 聚焦回歸 | 0 | 15.438 |
| 99 | 首 EXE 前驗證交付 smoke harness 與16真UI快篩 | 0 | 222.527 |
| 100 | 明確分列 PRODUCT_CODE、TEST_CODE、fixture 與封裝記帳工具行數 | 0 | 7.679 |
| 101 | source Gate 最終審查：記帳、打包配置、diff 與保護檔案 | 0 | 7.832 |
| 103 | 核對正式交付條件及最後需要補齊的 typed-field 回歸證據 | 0 | 5.106 |
| 104 | 補驗 typed value、日期與原始契約安全的既有快速回歸 | 0 | 19.314 |
| 105 | 封裝前閱讀來源策略、SQL、test-only 安全邊界及尾端欄位測試覆蓋 | 0 | 4.430 |
| 106 | 補齊兩種 schema 三種 review rank 與尾端欄位完整發現快速回歸 | 0 | 24.864 |
| 107 | 整理逐項驗收證據與交付前行數結算 | 0 | 5.566 |
| 108 | 補齊文件與報告行數分類，明確記帳自身截止點 | 0 | 8.658 |
| 109 | 驗收報告來源存在性與來源 Gate 綁定核對 | 0 | 6.387 |

## 失敗證據與原因

- 所有舊 artifact 原樣保留，未修改 fixture expected、Frozen DDL、importer validation 或安全邊界迎合測試。
- 最初測試 adapter 的 evidence quote、changelog sourceProvenance/sourceRecordStableId 與 aiAnalysis identity 不一致，被正式 preflight 拒絕；修 adapter 後通過。
- UI harness 的固定筆數、datetime-local `.000`、inline word Diff DOM、User legacy header、Raw-only 不在第一頁等假設修正；不是把正式 UI 錯誤吞掉。
- op91 整體 FAIL：T47-08 日期組合已先 PASS，後面 Raw-only 定位等待失敗。修正為 issue-key filter 後 op94 tail 全 PASS；production 相同，僅 harness locator 修正。不把 op91 全體改為 PASS。
- op59 人為結束重複執行，保留退出證據，不稱 App crash。Windows patch 長度/ACL、定位錯誤及帳本拒絕重複 append 亦見 ledger。

## 觀測與限制

同 39,281 Raw / 55 AI：before/after cold 2163.146/2604.242ms，warm 65.427/125.312ms，actor 456.535/568.674ms，facet 58.622/62.577ms。新增完整 status facet 有成本；OBSERVATIONAL 變慢，不宣稱改善或跨機硬門檻。OS filesystem cache 未強制清空。

Vite 既有警告：node:crypto browser externalized、chunk >500KB；Git LF/CRLF 提示。無真 Jira/AI 呼叫。app-only capturePage，非 OS/桌面截圖。未執行 Installer/Portable 或卸載測試，K46-01 DEFERRED。
