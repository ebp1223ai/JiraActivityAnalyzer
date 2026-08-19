# v0.3.22 HTML Template／Renderer 報告

Automated Status：`PASS`

- Template：`Skill_Analysis_HTML_Report_Template_v1.2.0.md`。
- Renderer：`JAA-LOCAL-HTML-RENDERER-1.2.0`。
- Renderer 僅接受 validated Canonical Result 與 manifest-bound frozen template，HTML 不送給 Provider。
- Offline self-contained、CSP、無 remote resource／fetch／XHR／WebSocket；來源文字以 `textContent` 顯示並做 script-injection regression。
- 支援 include／exclude multi-select、同欄 OR／跨欄 AND、Skill any/all、排序、20/50/100/ALL 分頁、欄位顯示、CSV、列印、資料字典與 readable/raw evidence。
- HTML／receipt 使用 durable atomic write、reopen/hash verification；相同輸入 deterministic hash 通過。
- HTML failure 與 SQLite failure 不會抹除已完成 Canonical Result。
