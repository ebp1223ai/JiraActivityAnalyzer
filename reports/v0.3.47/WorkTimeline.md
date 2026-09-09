# v0.3.47 WorkTimeline

即時工作聯表。公開說明不是測試 PASS；COMMAND_ONLY / FILE_IO_ONLY 不代表完整模型閱讀或寫碼時間。

開始：2026-09-09T10:48:50.000Z；截止：2026-09-09T12:52:40.357Z。命令觀測聯集 3266.312 秒；wall-clock 7430.357 秒；未分類 4164.045 秒。
帳戶百分比為共用窗口觀測，非精確 Token；0pp 不代表零 Token。各工作項包含查詢及工具往返，不能與子命令相加。

| ID／工作與目的 | 結果 | 起訖 UTC | 秒／範圍 | Codex 前→後剩餘／pp | 階段差異 | 證據 |
|---|---|---|---|---|---|---|
| 1：解壓 v0.3.47 至 Repository 外並確認既有修改 | PASS | 2026-09-09T10:49:04.995Z<br>2026-09-09T10:49:14.755Z | 9.760／COMMAND_ONLY | 22% → 22%／0pp | N/A：非修改作業 | WorkLedger.json operation 1 |
| 2：閱讀正式要求、規範綁定與即時記帳規則 | PASS | 2026-09-09T10:49:19.994Z<br>2026-09-09T10:49:25.955Z | 5.961／COMMAND_ONLY | 22% → 22%／0pp | N/A：非修改作業 | WorkLedger.json operation 2 |
| 3：完整閱讀綁定交付規範前半 | PASS | 2026-09-09T10:49:33.639Z<br>2026-09-09T10:49:38.387Z | 4.748／COMMAND_ONLY | 22% → 22%／0pp | N/A：非修改作業 | WorkLedger.json operation 3 |
| 4：補讀工具截斷的規範中段，包含資料、驗收、封裝與時間要求 | PASS | 2026-09-09T10:49:46.130Z<br>2026-09-09T10:49:52.412Z | 6.282／COMMAND_ONLY | 21% → 21%／0pp | N/A：非修改作業 | WorkLedger.json operation 4 |
| 5：完成規範正文缺段及附錄前段閱讀 | PASS | 2026-09-09T10:50:08.127Z<br>2026-09-09T10:50:24.192Z | 16.065／COMMAND_ONLY | 21% → 21%／0pp | N/A：非修改作業 | WorkLedger.json operation 5 |
| 6：驗 SHA256、輸入與 DDL 驗證；核對作用範圍、契約角色及 Git 基準 | PASS | 2026-09-09T10:50:49.023Z<br>2026-09-09T10:51:01.904Z | 12.881／COMMAND_ONLY | 21% → 21%／0pp | N/A：非修改作業 | WorkLedger.json operation 6 |
| 7：讀狀態/來源/效能/驗收規格與既有指令，建立本版分支 | PASS | 2026-09-09T10:51:23.661Z<br>2026-09-09T10:51:32.622Z | 8.961／COMMAND_ONLY | 21% → 21%／0pp | N/A：非修改作業 | WorkLedger.json operation 7 |
| 8：新增即時 WorkTimeline 產表工具（R47-09），不加入 App runtime | PASS | 2026-09-09T10:52:34.444Z<br>2026-09-09T10:52:44.355Z | 9.911／FILE_IO_ONLY | 21% → 21%／0pp | scripts/work-timeline-v0347.cjs new file; initial patch above | WorkLedger.json operation 8 |
| 9：驗證記帳工具並定位 Integrated 狀態、來源與篩選路徑 | PASS | 2026-09-09T10:53:08.956Z<br>2026-09-09T10:53:15.623Z | 6.667／COMMAND_ONLY | 21% → 21%／0pp | N/A：非修改作業 | WorkLedger.json operation 9 |
| 10：閱讀正式資料選取、query SQL、Viewer 與偏好保存實作 | PASS | 2026-09-09T10:53:42.295Z<br>2026-09-09T10:53:47.297Z | 5.002／COMMAND_ONLY | 21% → 21%／0pp | N/A：非修改作業 | WorkLedger.json operation 10 |
| 11：補讀查詢與 UI 關鍵段、共用 Diff formatter 與 IPC 輸入 | PASS | 2026-09-09T10:54:01.044Z<br>2026-09-09T10:54:05.763Z | 4.719／COMMAND_ONLY | 21% → 21%／0pp | N/A：非修改作業 | WorkLedger.json operation 11 |
| 12：閱讀共享表格 state 與可信來源渲染，確認 fixture 邊界 | PASS | 2026-09-09T10:54:24.800Z<br>2026-09-09T10:54:30.846Z | 6.046／COMMAND_ONLY | 21% → 21%／0pp | N/A：非修改作業 | WorkLedger.json operation 12 |
| 13：確認 filter 空集合、query IPC、安全來源標記與既有 synthetic seed | PASS | 2026-09-09T10:54:48.380Z<br>2026-09-09T10:54:53.991Z | 5.611／COMMAND_ONLY | 21% → 21%／0pp | N/A：非修改作業 | WorkLedger.json operation 13 |
| 14：讀逐項 Gate、synthetic DB 建立助手及 filter apply 行為 | PASS | 2026-09-09T10:55:10.596Z<br>2026-09-09T10:55:16.299Z | 5.703／COMMAND_ONLY | 20% → 20%／0pp | N/A：非修改作業 | WorkLedger.json operation 14 |
| 15：確認正式 integrity 狀態、materialize 與可重用 UI harness | PASS | 2026-09-09T10:56:20.165Z<br>2026-09-09T10:56:25.646Z | 5.481／COMMAND_ONLY | 20% → 20%／0pp | N/A：非修改作業 | WorkLedger.json operation 15 |
| 16：R47-03/04：共用可信 Description 来源選取與 query/export 同源 metadata | FAIL 1 | 2026-09-09T10:58:33.428Z<br>2026-09-09T10:58:40.334Z | 6.906／COMMAND_ONLY | 20% → 20%／0pp | UNAVAILABLE | WorkLedger.json operation 16 |
| 17：修復 patch 工具命令列長度問題並核對部分套用 | PASS | 2026-09-09T10:59:27.397Z<br>2026-09-09T10:59:34.619Z | 7.222／COMMAND_ONLY | 20% → 20%／0pp | UNAVAILABLE | WorkLedger.json operation 17 |
| 18：R47-03/04：拆段套用 query/renderer 同源修正（重試，不改原始契約） | PASS | 2026-09-09T10:59:48.617Z<br>2026-09-09T11:00:01.128Z | 12.511／COMMAND_ONLY | 20% → 20%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788951597451\\changes.json | WorkLedger.json operation 18 |
| 19：R47-01/02/05：五種 AI 狀態、空集合、清除/預設、持久化與欄頭共用 state | FAIL 1 | 2026-09-09T11:01:55.626Z<br>2026-09-09T11:02:03.008Z | 7.382／COMMAND_ONLY | 20% → 20%／0pp | UNAVAILABLE | WorkLedger.json operation 19 |
| 20：定位單檔寫入失敗，檢查屬性、ACL 與已套用內容 | PASS | 2026-09-09T11:02:22.334Z<br>2026-09-09T11:02:27.701Z | 5.367／COMMAND_ONLY | 20% → 20%／0pp | N/A：非修改作業 | WorkLedger.json operation 20 |
| 21：精確核對部分 patch 的完成邊界，避免重套或覆蓋既有內容 | PASS | 2026-09-09T11:02:48.677Z<br>2026-09-09T11:02:53.588Z | 4.911／COMMAND_ONLY | 20% → 20%／0pp | N/A：非修改作業 | WorkLedger.json operation 21 |
| 22：R47-01/02 UI：依已確認邊界完成狀態控制與 empty-set 表格相依 | PASS | 2026-09-09T11:03:34.276Z<br>2026-09-09T11:03:45.105Z | 10.829／COMMAND_ONLY | 20% → 20%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788951820895\\changes.json | WorkLedger.json operation 22 |
| 23：首輪型別檢查並核對真 importer fixture 適配方式 | PASS | 2026-09-09T11:04:06.362Z<br>2026-09-09T11:04:31.644Z | 25.282／COMMAND_ONLY | 19% → 19%／0pp | N/A：非修改作業 | WorkLedger.json operation 23 |
| 24：定位現有 integrity 驗證与 worker barrier 可測入口 | PASS | 2026-09-09T11:05:05.210Z<br>2026-09-09T11:05:10.702Z | 5.492／COMMAND_ONLY | 19% → 19%／0pp | N/A：非修改作業 | WorkLedger.json operation 24 |
| 25：對齊既有 trace integrity 語意與 v0.3.47 版本指令，不修改 Frozen Schema | PASS | 2026-09-09T11:05:50.873Z<br>2026-09-09T11:05:58.819Z | 7.946／COMMAND_ONLY | 19% → 19%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788951956760\\changes.json | WorkLedger.json operation 25 |
| 26：確認 fixture 語意檢查、query worker 與 filter header 行為 | PASS | 2026-09-09T11:06:22.349Z<br>2026-09-09T11:06:27.335Z | 4.986／COMMAND_ONLY | 19% → 19%／0pp | N/A：非修改作業 | WorkLedger.json operation 26 |
| 27：新增真 importer/SQLite 服務測試：32 狀態、16 快篩、來源、偏好與四種完整匯出 | PASS | 2026-09-09T11:08:18.642Z<br>2026-09-09T11:08:27.716Z | 9.074／COMMAND_ONLY | 19% → 19%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788952106838\\changes.json | WorkLedger.json operation 27 |
| 28：加入五個 hash 相同合成 fixture 並執行 v0.3.47 服務測試 | FAIL 1 | 2026-09-09T11:08:47.361Z<br>2026-09-09T11:08:59.642Z | 12.281／COMMAND_ONLY | 19% → 19%／0pp | N/A：非修改作業 | WorkLedger.json operation 28 |
| 29：分析 synthetic adapter preflight 的具體契約錯誤 | FAIL 1 | 2026-09-09T11:09:43.015Z<br>2026-09-09T11:09:49.514Z | 6.499／COMMAND_ONLY | 19% → 19%／0pp | N/A：非修改作業 | WorkLedger.json operation 29 |
| 30：以絕對路徑重試讀取 preflight 診斷 | PASS | 2026-09-09T11:10:05.534Z<br>2026-09-09T11:10:11.187Z | 5.653／COMMAND_ONLY | 19% → 19%／0pp | N/A：非修改作業 | WorkLedger.json operation 30 |
| 31：修正 synthetic adapter 的 Evidence pointer/quote，保留 importer 嚴格驗證 | PASS | 2026-09-09T11:10:26.697Z<br>2026-09-09T11:10:33.364Z | 6.667／COMMAND_ONLY | 19% → 19%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788952232985\\changes.json | WorkLedger.json operation 31 |
| 32：重跑已修正 adapter 的服務測試 | FAIL 1 | 2026-09-09T11:10:38.943Z<br>2026-09-09T11:10:48.286Z | 9.343／COMMAND_ONLY | 19% → 19%／0pp | N/A：非修改作業 | WorkLedger.json operation 32 |
| 33：確認 production Relink helper 的真正參數契約 | PASS | 2026-09-09T11:11:01.076Z<br>2026-09-09T11:11:07.780Z | 6.704／COMMAND_ONLY | 19% → 19%／0pp | N/A：非修改作業 | WorkLedger.json operation 33 |
| 34：修正測試 Relink 呼叫，候選由實際 Raw SQLite 讀取 | PASS | 2026-09-09T11:11:24.478Z<br>2026-09-09T11:11:30.982Z | 6.504／COMMAND_ONLY | 19% → 19%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788952290584\\changes.json | WorkLedger.json operation 34 |
| 35：執行 32 狀態與來源/匯出正式服務回歸 | PASS | 2026-09-09T11:11:59.129Z<br>2026-09-09T11:12:17.313Z | 18.184／COMMAND_ONLY | 19% → 18%／1pp | N/A：非修改作業 | WorkLedger.json operation 35 |
| 36：閱讀可重用 UI 工作流程與打包 Gate，準備精準補測 | PASS | 2026-09-09T11:13:00.510Z<br>2026-09-09T11:13:06.368Z | 5.858／COMMAND_ONLY | 18% → 18%／N/App | N/A：非修改作業 | WorkLedger.json operation 36 |
| 37：定位 User 真 UI 選擇、現有 cache 與 harness 收尾保障 | PASS | 2026-09-09T11:13:34.552Z<br>2026-09-09T11:13:39.778Z | 5.226／COMMAND_ONLY | 18% → 18%／0pp | N/A：非修改作業 | WorkLedger.json operation 37 |
| 38：R47-UI：加入 nonce test-mode worker barrier，沿用正式 Bridge UI harness | PASS | 2026-09-09T11:17:36.481Z<br>2026-09-09T11:17:46.010Z | 9.529／COMMAND_ONLY | 17% → 17%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788952663280\\changes.json | WorkLedger.json operation 38 |
| 39：讀取既有真 UI 斷言與合成種子結構 | PASS | 2026-09-09T11:17:52.218Z<br>2026-09-09T11:17:57.492Z | 5.274／COMMAND_ONLY | 17% → 17%／0pp | N/A：非修改作業 | WorkLedger.json operation 39 |
| 40：定位 UI filter 與來源標籤斷言，重核正式限制 | PASS | 2026-09-09T11:18:12.627Z<br>2026-09-09T11:18:18.271Z | 5.644／COMMAND_ONLY | 17% → 17%／0pp | N/A：非修改作業 | WorkLedger.json operation 40 |
| 41：讀取 Description 合成期待值與實際列識別方式 | PASS | 2026-09-09T11:18:35.196Z<br>2026-09-09T11:18:40.229Z | 5.033／COMMAND_ONLY | 17% → 17%／0pp | N/A：非修改作業 | WorkLedger.json operation 41 |
| 42：R47-UI：新增真實頁面組合、三頁同事件、barrier 切換與匯出測試 | PASS | 2026-09-09T11:20:54.213Z<br>2026-09-09T11:21:02.768Z | 8.555／COMMAND_ONLY | 17% → 17%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788952861214\\changes.json | WorkLedger.json operation 42 |
| 43：v0.3.47 UI 與 test-control 型別驗證 | PASS | 2026-09-09T11:21:08.654Z<br>2026-09-09T11:21:30.344Z | 21.690／COMMAND_ONLY | 17% → 17%／0pp | N/A：非修改作業 | WorkLedger.json operation 43 |
| 44：v0.3.47 source Electron build（尚未封裝 EXE） | PASS | 2026-09-09T11:22:05.954Z<br>2026-09-09T11:22:42.421Z | 36.467／COMMAND_ONLY | 17% → 17%／0pp | N/A：非修改作業 | WorkLedger.json operation 44 |
| 45：執行聚焦真 UI gates（120筆隔離合成資料） | FAIL 1 | 2026-09-09T11:22:47.174Z<br>2026-09-09T11:24:01.479Z | 74.305／COMMAND_ONLY | 17% → 17%／0pp | N/A：非修改作業 | WorkLedger.json operation 45 |
| 46：診斷 CLASSIFIED 計數失敗並核對既有打包入口 | PASS | 2026-09-09T11:24:15.148Z<br>2026-09-09T11:24:20.647Z | 5.499／COMMAND_ONLY | 17% → 17%／0pp | N/A：非修改作業 | WorkLedger.json operation 46 |
| 47：修正合成 seed oracle：依實際 status/time 計算，不改正式 UI 期待契約 | PASS | 2026-09-09T11:25:16.086Z<br>2026-09-09T11:25:23.576Z | 7.490／COMMAND_ONLY | 16% → 16%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788953121987\\changes.json | WorkLedger.json operation 47 |
| 48：重跑聚焦 UI（修正硬編碼測試 oracle） | FAIL 1 | 2026-09-09T11:25:28.945Z<br>2026-09-09T11:27:48.651Z | 139.706／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 48 |
| 49：修正 Chromium datetime-local 零秒正規格式（保留毫秒邊界測試） | FAIL 1 | 2026-09-09T11:28:12.938Z<br>2026-09-09T11:28:18.558Z | 5.620／COMMAND_ONLY | 16% → 16%／0pp | UNAVAILABLE | WorkLedger.json operation 49 |
| 50：核對剩餘邊界、匯出競態與效能測試可沿用範圍 | PASS | 2026-09-09T11:28:23.344Z<br>2026-09-09T11:28:28.524Z | 5.180／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 50 |
| 51：精確錨點修正 datetime-local 測試格式 | PASS | 2026-09-09T11:28:51.476Z<br>2026-09-09T11:28:56.736Z | 5.260／COMMAND_ONLY | 16% → 16%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788953336065\\changes.json | WorkLedger.json operation 51 |
| 52：核對 AI DB 切換方法與來源投影欄位 | PASS | 2026-09-09T11:29:01.383Z<br>2026-09-09T11:29:06.228Z | 4.845／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 52 |
| 53：重跑 UI 日期原生格式及後续實際流程 | FAIL 1 | 2026-09-09T11:29:11.009Z<br>2026-09-09T11:31:52.000Z | 160.991／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 53 |
| 54：定位 D47-01 主 Diff UI 與欄位索引失敗 | PASS | 2026-09-09T11:32:09.522Z<br>2026-09-09T11:32:14.468Z | 4.946／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 54 |
| 55：依 Diff DOM before/after 語義核對共用文字，保留失敗 cell 實際內容 | PASS | 2026-09-09T11:33:09.493Z<br>2026-09-09T11:33:37.115Z | 27.622／COMMAND_ONLY | 16% → 16%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788953616280\\changes.json | WorkLedger.json operation 55 |
| 56：重跑真 UI 並保留 main Diff DOM 證據 | FAIL 1 | 2026-09-09T11:33:43.415Z<br>2026-09-09T11:37:24.257Z | 220.842／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 56 |
| 57：確認 User 舊版表頭契約與 UI 分頁字樣，避免重跑已通過日期段 | PASS | 2026-09-09T11:37:59.878Z<br>2026-09-09T11:38:05.744Z | 5.866／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 57 |
| 58：沿用 User 既有候選值表頭；新增聚焦續跑模式並不冒稱未跑的 Gate | FAIL 1 | 2026-09-09T11:38:10.594Z<br>2026-09-09T11:38:17.778Z | 7.184／COMMAND_ONLY | 16% → 16%／0pp | UNAVAILABLE | WorkLedger.json operation 58 |
| 59：聚焦三頁 Diff 與查詢競態，不重跑已驗日期組合 | FAIL 1 | 2026-09-09T11:38:23.565Z<br>2026-09-09T11:39:43.635Z | 80.070／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 59 |
| 60：讀取 User 文字欄位實際輸入契約及 ledger test 入口 | PASS | 2026-09-09T11:40:12.244Z<br>2026-09-09T11:40:16.691Z | 4.447／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 60 |
| 61：精確修正 User 既有文字 filter，加入只補未過 Gate 的 test focus | PASS | 2026-09-09T11:40:21.946Z<br>2026-09-09T11:40:28.420Z | 6.474／COMMAND_ONLY | 16% → 16%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788954027033\\changes.json | WorkLedger.json operation 61 |
| 62：只補三頁 Diff、快取、競態與匯出真 UI | FAIL 1 | 2026-09-09T11:40:33.884Z<br>2026-09-09T11:41:54.616Z | 80.732／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 62 |
| 63：定位 User Raw 主 Diff 是否為既有懶載入預覽 | PASS | 2026-09-09T11:42:10.262Z<br>2026-09-09T11:42:15.117Z | 4.855／COMMAND_ONLY | 16% → 16%／0pp | N/A：非修改作業 | WorkLedger.json operation 63 |
| 64：追查 User 原始 Description 的正式來源驗證要求 | PASS | 2026-09-09T11:42:51.196Z<br>2026-09-09T11:42:57.211Z | 6.015／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 64 |
| 65：保存 User 實際 Diff 錯誤內容並等待既有 debounce 查詢真正完成 | PASS | 2026-09-09T11:43:02.179Z<br>2026-09-09T11:43:08.269Z | 6.090／COMMAND_ONLY | 15% → 15%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788954187690\\changes.json | WorkLedger.json operation 65 |
| 66：核對合成 Raw 種子是否滿足 Description identity provenance | PASS | 2026-09-09T11:43:19.302Z<br>2026-09-09T11:43:24.062Z | 4.760／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 66 |
| 67：確認 Description provenance 拒絕原因的必要欄位 | PASS | 2026-09-09T11:43:34.010Z<br>2026-09-09T11:43:38.321Z | 4.311／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 67 |
| 68：修正合成 Description provenance，區分 AI DB 未選取與已選但不可讀 | PASS | 2026-09-09T11:44:13.731Z<br>2026-09-09T11:44:21.522Z | 7.791／COMMAND_ONLY | 15% → 15%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788954260711\\changes.json | WorkLedger.json operation 68 |
| 69：重新驗證實際 importer 接受正確 changelog fixture 與服務回歸 | FAIL 1 | 2026-09-09T11:44:26.719Z<br>2026-09-09T11:44:36.769Z | 10.050／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 69 |
| 70：Source build：AI 不可讀診斷 guard | PASS | 2026-09-09T11:44:41.569Z<br>2026-09-09T11:45:13.329Z | 31.760／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 70 |
| 71：聚焦 User/AI/Integrated 同事件与實際查詢競態 | FAIL 1 | 2026-09-09T11:45:18.969Z<br>2026-09-09T11:45:56.177Z | 37.208／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 71 |
| 72：診斷 Source Trace 與 AI Analysis identity 配對欄位 | PASS | 2026-09-09T11:46:11.425Z<br>2026-09-09T11:46:17.027Z | 5.602／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 72 |
| 73：同步合成 AI Analysis identity，保持正式 importer 層間一致性檢查 | PASS | 2026-09-09T11:46:39.006Z<br>2026-09-09T11:46:46.238Z | 7.232／COMMAND_ONLY | 15% → 15%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788954405855\\changes.json | WorkLedger.json operation 73 |
| 74：验证修正合成層間 identity 後的正式 importer | PASS | 2026-09-09T11:46:52.513Z<br>2026-09-09T11:47:12.011Z | 19.498／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 74 |
| 75：重驗三頁同事件、barrier 與完整匯出 | PASS | 2026-09-09T11:47:17.600Z<br>2026-09-09T11:49:59.831Z | 162.231／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 75 |
| 76：補 Raw Description 共用 formatter 與標示；增加 ambiguity 與即時 UI 進度證據 | PASS | 2026-09-09T11:50:52.730Z<br>2026-09-09T11:51:26.423Z | 33.693／COMMAND_ONLY | 15% → 15%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788954684764\\changes.json | WorkLedger.json operation 76 |
| 77：補 picker/writing/restart 邊界、20輪資源檢查及同資料 before/after profile | PASS | 2026-09-09T11:53:00.776Z<br>2026-09-09T11:53:08.153Z | 7.377／COMMAND_ONLY | 15% → 15%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788954787613\\changes.json | WorkLedger.json operation 77 |
| 78：補即時逐檔 churn、分類淨差異、監測缺口與帳本重試一致性 | PASS | 2026-09-09T11:54:26.634Z<br>2026-09-09T11:54:34.467Z | 7.833／COMMAND_ONLY | 15% → 15%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788954873030\\changes.json | WorkLedger.json operation 78 |
| 79：記帳風險檢查與新增 ambiguity 回歸 | FAIL 1 | 2026-09-09T11:54:41.174Z<br>2026-09-09T11:54:59.818Z | 18.644／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 79 |
| 80：診斷 ambiguity 測試是否真的建立了歧義候選 | PASS | 2026-09-09T11:55:26.856Z<br>2026-09-09T11:55:32.629Z | 5.773／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 80 |
| 81：定位实际配對演算法，不變更正式規則 | PASS | 2026-09-09T11:56:27.293Z<br>2026-09-09T11:56:33.478Z | 6.185／COMMAND_ONLY | 15% → 15%／0pp | N/A：非修改作業 | WorkLedger.json operation 81 |
| 82：核對 fallback 多候選的實際判定 | PASS | 2026-09-09T11:56:52.819Z<br>2026-09-09T11:56:58.324Z | 5.505／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 82 |
| 83：以兩個符合 fallback 身分且無 primary 的候選建立真正歧義 | PASS | 2026-09-09T11:57:03.931Z<br>2026-09-09T11:57:09.527Z | 5.596／COMMAND_ONLY | 14% → 14%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788955029187\\changes.json | WorkLedger.json operation 83 |
| 84：歧義配對 Raw fallback 回歸 | FAIL 1 | 2026-09-09T11:57:15.946Z<br>2026-09-09T11:57:33.686Z | 17.740／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 84 |
| 85：核對配對診斷是否計入 AMBIGUOUS 最新 attempt | PASS | 2026-09-09T11:57:49.245Z<br>2026-09-09T11:57:54.476Z | 5.231／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 85 |
| 86：分開計數 AI 配對歧義與 Raw 身分衝突，保留原匹配規則 | PASS | 2026-09-09T11:58:20.751Z<br>2026-09-09T11:58:28.164Z | 7.413／COMMAND_ONLY | 14% → 14%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788955107205\\changes.json | WorkLedger.json operation 86 |
| 87：完成配對歧義與所有服務回歸 | PASS | 2026-09-09T11:59:04.543Z<br>2026-09-09T11:59:23.301Z | 18.758／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 87 |
| 88：執行相同 39,281 Raw／55 AI 的唯讀基線與新版比較 | PASS | 2026-09-09T11:59:31.776Z<br>2026-09-09T11:59:59.753Z | 27.977／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 88 |
| 89：補 query-inflight 日期與真三頁留言全文；批次讀取 diff 降低記帳成本 | PASS | 2026-09-09T12:00:53.292Z<br>2026-09-09T12:01:01.427Z | 8.135／COMMAND_ONLY | 14% → 14%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788955259808\\changes.json | WorkLedger.json operation 89 |
| 90：封裝前最新 source build | PASS | 2026-09-09T12:01:07.667Z<br>2026-09-09T12:01:44.678Z | 37.011／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 90 |
| 91：完整 39,281 筆真 UI：日期、三頁、競態、匯出與資源上限 | FAIL 1 | 2026-09-09T12:01:51.409Z<br>2026-09-09T12:05:39.955Z | 228.546／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 91 |
| 92：以實際表頭定位 Raw-only 事件，不假定39,281筆中的頁次 | PASS | 2026-09-09T12:06:27.958Z<br>2026-09-09T12:06:34.032Z | 6.074／COMMAND_ONLY | 14% → 14%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788955593666\\changes.json | WorkLedger.json operation 92 |
| 93：沿用 dir-only 封裝流程，強制三個 source UI Gate 與逐項 coverage | PASS | 2026-09-09T12:06:39.929Z<br>2026-09-09T12:06:47.674Z | 7.745／COMMAND_ONLY | 14% → 14%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788955607348\\changes.json | WorkLedger.json operation 93 |
| 94：續驗大資料真 UI 未完成段落；日期 Gate 沿用同輪已通過證據 | PASS | 2026-09-09T12:06:53.150Z<br>2026-09-09T12:12:47.867Z | 354.717／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 94 |
| 95：封裝前 git 狀態、有效舊證據、驗收矩陣與現有 scripts 審查 | PASS | 2026-09-09T12:13:30.194Z<br>2026-09-09T12:13:37.124Z | 6.930／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 95 |
| 96：逐項覆蓋審查與 frozen／worker 回歸有效證據 | PASS | 2026-09-09T12:14:05.540Z<br>2026-09-09T12:14:11.503Z | 5.963／COMMAND_ONLY | 14% → 14%／0pp | N/A：非修改作業 | WorkLedger.json operation 96 |
| 97：完成解壓 EXE 共用核心驗證、16真UI快篩與版本文件 | PASS | 2026-09-09T12:15:50.819Z<br>2026-09-09T12:15:59.607Z | 8.788／COMMAND_ONLY | 13% → 13%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788956158815\\changes.json | WorkLedger.json operation 97 |
| 98：沿用實際 worker revision/noop/rollback/cancel/SQL error 聚焦回歸 | PASS | 2026-09-09T12:16:05.590Z<br>2026-09-09T12:16:21.028Z | 15.438／COMMAND_ONLY | 13% → 13%／0pp | N/A：非修改作業 | WorkLedger.json operation 98 |
| 99：首 EXE 前驗證交付 smoke harness 與16真UI快篩 | PASS | 2026-09-09T12:16:27.407Z<br>2026-09-09T12:20:09.934Z | 222.527／COMMAND_ONLY | 13% → 13%／0pp | N/A：非修改作業 | WorkLedger.json operation 99 |
| 100：明確分列 PRODUCT_CODE、TEST_CODE、fixture 與封裝記帳工具行數 | PASS | 2026-09-09T12:20:47.344Z<br>2026-09-09T12:20:55.023Z | 7.679／COMMAND_ONLY | 13% → 13%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788956454677\\changes.json | WorkLedger.json operation 100 |
| 101：source Gate 最終審查：記帳、打包配置、diff 與保護檔案 | PASS | 2026-09-09T12:21:00.263Z<br>2026-09-09T12:21:08.095Z | 7.832／COMMAND_ONLY | 13% → 13%／0pp | N/A：非修改作業 | WorkLedger.json operation 101 |
| 102：核對一次性封裝 Gate 與 WorkTimeline 結算規則 | PASS | 2026-09-09T12:25:07.989Z<br>2026-09-09T12:25:13.960Z | 5.971／COMMAND_ONLY | 13% → 13%／0pp | N/A：非修改作業 | WorkLedger.json operation 102 |
| 103：核對正式交付條件及最後需要補齊的 typed-field 回歸證據 | PASS | 2026-09-09T12:25:24.951Z<br>2026-09-09T12:25:30.057Z | 5.106／COMMAND_ONLY | 13% → 13%／0pp | N/A：非修改作業 | WorkLedger.json operation 103 |
| 104：補驗 typed value、日期與原始契約安全的既有快速回歸 | PASS | 2026-09-09T12:25:37.940Z<br>2026-09-09T12:25:57.254Z | 19.314／COMMAND_ONLY | 13% → 13%／0pp | N/A：非修改作業 | WorkLedger.json operation 104 |
| 105：封裝前閱讀來源策略、SQL、test-only 安全邊界及尾端欄位測試覆蓋 | PASS | 2026-09-09T12:26:14.039Z<br>2026-09-09T12:26:18.469Z | 4.430／COMMAND_ONLY | 12% → 12%／0pp | N/A：非修改作業 | WorkLedger.json operation 105 |
| 106：補齊兩種 schema 三種 review rank 與尾端欄位完整發現快速回歸 | PASS | 2026-09-09T12:26:29.740Z<br>2026-09-09T12:26:54.604Z | 24.864／COMMAND_ONLY | 12% → 12%／0pp | N/A：非修改作業 | WorkLedger.json operation 106 |
| 107：整理逐項驗收證據與交付前行數結算 | PASS | 2026-09-09T12:27:08.126Z<br>2026-09-09T12:27:13.692Z | 5.566／COMMAND_ONLY | 12% → 12%／0pp | N/A：非修改作業 | WorkLedger.json operation 107 |
| 108：補齊文件與報告行數分類，明確記帳自身截止點 | PASS | 2026-09-09T12:27:35.420Z<br>2026-09-09T12:27:44.078Z | 8.658／COMMAND_ONLY | 12% → 12%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788956863221\\changes.json | WorkLedger.json operation 108 |
| 109：驗收報告來源存在性與來源 Gate 綁定核對 | PASS | 2026-09-09T12:28:00.668Z<br>2026-09-09T12:28:07.055Z | 6.387／COMMAND_ONLY | 12% → 12%／0pp | N/A：非修改作業 | WorkLedger.json operation 109 |
| 110：建立逐項 SourceCoverage 與實作／測試／驗收報告，區分已完成子 Gate 與人工待驗 | PASS | 2026-09-09T12:30:14.397Z<br>2026-09-09T12:30:26.768Z | 12.371／COMMAND_ONLY | 12% → 12%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788957025570\\changes.json | WorkLedger.json operation 110 |
| 111：建立封裝前 SourceCoverage 與證據索引（拆開 Windows 命令長度受限批次） | PASS | 2026-09-09T12:30:48.846Z<br>2026-09-09T12:30:55.181Z | 6.335／COMMAND_ONLY | 12% → 12%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788957054611\\changes.json | WorkLedger.json operation 111 |
| 112：修正大型 WorkLedger 批次改由 JSON 檔傳入，保留原 operations | PASS | 2026-09-09T12:31:47.885Z<br>2026-09-09T12:31:56.852Z | 8.967／COMMAND_ONLY | 12% → 12%／N/App | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788957116480\\changes.json | WorkLedger.json operation 112 |
| 113：驗證大型帳本檔輸入、證據引用、版本、敏感內容與 selective source 清單 | PASS | 2026-09-09T12:33:02.846Z<br>2026-09-09T12:33:10.436Z | 7.590／COMMAND_ONLY | 12% → 12%／0pp | N/A：非修改作業 | WorkLedger.json operation 113 |
| 114：逐檔提交已審查的 v0.3.47 source，排除所有報告與使用者原修改 | FAIL 1 | 2026-09-09T12:33:37.430Z<br>2026-09-09T12:33:50.275Z | 12.845／COMMAND_ONLY | 12% → 12%／0pp | N/A：非修改作業 | WorkLedger.json operation 114 |
| 115：清除四個新工具的 EOF 空白行並重試來源 commit（不變更邏輯） | PASS | 2026-09-09T12:34:20.273Z<br>2026-09-09T12:34:31.324Z | 11.051／COMMAND_ONLY | 11% → 11%／0pp | N/A：非修改作業 | WorkLedger.json operation 115 |
| 116：一次性封裝 DEVELOPMENT win-unpacked 與完整 ZIP；首次 EXE 後鎖版 | PASS | 2026-09-09T12:35:17.331Z<br>2026-09-09T12:37:24.690Z | 127.359／COMMAND_ONLY | 11% → 11%／0pp | N/A：非修改作業 | WorkLedger.json operation 116 |
| 117：將交付 ZIP 解壓至全新中文空白路徑，核對全部檔案 hash/size 與 EXE 簽章 | PASS | 2026-09-09T12:37:59.041Z<br>2026-09-09T12:38:19.640Z | 20.599／COMMAND_ONLY | 11% → 11%／0pp | N/A：非修改作業 | WorkLedger.json operation 117 |
| 118：啟動實際交付 ZIP 的 EXE，驗證狀態複選、16快篩、AI Diff、三頁與使用者頁 | PASS | 2026-09-09T12:38:43.723Z<br>2026-09-09T12:42:25.530Z | 221.807／COMMAND_ONLY | 11% → 11%／0pp | N/A：非修改作業 | WorkLedger.json operation 118 |
| 119：使用交付 Electron 的 node:sqlite 唯讀檢查關閉後資料保留，確認產物與凍結來源不變 | FAIL 1 | 2026-09-09T12:44:00.714Z<br>2026-09-09T12:44:08.973Z | 8.259／COMMAND_ONLY | 11% → 11%／0pp | N/A：非修改作業 | WorkLedger.json operation 119 |
| 120：核對測試報告的實際 Raw path 欄位；修正唯讀檢查命令取值，不修改 App 或 harness | PASS | 2026-09-09T12:44:27.118Z<br>2026-09-09T12:44:37.520Z | 10.402／COMMAND_ONLY | 11% → 11%／0pp | N/A：非修改作業 | WorkLedger.json operation 120 |
| 121：重跑唯讀關閉後資料檢查：使用報告正式 path 欄位，核對交付雜湊與鎖版狀態 | FAIL 1 | 2026-09-09T12:44:49.045Z<br>2026-09-09T12:44:57.706Z | 8.661／COMMAND_ONLY | 11% → 11%／0pp | N/A：非修改作業 | WorkLedger.json operation 121 |
| 122：以明確等待的子程序執行交付 Electron SQLite 核對，避免 PowerShell GUI EXE 非同步 exit 誤判 | PASS | 2026-09-09T12:45:26.935Z<br>2026-09-09T12:45:44.056Z | 17.121／COMMAND_ONLY | 11% → 11%／0pp | N/A：非修改作業 | WorkLedger.json operation 122 |
| 123：視覺檢查交付 App 的 AI 主 Diff 截圖（僅 renderer） | PASS | 2026-09-09T12:46:50.698Z<br>2026-09-09T12:46:58.338Z | 7.640／FILE_IO_ONLY | 11% → 11%／0pp | N/A：非修改作業 | WorkLedger.json operation 123 |
| 124：寫入開發交付結果、EXE/ZIP hash、真 Windows 證據與保留失敗說明 | PASS | 2026-09-09T12:48:03.871Z<br>2026-09-09T12:48:10.837Z | 6.966／COMMAND_ONLY | 11% → 11%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788958090520\\changes.json | WorkLedger.json operation 124 |
| 125：補齊人工 GUI 清單並更新報告交付狀態，保持正式 Release Gate 待確認 | PASS | 2026-09-09T12:49:11.110Z<br>2026-09-09T12:49:17.439Z | 6.329／COMMAND_ONLY | 11% → 11%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788958156479\\changes.json | WorkLedger.json operation 125 |
| 126：保存封裝與 UI 期間只讀進度觀測，明列未獨立量測的額度邊界 | PASS | 2026-09-09T12:50:09.858Z<br>2026-09-09T12:50:15.322Z | 5.464／COMMAND_ONLY | 10% → 10%／0pp | F:\\AI\\JiraActivityAnalyzer\\test-artifacts\\v0.3.47\\diff-1788958214996\\changes.json | WorkLedger.json operation 126 |
| 127：最終驗證全部封裝前 source hash、Frozen DDL、保護檔、App-only 截圖與授權檔 | PASS | 2026-09-09T12:50:20.083Z<br>2026-09-09T12:50:29.749Z | 9.666／COMMAND_ONLY | 10% → 10%／0pp | N/A：非修改作業 | WorkLedger.json operation 127 |
| 128：結算 source/report 分類新增刪除與實際檔數，檢查報告敏感內容及保留清單 | PASS | 2026-09-09T12:51:03.129Z<br>2026-09-09T12:51:11.203Z | 8.074／COMMAND_ONLY | 10% → 10%／0pp | N/A：非修改作業 | WorkLedger.json operation 128 |
| 129：建立純報告 checkpoint commit，保持人工 GUI Gate；source 不变且不 Tag/Push | FAIL 1 | 2026-09-09T12:51:59.225Z<br>2026-09-09T12:52:31.326Z | 32.101／COMMAND_ONLY | 10% → 10%／0pp | N/A：非修改作業 | WorkLedger.json operation 129 |

