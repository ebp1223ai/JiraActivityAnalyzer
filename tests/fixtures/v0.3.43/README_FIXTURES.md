# 合成 Fixtures 與正式程式測試的接法

所有本目錄資料為synthetic，可依repo政策提交；不是公司真實事件。v201的skill/evidence文字用於結構回歸，不聲稱AI分類品質。

- legacy_v200：保留原v042的3/44筆Package、44/113三Rank、missingDiff negative、SourceLink golden。舊binding與Trace原樣保留。
- v201：55筆/130findings三Rank與Pending原文、1record/279findings Catalog完整ID測試、合法mixed manual review案例。
- facet-cases：同欄自排除、跨欄AND、多值OR、已選zero count、array去重的精確row IDs與候選counts。
- review-projection-cases：獨立AI/manual欄位語意oracle；不是完整import Package。
- diff-cases：完整/compact/missing/unchanged/conflict/error/escaping/XSS。
- integration-cases：Raw母體、孤立、noFanout、SQL error。
- generate-large-facet-fixture.cjs：stdout輸出10001合成event，不寫任何DB。可重導至repo外臨時JSON再透過專案真實seed adapter匯入。

必須連接到實際Raw/AI repositories與IPC，不直接將本目錄JSON當renderer成功回傳。Raw schema不在本包中臆造；Codex按現場schema建立只供測試的seed adapter，驗證identity/field/eventTime/action對應。測試adapter不打包進production。

本包附帶package-validator.cjs是前次Workbench的離線結構/語意驗證器，非JAA importer；其中effective()是舊工具運算概念，禁止直接用作本版人工確認欄。完整binding校驗另由validate-input執行。對本版結果表必須遵守review-projection案例與R43-04。

先跑輸入包驗證，只能得到INPUT_BUNDLE_ONLY PASS。再將相同case餵實際服務與UI，取得真正App test結果。不能因fixture自己的oracle計算一致就宣稱JAA功能正常。
