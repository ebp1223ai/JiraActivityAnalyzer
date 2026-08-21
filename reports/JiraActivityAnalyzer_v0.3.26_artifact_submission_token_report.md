# JiraActivityAnalyzer v0.3.26 Artifact Submission Token Report

- 實作：`electron/aiArtifactIdentityV0326.ts`
- entropy：256-bit cryptographic random token。
- scope：Run／Attempt／Thread／Turn。
- 儲存：只保存 SHA-256、prefix 與 binding receipt；UI、Debug、正式產物不保存完整 token。
- consumption：驗證成功或拒絕後即消耗，禁止 replay。
- fail-closed cases：missing、invalid、expired、scope mismatch、single-use/replay，共 6 類 fixture 已通過。
- 模型責任：只提交 opaque token；不產生 runId、source hash、rule snapshot identity。

`npm.cmd run test:v0.3.26` 驗證 `identityImmutable=true`、`tokenCases=6`。真實 Provider token 流程尚未執行，標記 `Manual Validation Pending`。
