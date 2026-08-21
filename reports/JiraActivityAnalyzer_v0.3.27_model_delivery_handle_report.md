# v0.3.27 Model Delivery Handle

Manifest 成功後以 256-bit CSPRNG 簽發 `jaa-model-delivery-handle-v1`。完整值僅出現在受控 tool argument/result；durable receipt 只保存 SHA-256、8 字元 prefix、scope、expiry 與 consumed 狀態。

測試涵蓋 missing、invalid、expired、cross-turn/scope mismatch 與 replay，共 5 類拒絕。52 segments 完成 final ACK 後建立 Model Delivery Receipt；Debug tool-call evidence 未包含完整 handle 或 artifact token。
