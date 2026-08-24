# JiraActivityAnalyzer v0.3.32 Decision Identity Alignment Report

Current v0.3.32 identities are aligned to:

- Decision Contract: `jaa-ai-analysis-decisions-v5`
- Decision Output Schema SHA-256: `19721fa527b12d776c0d7a1e51ada59c873eaa5a777d13f46ff8b7a10bd0f945`
- Prompt: `JAA-CHATGPT-ZH-TW-0.3.32` / `0.3.32-zh-TW-v13`
- Pipeline: `JAA-ANALYSIS-PIPELINE-0.3.32`
- Quality: `jaa-ai-analysis-quality-v3`
- Submission Result: `jaa-artifact-submission-result-v2`

Current runtime registry, v0.3.32 receipt factory, serializer, UI projection, and new-run identity tests use Decision v5. Historical v0.3.24-v0.3.28 adapter source still contains explicit v4 compatibility strings because the frozen Bridge path converts legacy tool payloads before producing current v5 receipts. Those strings are compatibility-only and are not selected as the current contract. Historical Debug replay may also contain v4 without contaminating the v0.3.32 registry.
