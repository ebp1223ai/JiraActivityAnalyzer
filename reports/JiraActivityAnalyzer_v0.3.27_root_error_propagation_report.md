# v0.3.27 Root Error Propagation

Lifecycle 分開保存 `rootErrorCode/rootErrorStage/rootErrorMessage` 與 `derivedErrorCodes[]`。第一個 root error 不被後續 delivery、validation、HTML 或 SQLite consequence 覆蓋。

回歸案例先產生 `AI_BRIDGE_CONTRACT_MISMATCH`，再加入 `AI_MODEL_INPUT_DELIVERY_INCOMPLETE`；最終 root 仍為前者，後者只列為 derived。Workspace 同時顯示根因階段/訊息與衍生結果。
