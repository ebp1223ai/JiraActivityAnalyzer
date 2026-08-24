# v0.3.33 HTML Capability and Renderer Report

## Alignment

- Report Package capability: `LAYERED_VALIDATION_RECEIPTS_V2`
- Template: `Skill_Analysis_HTML_Report_Template_v1.5.1.md`
- Template SHA-256: `dee064f1746a550d7c1867c9305a7b4774bb1788c37d8c00ab3e4e1216aeee02`
- Renderer: `JAA-LOCAL-HTML-RENDERER-1.5.1`
- V1 fallback: not accepted.

AUTO_AFTER_CANONICAL and MANUAL_RESULTS_REGENERATE call the same renderer service. It validates capability/identity, renders self-contained escaped HTML, uses temporary write plus atomic rename, reopens and hashes output, and writes a durable success or failure receipt.

Canonical success with HTML failure now produces `completed_with_report_error`; Canonical remains viewable and active, while the UI shows HTML failure and offers manual regeneration. Debug collection includes the actual HTML/receipt or the structured failure receipt.

The real v0.3.32 archives reproduced the old V2 Package versus V1 Template failure. v1.5.1/V2 contract fixtures pass; no real Provider run was executed.
