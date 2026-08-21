# v0.3.27 Debug Completeness

新增 context、handle、tool-call 與 artifact-token receipts。Tool evidence 只記 argument names 與安全狀態，不記值。Template canonical path 為 `template-snapshots/Skill_Analysis_HTML_Report_Template_v1.5.0.md`，不再要求不存在的 `render-workspace/html-report-template.md`。

Completeness vocabulary 固定為六類：`expected_and_present`、`expected_but_missing`、`not_produced_due_to_prior_failure`、`not_applicable_no_model_delivery`、`not_applicable_no_submission`、`not_applicable_instruction_mode`。Diagnostic Package 只在已發生可解碼 submission 後才是 expected。
