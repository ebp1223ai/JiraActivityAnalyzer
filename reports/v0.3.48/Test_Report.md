# v0.3.48 測試報告

所有結果為本機合成資料。完整命令、起訖/觀測結束、exit、失敗與重試見 WorkTimeline.md；原失敗證據保留在 test-artifacts/v0.3.48。

| 驗證 | 結果與證據 |
|---|---|
| 輸入包 | SHA256/validator PASS 575，FAIL 0 |
| 舊路徑 | baseline-1789033119673/baseline.json；Raw/AI 1413成功、1414拋錯 |
| 聚焦 | test-v0348.cjs；正常/guard/null、16快篩、32狀態、搜尋覆蓋、四匯出、尾端欄位、全局錯誤 |
| Worker | worker-1789036584430/report.json；28 guard/20樣本/8截斷，cancel/supersede/abnormal exit，無未結束子span |
| 既有受影響回歸 | v0.3.47/service-1789036281996/report.json；七組 PASS，Raw/AI來源、資料契約、關聯與偏好 |
| 正式 UI 小型 | ui-1789036205255/report.json PASS；120 Raw/55 AI，實際 preload/IPC/SQLite |
| 正式 UI 大型 | ui-1789036519938/report.json PASS；39281 Raw/55 AI，日期+狀態、clear/restart、四匯出、寫入中取消、SQL錯誤、完整span與IO檢查 |
| 型別/建置 | npm.cmd run typecheck 最後 exit 0；npm.cmd run build 最後 exit 0；package metadata build 再執行一次 |
| 契約 | 與 v0.3.47 source 的 contracts/DDL/importer 路徑 diff exit 0；無契約修改 |
| 差異檢查 | git diff --check exit 0；既有 LF/CRLF 提示保留 |

## 單次大型對照
同一組39281 Raw/55 AI；before source b2e52bb79083f425836fe179ebbfedb7ee4e7916，after本版。邏輯冷 cache，OS cache 未控制，不宣稱通用效能保證。

| 項目 | 耗時 |
|---|---:|
| 舊版冷查詢，guard失敗 | 0.387 s |
| 新版冷查詢 | 3.982 s |
| 新版暖查詢 | 0.154 s |
| facet | 0.523 s |
| visible/all JSON | 2.810 / 12.970 s |
| visible/all CSV | 3.088 / 13.966 s |

舊版無成功 snapshot，故舊版暖查詢/facet/export 為 NOT_AVAILABLE，不捏造速度比較。新結果39281筆、55配對、4筆guard；每次完整匯出39281筆。完整 process memory、snapshot/Diff/export分段在 paired-profile-1789035688033/report.json；RSS同一PID不可重複加總。

## 失敗與修正紀錄
- fixture 曾誤用不存在的 raw_json/event_id；改用現行表欄位並重跑。另原 Comment seed 必須同步改 event_type 才是 Description guard case。
- typecheck 曾指出 metadata 型別與 worker error unknown；局部修正後通過。
- 一次 build 發現新增 Node createHash 不適合 renderer 共用模組；改由 Node 查詢端注入，後續 build/UI 通過。
- UI harness 曾尋找不存在的 summary、AI頁未切100筆；改用既有來源按鈕與分頁控制，未降低正式 Bridge/IPC 安全限制。
- 自動審核服務容量不足兩次，唯讀確認後重試；不是 App 測試失敗。
- 最後 build 仍有既有 descriptionDiff 的 node:crypto browser externalization 與 >500KB chunk warning；無新增依賴或為去警告做重構。

## 尚待交付驗證
封裝與解壓 EXE 結果另寫 Delivery_Report.md；人工 GUI 仍 PENDING。App-only 截圖來自 BrowserWindow.capturePage，不含桌面或其他工作視窗。尚未以使用者正式事故 DB 確認 trigger identity，保持 UNKNOWN。
