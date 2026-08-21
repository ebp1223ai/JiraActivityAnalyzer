# v0.3.29 Run Manifest Writer Report

Each `AiAnalysisRunArchive` owns one `RunManifestWriterV0329`. It writes a unique temp file, fsyncs, closes, performs bounded EPERM/EBUSY retry at 25/75/225/500/1000 ms, verifies reopen hash, and appends safe writer events.

The real 15:52 archive preserved orphan EPERM evidence. Fault injection required three attempts (EPERM, EPERM, success), left no temp orphan, and preserved the source archive hash.