## 公開進度

- E1／2026-09-09T10:49:04.995Z／PLANNED／operations 1：開始時間台北18:48:50，首筆額度剩餘22%；先驗包並逐項記帳，人工GUI獨立保留。
- E2／2026-09-09T10:50:08.126Z／OBSERVED_RESULT／operations 1, 2：已確認本輪重點是 Integrated 的五種 AI 分類複選，以及 Description 主 Diff、篩選與匯出的來源一致性。上一版的三項 UI 驗證缺口必須在首個 EXE 產生前補齊；目前既有修改與未追蹤檔案均未動到。
- E3／2026-09-09T10:53:08.952Z／OBSERVED_RESULT／operations 6, 8：輸入驗證完成：81 個 SHA256 全數一致、驗證器 560 PASS，Frozen DDL 檢查通過。接下來先建立即時 WorkTimeline 記錄工具，再沿現有查詢與表格元件修改，不動資料庫契約或無關分頁。
- E4／2026-09-09T10:56:20.165Z／OBSERVED_RESULT／operations 10, 11, 13, 14：已找到兩個需要修正的資料流問題：Integrated 目前會用 Raw 值覆蓋 AI Diff；表格也把空複選集合視為「不限」。我會統一 Description 的顯示來源與查詢 metadata，並只針對 AI 狀態欄明確區分空集合、全選與預設。
- E5／2026-09-09T10:59:27.397Z／OBSERVED_RESULT／operations 16：第一批修改遇到 Windows 命令列長度限制，尚未進入編譯。我會將 patch 拆成較小區段，先確認已套用範圍再續作，並保留這次失敗及實際差異紀錄。
- E6／2026-09-09T11:05:05.210Z／IN_PROGRESS／operations 19, 22, 23：主要程式修改已套用：AI 狀態使用同一份欄頭／頂端篩選 state，Description 的顯示、快篩與匯出改用共同來源 metadata。目前進行首輪型別檢查，接著會用真實 importer／SQLite／renderer 路徑測試，而非只比對輸入包的範例答案。
- E7／2026-09-09T11:09:43.015Z／OBSERVED_RESULT／operations 23, 28：型別檢查已通過；首輪服務測試停在合成 Package 的 preflight。我要先檢查測試 adapter 是否完整符合既有契約，再修正適配方式，不會放寬正式 importer 的驗證。
- E8／2026-09-09T11:13:00.510Z／OBSERVED_RESULT／operations 35：服務層測試已通過：32 種 AI 狀態集合、16 種 Description 快篩、Raw／AI 來源差異、四種完整匯出與資料不變性都有實際證據。接下來補三項真 UI Gate，並用受 test-mode 限制的 worker barrier 確認查詢確實尚未完成，不靠延遲猜測競態。
- E9／2026-09-09T11:18:35.196Z／OBSERVED_RESULT／operations 38, 39, 40：查詢暫停點僅隔離 test-mode 啟用，維持正式 Bridge 安全；補真 UI 競態驗證，保留失敗與重試。
- E10／2026-09-09T11:50:52.729Z／OBSERVED_RESULT／operations 45, 48, 53, 56, 59, 62, 69, 71, 74, 75：保留 UI 重試：修正硬編碼 status count、datetime-local 格式、inline Diff DOM、User header 與合成 changelog/AI identity。日期 UI 曾通過；op75 真三頁 Diff、inflight/DB 切換、四種匯出已 PASS。op59 因修補未套用而主動結束；不是 App crash。
- E11／2026-09-09T12:13:30.194Z／OBSERVED_RESULT／operations 76, 77, 78, 79, 87, 88, 90, 91, 92, 93, 94：服務與ambiguity PASS；ledger分類/重疊/缺值/duplicate PASS。39,281 Raw/55 AI paired profile冷2163→2604ms、暖65→125ms，僅OBSERVATIONAL。op91日期UI已PASS，Raw-only分頁定位harness失敗保留；修正定位後op94 tail真UI全部PASS，含inflight日期/DB、四匯出、picker/writing cancel、20資源循環、設定重載。仍未產EXE、Tag、Push。
- E12／2026-09-09T12:26:29.740Z／OBSERVED_RESULT／operations 98, 99, 101, 102, 103, 104, 105：封裝前核對完成；worker回歸、16種真UI快篩與typed value/日期/SQL error通過。效能2.16→2.60秒、65→125ms如實記為OBSERVATIONAL變慢。準備開發ZIP，無Tag/Push，人工GUI仍待確認。
- E13／2026-09-09T12:33:02.846Z／OBSERVED_RESULT／operations 106, 107, 108, 109, 110, 111, 112：Golden三rank與尾端欄位回歸通過；報告已寫入。WorkLedger 大JSON命令列超長，operation110/111執行成功但即時append失敗，改用@JSON檔後保留並補存原始觀測；首EXE尚未產生。
- E14／2026-09-09T12:35:17.331Z／OBSERVED_RESULT／operations 113, 114, 115：source預檢通過；首次commit前diff check發現4個EOF空白行，僅格式清理後source commit b2e52bb。33檔不含使用者既有修改，開始一次性開發win-unpacked封裝；首EXE後凍結。
- E15／2026-09-09T12:44:00.713Z／OBSERVED_RESULT／operations 116, 117, 118：一次性win-unpacked ZIP完成，129檔hash/size/CRC一致；來源首EXE已鎖。解壓中文空白路徑EXE真UI PASS，16快篩/狀態/AI Diff/三頁/User，無renderer error且實際App已結束；NotSigned如實標示，人工GUI仍待確認。
- E16／2026-09-09T12:49:11.109Z／OBSERVED_RESULT／operations 119, 120, 121, 122, 123, 124：關閉後合成Raw120/AI55保持，交付Electron node:sqlite完整性ok；第一次讀錯report欄位、第二次PowerShell非同步exit判定失敗，明確等待後exit0。交付ZIP/129檔hash未變，App-only screenshot主Diff/版本已視覺核對。現在只整理報告與人工GUI清單，不改來源。
- E17／2026-09-09T12:51:03.129Z／OBSERVED_RESULT／operations 122, 123, 124, 125, 126, 127：最後核對通過：863 個封裝前來源檔雜湊未變，Frozen DDL 未變，Raw 120 筆與 AI 55 筆合成資料都保留且完整性正常。現在只做時間／額度結算與報告 checkpoint commit；不會 Tag、Push 或變更交付 ZIP。

