# v0.3.27 Bridge Context 根因報告

v0.3.26 Prompt 宣告 Run/Attempt/Request/Thread/Turn identity 由 JAA 擁有，但 model-visible `jaa_get_input_manifest` schema 與 handler 同時要求模型傳入 `runId`。模型曾傳入 folder basename 與裸 UUID，均與權威 `analysis_<uuid>` 不同，根因為契約矛盾而非規則檔或模型分類失敗。

v0.3.27 以每 Run 獨立 `BridgeExecutionContextV0327` closure 取代 model-owned identity。工具註冊、Thread、Turn、Delivery 與 Terminal 依狀態機推進；tool call 在 Turn 尚未綁定時等待有界 barrier。完整 context 只寫入本機安全 evidence，不進入 tool schema。

原始 Debug Bundle 未提供，因此上述真實 argument 與時間鏈依需求文件記錄，archive-level 唯讀重播仍為 Manual Validation Pending。
