# v0.3.28 Runtime Manifest Root Cause

The v0.3.27 bridge called `AnalysisBridgeV0319` to create the source manifest, spread that object, and replaced only `schemaVersion`. The inherited `transportProtocol` therefore remained `bridge-resumable-v2` while every surrounding identity claimed v3. The actual provider response in the supplied archive proves schema v3 plus transport v2.

v0.3.28 uses `createModelInputManifestV3` to construct every model-visible field explicitly. The post-serialization validator decodes the exact response text before it is sent. A mismatch produces root `AI_RUNTIME_MANIFEST_PROTOCOL_MISMATCH`; delivery, analysis, and artifact omissions remain derived consequences.

The pre-run `undefined: undefined` originated from `ai-analysis:choose-pending`: success returned no `ok: true`, while the renderer treated `!result.ok` as failure. The producer now returns `ok: true`, and renderer failures use a stable normalizer fallback.
