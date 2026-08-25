# v0.3.36 Artifact Identity Report

Runtime identity 由 immutable `jaa-runtime-contract-registry-v2` 提供。Dispatch expected 與 Artifact-time Host actual 由兩次獨立 factory 建立，逐欄 receipt 記錄 expected、observed、match 與來源。

相同 v0.3.36 registry 通過；以 stale application 0.3.35／prompt 0.3.35／bridge v15 模擬的 actual identity 被 `IDENTITY_MISMATCH` 拒絕。真實 v0.3.35 stale 0.3.34 replay 因 Debug Bundle 讀取未獲安全核准而未執行。
