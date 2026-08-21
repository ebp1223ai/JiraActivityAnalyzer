# JiraActivityAnalyzer v0.3.26 v0.3.25 Submission Replay Report

已新增 local-only harness `scripts/replay-v0325-submission.cjs`，不呼叫 Provider、不修改 archive、不寫 production SQLite。

本機搜尋 repository runtime 與 `_Test20260820/3.25` 後，未找到規格所述 v0.3.25 Debug Folder 或唯一 tool submission；該資料夾只有 prompt 與四份 rule/template 文件。因此 17 decisions、index `0..16`、33 quotes、舊 mismatch 重現及新管線 replay 均不可聲稱已驗證。

狀態：harness implementation `PASS`；real submission replay `Manual Validation Pending`。需使用者另行提供原始 Debug Folder，再執行 `npm.cmd run replay:v0.3.25 -- <debug-folder>`。
