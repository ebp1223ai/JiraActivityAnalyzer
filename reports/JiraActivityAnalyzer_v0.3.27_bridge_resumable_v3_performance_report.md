# v0.3.27 bridge-resumable-v3 效能報告

相同 synthetic fixture 共 52 segments：v3 combined read/ACK 使用 53 calls；v2 分離 read/ACK 等價為 104 calls，少 51 calls（約 49.0%）。bytes/hash/EOF/final ACK 完整性由同一 legacy transport authority 驗證。

本報告只說明 transport tool-call overhead。Provider duration、wall time 與 token telemetry 為 `unavailable`，不宣稱 ChatGPT 推理速度改善。
