# v0.3.35 v0.3.34 Artifact Replay Report

- Status: **SECURITY BLOCKED / NOT RUN**
- Provider contacted: `false`
- Production SQLite written: `false`
- Production Active Result changed: `false`

The required real Debug Bundle could contain sensitive diagnostics. The execution environment explicitly rejected extraction/read access and instructed that no indirect workaround be used without informed user approval. Therefore the fixed expectations (4 files, 17 records, 319220 bytes, 80 segments, 17 decisions, 44 findings, 79 references) were not reported as PASS. The offline replay script exists and fails closed when isolated extracted input is absent.
