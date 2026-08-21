# v0.3.30 Bridge Resolver Report

`resolveAnalysisBridgeArtifactV0330` is the single resolver for development and packaged execution. Packaged mode resolves only under `process.resourcesPath/jaa-analysis-bridge`; it does not inspect PATH, cwd, APP_ROOT, Downloads, source trees, or older Bridge filenames.

Focused tests cover ready, missing/invalid manifest, missing artifact, directory in place of file, version/size/hash mismatch, transport/Decision mismatch, loadability failure, stale Bridge, cwd/PATH non-fallback, and idempotent dispatch ledger projection. Exact root errors are retained in the preflight receipt.