## 來源與缺口

Task/session 使用本機任務識別，平台訊息 ID 與精確 Token usage 不可得。首個工具前的 Prompt 無 BEFORE；起始既有修改排除。FILE_IO_ONLY 不含工具回傳後的模型處理；空檔不推估為 coding。帳本產生、最後回覆尾段在本次截止後另列，不無限更新。

已記操作 129；已知公開事件 17。未聲稱平台完整對話覆蓋。

## 程式差異與監測成本

階段 churn 與最終 baseline 淨差異分開，不相加。報告行數是本次 render 寫入前快照；最終報告結算另有明確 cutoff，不遞迴追算自身。使用者 v0.2.47 既有修改及原有未追蹤資料排除。

- operation 8：階段差異 UNAVAILABLE（失敗／缺少 receipt）；不猜測。
- operation 16：階段差異 UNAVAILABLE（失敗／缺少 receipt）；不猜測。
- operation 17：階段差異 UNAVAILABLE（失敗／缺少 receipt）；不猜測。
- operation 18：electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -0 / net 1；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -1 / net 0；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -1 / net 0；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -1 / net 0；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -1 / net 0；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -1 / net 0；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -0 / net 1；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +2 / -1 / net 1；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -1 / net 0；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -1 / net 0；src/components/TraceEvidenceView.tsx [PRODUCT_CODE] +2 / -1 / net 1；shared/aiResultProjectionV043.ts [PRODUCT_CODE] +1 / -1 / net 0
- operation 19：階段差異 UNAVAILABLE（失敗／缺少 receipt）；不猜測。
- operation 22：src/components/AiStatusFilterV047.tsx [PRODUCT_CODE] +29 / -0 / net 29；src/routes/AiDatabaseViewerPagesV043.tsx [PRODUCT_CODE] +1 / -0 / net 1；src/routes/AiDatabaseViewerPagesV043.tsx [PRODUCT_CODE] +1 / -0 / net 1；src/routes/AiDatabaseViewerPagesV043.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/SqliteDataTable.tsx [PRODUCT_CODE] +2 / -0 / net 2；src/components/SqliteDataTable.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/SqliteDataTable.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/SqliteDataTable.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/SqliteDataTable.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/TypedColumnFilter.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/TypedColumnFilter.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/TypedColumnFilter.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/TypedColumnFilter.tsx [PRODUCT_CODE] +1 / -1 / net 0；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -1 / net 0；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -0 / net 1
- operation 25：shared/integratedDisplayV047.ts [PRODUCT_CODE] +3 / -3 / net 0；src/routes/AiDatabaseViewerPagesV043.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/routes/AiDatabaseViewerPagesV043.tsx [PRODUCT_CODE] +1 / -1 / net 0；VERSION [VERSION_METADATA] +1 / -1 / net 0；package.json [VERSION_METADATA] +1 / -1 / net 0；package.json [VERSION_METADATA] +3 / -0 / net 3；package-lock.json [VERSION_METADATA] +1 / -1 / net 0；package-lock.json [VERSION_METADATA] +1 / -1 / net 0
- operation 27：scripts/v0347-test-seed.cjs [TEST_CODE] +41 / -0 / net 41；scripts/test-v0347.cjs [TEST_CODE] +74 / -0 / net 74
- operation 31：scripts/v0347-test-seed.cjs [TEST_CODE] +1 / -1 / net 0
- operation 34：scripts/v0347-test-seed.cjs [TEST_CODE] +3 / -1 / net 2
- operation 38：electron/aiResultsServiceV044.ts [PRODUCT_CODE] +4 / -0 / net 4；electron/aiResultsServiceV044.ts [PRODUCT_CODE] +1 / -1 / net 0；electron/aiResultsWorkerV044.ts [PRODUCT_CODE] +4 / -0 / net 4；electron/uiTestControlV044.ts [PRODUCT_CODE] +1 / -0 / net 1；electron/uiTestControlV044.ts [PRODUCT_CODE] +3 / -0 / net 3；scripts/test-v0344-ui.cjs [TEST_CODE] +1 / -1 / net 0；scripts/test-v0344-ui.cjs [TEST_CODE] +1 / -1 / net 0；scripts/test-v0344-ui.cjs [TEST_CODE] +1 / -1 / net 0；scripts/test-v0344-ui.cjs [TEST_CODE] +1 / -0 / net 1；scripts/test-v0344-ui.cjs [TEST_CODE] +1 / -1 / net 0
- operation 42：src/components/DiffCell.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/SqliteDataTable.tsx [PRODUCT_CODE] +1 / -1 / net 0；scripts/test-v0347-ui.cjs [TEST_CODE] +8 / -0 / net 8；scripts/v0347-ui-checks.cjs [TEST_CODE] +102 / -0 / net 102
- operation 47：scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -2 / net -1；scripts/v0347-ui-checks.cjs [TEST_CODE] +2 / -1 / net 1；scripts/v0347-ui-checks.cjs [TEST_CODE] +2 / -1 / net 1；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0
- operation 49：階段差異 UNAVAILABLE（失敗／缺少 receipt）；不猜測。
- operation 51：scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0
- operation 55：scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +2 / -1 / net 1；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0
- operation 58：階段差異 UNAVAILABLE（失敗／缺少 receipt）；不猜測。
- operation 61：scripts/v0347-ui-checks.cjs [TEST_CODE] +3 / -1 / net 2；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -0 / net 1；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0
- operation 65：scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0
- operation 68：scripts/v0347-test-seed.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-test-seed.cjs [TEST_CODE] +1 / -1 / net 0；electron/aiAnalysisDatabaseIpcV042.ts [PRODUCT_CODE] +1 / -0 / net 1
- operation 73：scripts/v0347-test-seed.cjs [TEST_CODE] +1 / -1 / net 0
- operation 76：src/components/DiffCell.tsx [PRODUCT_CODE] +1 / -1 / net 0；src/components/TraceEvidenceView.tsx [PRODUCT_CODE] +1 / -1 / net 0；scripts/test-v0347.cjs [TEST_CODE] +5 / -1 / net 4；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -0 / net 1
- operation 77：scripts/v0347-ui-edgechecks.cjs [TEST_CODE] +39 / -0 / net 39；scripts/profile-v0347.cjs [TEST_CODE] +23 / -0 / net 23
- operation 78：scripts/profile-v0347.cjs [TEST_CODE] +1 / -1 / net 0；scripts/profile-v0347.cjs [TEST_CODE] +1 / -1 / net 0；scripts/profile-v0347.cjs [TEST_CODE] +1 / -0 / net 1；scripts/work-ledger-audit-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +37 / -0 / net 37；scripts/work-timeline-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +1 / -0 / net 1；scripts/work-timeline-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +1 / -1 / net 0
- operation 83：scripts/test-v0347.cjs [TEST_CODE] +1 / -1 / net 0
- operation 86：scripts/test-v0347.cjs [TEST_CODE] +1 / -1 / net 0；scripts/test-v0347.cjs [TEST_CODE] +1 / -1 / net 0；electron/aiResultsQueryV043.ts [PRODUCT_CODE] +1 / -1 / net 0；src/components/AiStatusFilterV047.tsx [PRODUCT_CODE] +1 / -2 / net -1
- operation 89：scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -0 / net 1；scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -0 / net 1；scripts/v0347-ui-checks.cjs [TEST_CODE] +2 / -1 / net 1；scripts/work-ledger-audit-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +1 / -2 / net -1；scripts/work-ledger-audit-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +1 / -1 / net 0
- operation 92：scripts/v0347-ui-checks.cjs [TEST_CODE] +1 / -1 / net 0
- operation 93：scripts/package-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +61 / -0 / net 61
- operation 97：scripts/test-v0344-ui.cjs [TEST_CODE] +1 / -1 / net 0；scripts/v0347-ui-delivery.cjs [TEST_CODE] +29 / -0 / net 29；CHANGELOG.md [DOC_REPORT] +8 / -0 / net 8
- operation 100：scripts/work-ledger-audit-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +1 / -1 / net 0
- operation 108：scripts/work-ledger-audit-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +1 / -1 / net 0；scripts/work-ledger-audit-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +1 / -1 / net 0；scripts/work-ledger-audit-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +1 / -1 / net 0
- operation 110：reports/v0.3.47/SourceCoverage.json [DOC_REPORT] +336 / -0 / net 336；reports/v0.3.47/TestReport.md [DOC_REPORT] +119 / -0 / net 119；reports/v0.3.47/ImplementationReport.md [DOC_REPORT] +30 / -0 / net 30；reports/v0.3.47/AcceptanceReport.md [DOC_REPORT] +39 / -0 / net 39；reports/v0.3.47/PackageEvidence.json [DOC_REPORT] +8 / -0 / net 8
- operation 111：reports/v0.3.47/SourceCoverage.json [DOC_REPORT] +0 / -1 / net -1；reports/v0.3.47/PackageEvidence.json [DOC_REPORT] +0 / -1 / net -1
- operation 112：scripts/work-timeline-v0347.cjs [DELIVERY_ACCOUNTING_TOOL] +1 / -1 / net 0
- operation 124：reports/v0.3.47/DevelopmentDeliveryReport.md [DOC_REPORT] +45 / -0 / net 45
- operation 125：reports/v0.3.47/ManualGUI.md [DOC_REPORT] +25 / -0 / net 25；reports/v0.3.47/ImplementationReport.md [DOC_REPORT] +1 / -2 / net -1；reports/v0.3.47/TestReport.md [DOC_REPORT] +1 / -2 / net -1；reports/v0.3.47/AcceptanceReport.md [DOC_REPORT] +1 / -2 / net -1
- operation 126：reports/v0.3.47/SupplementalObservations.json [DOC_REPORT] +36 / -0 / net 36

