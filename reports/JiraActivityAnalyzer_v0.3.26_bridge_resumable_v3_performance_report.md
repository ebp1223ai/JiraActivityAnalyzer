# JiraActivityAnalyzer v0.3.26 Bridge Resumable v3 Performance Report

- Bridge：`0.3.26-bridge-v8`
- Transport：`bridge-resumable-v3`
- Combined tool：`jaa_read_and_ack_next_segment`
- Submission tool：`jaa_publish_analysis_artifacts_v5`

相同 fixture 實測完整傳送 52 segments。v3 使用 53 calls（52 次 read/ack + 1 次 submission）；v2 等價流程為 104 calls，減少 51 calls（49.0%）。完整性與 resume cursor 測試通過。

Provider duration、wall time、input/cached/output/reasoning/total tokens、provider-stream bytes 與 conversation bytes：`unavailable`，因本輪未呼叫真實 Provider。不得將 tool-call 減少解讀為 ChatGPT 推理時間必然縮短。
