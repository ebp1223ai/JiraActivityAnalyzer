# Jira Activity Analyzer v0.3.4 人工驗證紀錄

## 狀態摘要

- Overall：**Partial**
- Automated synthetic production-path：**PASS**
- Packaged short launch：**PASS**
- Real SQLite / real-data GUI：**NOT RUN**

## 驗證矩陣

| 案例 | 狀態 | 證據／原因 |
|---|---|---|
| canonical Description identity priority | PASS | 合成測試涵蓋 fieldId、missing fieldId fallback、customfield 與包含 Description 的名稱 |
| Comment-only + 六種 Quick Filter 組合 | PASS | 每組 SQL count/rows 均保留 18 Comments |
| mixed Description + Comment | PASS | 54 candidates、36 retained；18 Comments 全數保留 |
| SQL page 1/2 與 progressive Issue pages | PASS | ordered event IDs 完全一致 |
| progressive User pages | PASS | 與 Issue／SQL ordered event IDs 完全一致 |
| Issue/User frozen export | PASS | 36 records、內容與 hashes 一致、Query Snapshot 保存 all-on filters |
| Compact schema / SQLite schema | PASS | `0.3.3-draft.1` / v3 |
| Windows Portable 短啟動 | PASS | 主視窗標題 v0.3.4，12 秒內 responding |
| Comment-only 實際 GUI | NOT RUN | 未獲授權讀取真實 SQLite |
| Description-only 實際 GUI | NOT RUN | 未獲授權讀取真實 SQLite |
| mixed-field 實際 GUI | NOT RUN | 未獲授權讀取真實 SQLite |
| 已知 Issue 48 / User 112 | NOT RUN | 不以合成數字冒充真實案例證據 |

## 建議人工步驟

1. 使用授權的測試 SQLite 開啟 Issue Viewer / Activity Events 與 User Viewer / All Activity Events。
2. Comment-only 條件下逐一切換四個 Description Quick Filters，確認 count 與 rows 不變。
3. Description-only 條件下確認 unchanged、zero added/deleted、before unavailable 依各開關排除。
4. mixed-field 條件下確認 Comment 永遠保留，Description 依開關變化。
5. 跨頁後執行 Compact export，核對 Viewer filtered count、export count、ordered IDs 與 Query Snapshot。