### 最終 Baseline 淨差異

| 類別 | 檔案 | 新增 | 刪除 | 淨增減 |
|---|---:|---:|---:|---:|
| DOC_REPORT | 16 | 5445 | 0 | 5445 |
| VERSION_METADATA | 3 | 7 | 4 | 3 |
| PRODUCT_CODE | 13 | 155 | 27 | 128 |
| DELIVERY_ACCOUNTING_TOOL | 3 | 148 | 0 | 148 |
| TEST_CODE | 8 | 334 | 4 | 330 |
| FIXTURE_DATA | 5 | 6355 | 0 | 6355 |

| 檔案 | 類別 | + | - | net |
|---|---|---:|---:|---:|
| CHANGELOG.md | DOC_REPORT | 8 | 0 | 8 |
| VERSION | VERSION_METADATA | 1 | 1 | 0 |
| electron/aiAnalysisDatabaseIpcV042.ts | PRODUCT_CODE | 1 | 0 | 1 |
| electron/aiResultsQueryV043.ts | PRODUCT_CODE | 12 | 8 | 4 |
| electron/aiResultsServiceV044.ts | PRODUCT_CODE | 5 | 1 | 4 |
| electron/aiResultsWorkerV044.ts | PRODUCT_CODE | 4 | 0 | 4 |
| electron/uiTestControlV044.ts | PRODUCT_CODE | 4 | 0 | 4 |
| package-lock.json | VERSION_METADATA | 2 | 2 | 0 |
| package.json | VERSION_METADATA | 4 | 1 | 3 |
| reports/v0.3.47/AcceptanceReport.md | DOC_REPORT | 38 | 0 | 38 |
| reports/v0.3.47/ChangeSummary.json | DOC_REPORT | 350 | 0 | 350 |
| reports/v0.3.47/DeliveryAudit.json | DOC_REPORT | 144 | 0 | 144 |
| reports/v0.3.47/DevelopmentDeliveryReport.md | DOC_REPORT | 44 | 0 | 44 |
| reports/v0.3.47/ExtractedDelivery.json | DOC_REPORT | 10 | 0 | 10 |
| reports/v0.3.47/ImplementationReport.md | DOC_REPORT | 29 | 0 | 29 |
| reports/v0.3.47/ManualGUI.md | DOC_REPORT | 24 | 0 | 24 |
| reports/v0.3.47/PackageEvidence.json | DOC_REPORT | 7 | 0 | 7 |
| reports/v0.3.47/PostExitDatabaseAudit.json | DOC_REPORT | 26 | 0 | 26 |
| reports/v0.3.47/PrepackAudit.json | DOC_REPORT | 86 | 0 | 86 |
| reports/v0.3.47/SourceCoverage.json | DOC_REPORT | 335 | 0 | 335 |
| reports/v0.3.47/SupplementalObservations.json | DOC_REPORT | 36 | 0 | 36 |
| reports/v0.3.47/TestReport.md | DOC_REPORT | 118 | 0 | 118 |
| reports/v0.3.47/WorkLedger.json | DOC_REPORT | 3918 | 0 | 3918 |
| reports/v0.3.47/WorkTimeline.md | DOC_REPORT | 272 | 0 | 272 |
| scripts/package-v0347.cjs | DELIVERY_ACCOUNTING_TOOL | 60 | 0 | 60 |
| scripts/profile-v0347.cjs | TEST_CODE | 24 | 0 | 24 |
| scripts/test-v0344-ui.cjs | TEST_CODE | 5 | 4 | 1 |
| scripts/test-v0347-ui.cjs | TEST_CODE | 7 | 0 | 7 |
| scripts/test-v0347.cjs | TEST_CODE | 78 | 0 | 78 |
| scripts/v0347-test-seed.cjs | TEST_CODE | 43 | 0 | 43 |
| scripts/v0347-ui-checks.cjs | TEST_CODE | 111 | 0 | 111 |
| scripts/v0347-ui-delivery.cjs | TEST_CODE | 28 | 0 | 28 |
| scripts/v0347-ui-edgechecks.cjs | TEST_CODE | 38 | 0 | 38 |
| scripts/work-ledger-audit-v0347.cjs | DELIVERY_ACCOUNTING_TOOL | 36 | 0 | 36 |
| scripts/work-timeline-v0347.cjs | DELIVERY_ACCOUNTING_TOOL | 52 | 0 | 52 |
| shared/aiResultProjectionV043.ts | PRODUCT_CODE | 1 | 1 | 0 |
| shared/integratedDisplayV047.ts | PRODUCT_CODE | 65 | 0 | 65 |
| src/components/AiStatusFilterV047.tsx | PRODUCT_CODE | 28 | 0 | 28 |
| src/components/DiffCell.tsx | PRODUCT_CODE | 2 | 2 | 0 |
| src/components/SqliteDataTable.tsx | PRODUCT_CODE | 7 | 5 | 2 |
| src/components/TraceEvidenceView.tsx | PRODUCT_CODE | 3 | 2 | 1 |
| src/components/TypedColumnFilter.tsx | PRODUCT_CODE | 3 | 3 | 0 |
| src/routes/AiDatabaseViewerPagesV043.tsx | PRODUCT_CODE | 20 | 5 | 15 |
| tests/fixtures/v0.3.47/diff-source-cases.json | FIXTURE_DATA | 270 | 0 | 270 |
| tests/fixtures/v0.3.47/display-quick-filter-cases.json | FIXTURE_DATA | 309 | 0 | 309 |
| tests/fixtures/v0.3.47/package-status-mix-55.json | FIXTURE_DATA | 4860 | 0 | 4860 |
| tests/fixtures/v0.3.47/preference-cases.json | FIXTURE_DATA | 155 | 0 | 155 |
| tests/fixtures/v0.3.47/status-selection-cases.json | FIXTURE_DATA | 761 | 0 | 761 |

已量測額度工具往返 227.503 秒；包含在各操作/總 wall-clock 的部分不可再加總。帳本寫入工具尾段未完整單獨量測。
精確 Token=UNAVAILABLE；共享帳戶其他活動=UNKNOWN；quota freshness/delay=UNKNOWN。其他額度池未逐項保留，僅首筆原始工具快照可得；不補造。
部分診斷/圖像讀取與錯誤工具呼叫未落入命令帳；列為未分類缺口。op63/64 的 PowerShell 非終止 missing-file 訊息不可被 exit 0 解讀成讀取成功。op41 公開事件欄位錯誤及一次重疊 append 被拒絕，後續成功序列未重複計費。
