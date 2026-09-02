# JAA v0.3.41 Windows Manual GUI Acceptance Checklist

## 1. Version／Package

- [ ] About／Footer 顯示 `0.3.41` 與正確 Build Time。
- [ ] Installer、Portable、win-unpacked 可啟動。
- [ ] 舊「AI 分析（封存中）」顯示且不可操作。

## 2. AI 分析資料庫

- [ ] 全域狀態列分別顯示 Raw DB、AI DB、Integration。
- [ ] 建立新的 AI SQLite，位置可自行選擇。
- [ ] 開啟外部 AI SQLite。
- [ ] 切換 Recent AI SQLite。
- [ ] Portable 相對路徑移動後可重新開啟。
- [ ] AI DB 頁面外觀與資料庫總覽一致。
- [ ] 顯示 Schema v2、Trace COMPLETE／PARTIAL／MISSING。
- [ ] Relink 入口可見，結果摘要可理解。

## 3. Package v2 Import

- [ ] AI_ONLY Golden 可匯入。
- [ ] REVIEW_COMPLETED Golden 可匯入。
- [ ] Missing Diff Negative 被拒絕且顯示 Pointer。
- [ ] Legacy v1 Package 被明確拒絕，不寫 DB。
- [ ] 新 AI_ONLY 不覆蓋舊 Completed Review。
- [ ] Import History 只顯示 committed batch。

## 4. AI 結果檢視

- [ ] 篩選直接位於欄位標題。
- [ ] 人員／Issue／AI Status／Review／Link Filter 有效。
- [ ] 顯示欄位與順序可調整。
- [ ] 切換頁面回來後資料、篩選、排序、分頁保留。
- [ ] Source Link 與 Integrity 分開顯示。

## 5. 整合顯示結果

- [ ] 原始資料為母體；未分析列仍顯示。
- [ ] 可篩 ANALYZED／UNANALYZED。
- [ ] Before／After／Diff 與使用者檢視一致。
- [ ] Primary Identity 命中即顯示 AI 結果。
- [ ] Integrity MISMATCH／UNVERIFIABLE 不會使已 Link 的列消失。
- [ ] Raw DB Closed、AI DB Closed、Schema Error、No Match 訊息正確。
- [ ] Relink 後 Link Attempt 可在 diagnostics 查到。

## 6. Workbench

- [ ] 空白 HTML 雙擊可開啟。
- [ ] 匯入 v2 AI_ONLY。
- [ ] 修改一筆人工驗收後匯出 PARTIAL。
- [ ] 匯出 Package 重新匯入後 Source Trace 與 AI Analysis 不變。
- [ ] 三份 Legacy 檔不齊全時不能宣稱轉換成功。

## 7. Debug／Safety

- [ ] Debug Bundle 包含 AI DB、Migration、Import、Trace、Link、Route diagnostics。
- [ ] Debug completeness 與實際檔案一致。
- [ ] 未包含 credentials 或完整 SQLite。
- [ ] 使用者既有 DB、reports、未追蹤檔未刪除或移動。

## 8. 結果

- Tester：
- Date／Time：
- Installer／Portable：
- Result：`PASS / FAIL / BLOCKED`
- Evidence paths：
- Notes：
