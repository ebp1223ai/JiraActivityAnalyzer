# JiraActivityAnalyzer v0.3.37 Test and Verification Report

- Overall Status: **Partial / Manual Validation Pending**
- Source Commit: `0e60c25d35610e52c6ec371854f3d2f792376176`
- Build Version / Time: `0.3.37` / `2026/08/25 14:34:07`
- Automated: typecheck, focused v0.3.37 tests, Provider Adapter, Mock isolation, v0.3.31-v0.3.36 regressions, build, dist, Bridge verifier and two packaged renderer startups PASS.
- Offline real v0.3.36 replay: **NOT RUN** because an explicitly safe extracted `JAA_V0336_REPLAY_ROOT` was not supplied; the sensitive archive was not opened automatically.
- Live Provider: **NOT RUN**; no opt-in, providerContacted=false, token telemetry unavailable.
- Mock Provider is deterministic test evidence only and is not proof of a real Provider analysis.
- Manual Validation Pending: real 17-record recovery semantics, Managed OAuth, company Jira, production SQLite, Installer GUI.
- Warnings: Vite externalized existing renderer `node:crypto`; main chunk exceeds 500 kB; electron-builder reported duplicate dependency references and default Electron icon; authorized dirty package recorded `dirtyState=true` due to a pre-existing user report modification.