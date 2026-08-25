# v0.3.36 Lifecycle Reconciliation Report

Reconciliation 會重新開啟 Artifact、驗證 bytes／SHA-256、推導 analysis flags、核對第一個 FAILED validation stage 與 firstFailedStage，並拒絕 success outcome 同時帶 root error。測試涵蓋一致 receipt 與 durable Artifact 衍生狀態。

Artifact vocabulary 已統一為 `received`、`persisted`、`content_validated`、`formally_published`；動態 tool 成功最多回覆 `persisted`。Artifact final summary 與 provider final response 分別寫入 `artifact-final-summary.txt`、`provider-final-assistant-message.txt`。
