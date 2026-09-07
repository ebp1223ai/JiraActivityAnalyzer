# Package v2.0.1 相容性補充

本文件補充 Frozen Database Design／SQLite DDL v2.0.0，並不取代或重寫其內容。

## 核准變更範圍

2026-09-07 使用者核准：修正 Skill ID Schema 與版本綁定，然後完成 55 筆分析及驗收檔案。

Package Schema 只有四處語意差異：`$id`、`title`、`schemaVersion.const` 與 `skillFinding.skillId.pattern`。

```text
舊：^[A-Z]+_[0-9]{3}$
新：^[A-Z]+(?:_[A-Z]+)*_[0-9]{3}$
```

格式合法不等於技能合法；仍必須查 Catalog v0.3.5 的實際 ID／名稱。這次不新增 Skill、不改 Skill ID、不改分類語意。

## SQLite 不變的依據

- Frozen DDL `ai_skill_findings.skill_id` 是 TEXT NOT NULL。
- 唯一約束為 `(analysis_id, skill_id)`，不是 Skill ID 字串樣式限制。
- 沒有對 Skill ID 底線數量限制的 CHECK／Trigger。
- `package_schema_version`／`package_contract_version` 是 TEXT，可記錄版本，但資料值與資料表結構是不同概念。
- 在記憶體 DB 執行原 DDL 後，279 個 Catalog ID 寫入及讀回完全一致；不需 DDL 遷移。
- 未開啟使用者的實際 AI DB，不能藉此宣稱所有已安裝 JAA 建置都沒有額外程式限制。

## 後續 JAA 匯入器需檢查的項目（本次未實作）

1. 明確接受 Package v2.0.0 與 v2.0.1，各自使用相應 Frozen Schema；不覆蓋舊 Schema。
2. 更新 bundled schema、規則綁定白名單、schema version 判斷與 Skill ID 的任何重複驗證邏輯。
3. 相同 Source Trace v1.0.0 沿用既有 column projection、Identity、Relink 與 LEFT JOIN；不可把 Hash 納入關聯。
4. 新批次紀錄實際 Package 版本。歷史批次版本不可整批改寫為 v2.0.1。
5. 維持 completed review rank 保護、冪等、transaction rollback 與 append-only link attempts。
6. 增加 279 ID 全覆蓋、95 個舊 pattern 失敗 ID、未知 ID、各 Review Rank、舊 Package 及新 Package 的 importer regression。
7. 更新 App 並再產生 EXE 時至少 v0.3.43；不得重用已鎖定 v0.3.42 的 EXE 版本。

## HTML 實作欄位澄清

舊 Template 對 `reviewCoverage` 與 `templateBinding` 使用概念名稱，但 Package 頂層 additionalProperties=false。本次不藉此新增 DB 或 Package 欄位：

- Coverage 從正式 reviewRank／counts 推導。
- 人工工具身分寫入允許擴充的 `generator.templateBinding`。
- 原始分析所依據的 `rulesBinding.htmlTemplate` 始終不可變。
- 原 Pending filename／檔案 SHA 放在 `generator` 的來源資訊；不更動 Pending metadata。

## 版本與完成度界線

契約／分析／HTML 完成，不等於 JAA App 實作完成。分析 Package 為 AI_ONLY；人工 GUI Release Gate 仍由使用者實際驗收決定。
