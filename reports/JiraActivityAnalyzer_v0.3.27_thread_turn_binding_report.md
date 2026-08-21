# v0.3.27 Thread / Turn Binding

Context 在 dynamic tools 註冊後維持 `TOOLS_REGISTERED`。`thread/started` 只綁定一次 Thread，`turn/started` 只綁定同 Thread 的 Turn；第一次 tool call 可等待 Turn barrier。cross-thread、cross-turn、錯誤 toolRegistrationId、過期或 terminal context 均 fail closed。

Synthetic integration 驗證 delayed binding 後第一個 Manifest call 成功，兩個並行 Run 的 `toolRegistrationId` 不相同且不交叉解析。真實 Managed OAuth event timing 未執行。
