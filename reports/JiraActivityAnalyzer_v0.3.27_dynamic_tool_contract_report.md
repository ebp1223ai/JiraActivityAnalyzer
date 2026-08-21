# v0.3.27 Dynamic Tool Contract

- `jaa_get_input_manifest`: `{}`，`additionalProperties=false`。
- Delivery tools：只接受 opaque handle、cursor、ACK；progress 只接受 handle 與進度欄位。
- Artifact tool：只接受 artifact token、Decision v5、報告與摘要。
- 所有 schema 均不含 Run/Attempt/Request/Thread/Turn/source/rules identity。
- Legacy `runId` argument 以 `AI_BRIDGE_CONTRACT_MISMATCH` fail closed，不提供 alias 或 normalization。
- 聚焦測試：PASS；Packaged ASAR bridge hash 與 source manifest 完全一致。
- 真實 Codex app-server Provider Turn event-order integration：Manual Validation Pending；未以 local handler fixture 冒充。
