# v0.3.27 v0.3.26 Failure Replay

- Harness: `npm.cmd run replay:v0.3.26`
- Mode: TEST / REPLAY / NOT PRODUCTION；不呼叫 Provider、不寫 production SQLite。
- 結果：exit 2，`V0326_REPLAY_SOURCE_MISSING`。
- 原因：指定 `jira-activity-analyzer-debug-folder-20260821_120609` archive 或 extracted folder 未出現在 repository、既有 `_Test*` 或 Downloads 搜尋範圍。
- 狀態：**Manual Validation Pending**。

Synthetic v0.3.27 bridge path 已另由 `test:v0.3.27` 驗證 Manifest `{}`、52-segment read/ACK/finalize；不得視為真實 v0.3.26 archive replay 或 Managed OAuth 成功。
