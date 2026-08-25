# v0.3.36 Post-Artifact Recovery Report

`jaa-post-artifact-pipeline-v1` 以 `SHA-256(runId:artifactSha256)` 為 idempotency key，保存 durable stage ledger。相同 key 重入會跳過已 PASSED／test-isolated stages，FAILED 或未完成 stage 可重試；stage order 會 fail closed。

聚焦測試模擬前三階段後重新建立 service，從第一個未完成 stage 繼續，七個非 SQLite side effects 各執行一次，SQLite 為 `NOT_RUN_BY_TEST_ISOLATION`。真實 v0.3.35 corrected-host recovery 因 Debug Bundle 安全阻擋未執行。
