# v0.3.30 Bridge Root Cause Replay

Source: `jira-activity-analyzer-debug-folder-20260821_172952.7z` (read-only)

- Historical Run: `analysis_1dbf6b20-12a5-439f-856c-0fd92bf2004e`
- Historical root error: `AI_BRIDGE_UNAVAILABLE`
- Failure stage: `starting_thread`
- Provider request/dispatch/thread/turn counts: all 0
- Provider stream bytes: 0
- Token state: `actual_zero_no_model_dispatch`
- Quote Map: 282 source quotes, 282 model-visible quotes, 17/17 records covered

Root cause in source: the build produced `analysis-bridge-v0329.cjs`, while the loader searched for `analysis-bridge-v0328.cjs`; packaged resources also lacked a dedicated external Bridge resource. This was a local packaged Bridge failure before Provider contact, not a ChatGPT analysis failure.
