# v0.3.29 HTML Status Regression Report

The nonexistent `legacy.setHtmlRenderStatus` call was removed. The current bridge stores HTML lifecycle state directly; successful render receipts set `completed`, while genuine renderer failures alone produce `AI_HTML_RENDER_FAILED`.

Source contract test and production build passed; no real post-fix AI HTML run was executed.
