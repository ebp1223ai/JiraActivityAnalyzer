# JiraActivityAnalyzer v0.3.26 Artifact Identity Root Cause Report

## 結論

v0.3.25 的 false identity mismatch 來自模型提交 JAA-owned identity，舊 Bridge 再以單一條件直接比較。`electron/analysisBridgeRuntimeV0318.ts:253-254` 對 `runId`、`sourceSha256`、`rulesSnapshotId` 使用 strict equality，僅對 `expectedRecordCount` 做 `Number()`；拒絕 receipt 只有 expected，沒有 observed、型別、normalization 或 state source。因此現存程式可證明設計缺陷，卻無法由缺失的原 Debug Folder 反推出當次是哪一欄與哪個字元不同。

## 舊版比對稽核

| 欄位 | Expected source | Observed source | v0.3.25 normalization | 可稽核結果 |
| --- | --- | --- | --- | --- |
| runId | `config.runId` | model tool args | 無 | strict mismatch 會拒絕 |
| sourceSha256 | `requestPackage.pendingSourceSha256` | model tool args | 無 | 大小寫／空白差異也會拒絕 |
| rulesSnapshotId | `config.rulesSnapshotId` | model tool args | 無 | strict mismatch 會拒絕 |
| expectedRecordCount | `requestPackage.inputRecordCount` | model tool args | `Number()` | 數值字串可通過 |

原始拒絕 receipt 未保存 observed 值與型別，指定的 v0.3.25 Debug Folder 亦不在 repository 或提供的 `_Test20260820/3.25` 中。實際 mismatch 欄位標記為 `unavailable`，不臆測。

## v0.3.26 修正

- JAA 於 Bridge 內持有 immutable `ApprovedArtifactIdentity`，模型不再回傳 JAA-owned identity。
- 模型只回傳一次性 `artifactSubmissionToken`、Decision v5、分析報告及摘要。
- Token 綁定 Run／Attempt／Thread／Turn，驗證 receipt 逐欄記錄 expected／observed／type／source；完整 token 不落盤。
- 可解碼提交先 durable persistence，再進入 token 與分層驗證。

狀態：程式稽核與 fixture regression `PASS`；真實 v0.3.25 submission replay 因原始證據缺失為 `Manual Validation Pending`。
