# v0.3.47 開發交付報告

## 實作範圍

R47-01～07 已實作並以真 importer、SQLite、worker、IPC、renderer 驗證：五種 AI 狀態、偏好與空集合、統一 AI Description 主 Diff 與快篩/查詢/匯出來源、配對診斷及既有 Raw/Comment 保真。來源 commit：`b2e52bb79083f425836fe179ebbfedb7ee4e7916`；branch：`feat/v0.3.47-integrated-ai-status-diff`。

來源差異（對 baseline，排除使用者既有修改）：PRODUCT_CODE +155/-27/net128；TEST_CODE +334/-4/net330；DELIVERY_ACCOUNTING_TOOL +148/-0/net148；FIXTURE_DATA +6355/-0；CHANGELOG +8/-0；VERSION_METADATA +7/-4。文件與持續更新報告另見 WorkTimeline 的 cutoff 統計，不與階段 churn 相加。

## 交付物

- 模式：DEVELOPMENT。自動開發交付完成；整體 Partial / Manual GUI Validation Pending；正式發布 NOT_READY。
- ZIP：`F:\AI\JiraActivityAnalyzer\release\0.3.47\JiraActivityAnalyzer_v0.3.47_win-unpacked.zip`
- ZIP：283,323,565 bytes；SHA-256 `4d7ec7f87e2e7f01d8b4021ed96ab366f0a18200293a4293ee6d07674893be56`。
- EXE：`F:\AI\JiraActivityAnalyzer\release\0.3.47\win-unpacked\Jira Activity Analyzer.exe`
- EXE：235,706,368 bytes；SHA-256 `6e81304c355e9c8d2056dccaee8c4c64b5f8c56d5bc9c911a9e4070adf01da45`。
- 完整目錄：129 files / 772,368,550 bytes；CRC、全檔 size/hash、測後原 ZIP 與 unpacked hash 均 PASS。
- Build v0.3.47；Build Time：2026/09/09 20:35:37 Asia/Taipei。source commit 與封裝內 metadata 一致。dirtyState=true 唯一 tracked 例外是使用者 v0.2.47 report，不是漏提交 source。
- 首次 EXE 後沒有 source/UI/schema/test/harness/packaging 修改或重建。沒有 Installer、Portable、Tag、Push、Release。EXE Authenticode：NotSigned。

## Windows 驗證

[解壓資訊](ExtractedDelivery.json)：全新中文空白路徑，實際啟動該 ZIP 內 EXE。三個 AI 頁面、User Viewer、五狀態、16種快篩、AI 主 Diff、搜尋排序、1366/1920畫面與 Debug Panel 通過，無 renderer error，實際 App 已退出。截圖僅 BrowserWindow.capturePage，無 OS 桌面。

[關閉後資料](PostExitDatabaseAudit.json)：以交付 Electron 43.0.0 / Node24.17.0 / SQLite3.53.0 新子程序唯讀載入，Raw120、AI55均保留，integrity_check=ok，路徑在隔離 APP_ROOT。沒有使用真實 Jira/AI/私有DB。UI IO audit 外部讀取僅明確指定 synthetic Package；無未授權 business write。此 IO 證據是 Node fs/SQLite 稽核，不冒稱 OS 全 syscall 覆蓋或人工作業驗收。

## 測試、失敗與警告

來源 Gate 詳見 [SourceCoverage](SourceCoverage.json)、[AcceptanceReport](AcceptanceReport.md)、[TestReport](TestReport.md)。package:v0.3.47 包含 build/typecheck，exit0，127.359秒；實際 ZIP UI exit0，221.807秒；解壓/hash20.599秒。各耗時是命令觀测區間，不將內含子 build 再加總。

後段保留失敗：op114 staged diff 發現新檔 EOF 空白，首EXE前僅格式清理後 commit；op119 唯讀命令取錯 Raw path 欄位；op121 PowerShell GUI EXE 非同步造成 exit 誤判；op122 明確 spawnSync 等待後 exit0。後兩次未修改 App/harness，也沒有重建。op110/111 帳本 JSON 命令超長，原操作成功、append 失敗，改 @file 後保存原觀測。

警告：既有 Vite node:crypto externalized、>500KB chunk；builder duplicate dependency references、default Electron icon；Git LF/CRLF。未隱藏這些警告。相同母體效能略慢，OBSERVATIONAL 數據見 TestReport。

## 執行時間統計

起始 2026-09-09 18:48:50 Asia/Taipei。完整逐項命令、失敗/重試、時間、前後額度、public event、差異與截止：[WorkTimeline](WorkTimeline.md)、[WorkLedger](WorkLedger.json)。最終可觀測結算另見 TimeSummary；報告/commit/最後回覆尾段另列，不能推估全為 coding。

## Token 消耗統計

精確 Token = UNAVAILABLE；首筆週窗口剩餘22%，最後數值見 TimeSummary。帳戶 pp 不是本任務精確消耗，其他共享活動與 freshness UNKNOWN。reset timestamp 微幅變動的列不可比；0pp不代表0Token。部分直接讀取、公開事件時間/平台ID、額度工具尾段缺口如實列出，未假造全覆蓋。

## 人工 Gate 與待辦

請依 [ManualGUI](ManualGUI.md) 驗收指定 ZIP/hash；未收到「v0.3.47 GUI 驗收 PASS」前不 Tag/Push。K46-01 Installer 卸載資料保留 DEFERRED_ISSUE；沒有在本版修正或聲稱通過。來源三項旧 UI 缺口已補；自動測試不能代替人工 GUI。
