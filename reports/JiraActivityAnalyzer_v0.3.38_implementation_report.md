# Jira Activity Analyzer v0.3.38 Implementation Report

## Scope

Implemented the independent AI Analysis Database, strict unified-package
import, review-rank protection, source-link diagnostics, AI-only viewer,
raw-left-join integrated viewer, query export, and Debug Bundle diagnostics.
The v0.3.37 AI engine remains source-compatible and is archived only at the
navigation boundary.

## Frozen Inputs

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Import Schema v1.0.0 | 31380 | `6d51b5fb613b5ff957ab815e6702cf23845d5fce0124fb73b224983a39986a8c` |
| HTML Template v1.10.0 | 70754 | `54e626b846aecd122f5c1b92ea2932e566e0d8fee9fb7204d31d10b54a9666a0` |
| Rule Set Manifest v1.4.0 | 8731 | `d1f7dc4f6c0cc094176e8a89feef7cb43b63ddce12915d688e01fc93bf67b4ce` |
| Skill Catalog v0.3.4 | 30237 | `f9d3e28542e9ebd19b097ab33c59602fc00aa317022fab2a33ee77e25adf89a4` |
| Common Rules v2.4.0 | 22078 | `1a44d74f2e08af7eb2a19e302415ae9e81082a67fa94c7ac265382b5a89a9ff7` |
| Database Design v1.0.0 | 55233 | `da5d56d03188fbcb090d7d8858137249d2f364ba952c4e1ea2e2de5df8ee6bb7` |
| AI-only Golden Package | 921424 | `ea677c6f77bf7c3fefdb1f37333aba4d071fd4470fba939f3a9ba295fa28d70f` |
| Reviewed Golden Package | 973965 | `38791edcc2206f98c586bb34f1819a4e2b34215788ff2a28b515a41d4c0402da` |

## Automated Evidence

- Fresh AI-only import: 59 records, 86 findings.
- Reviewed import: 59 completed records, 81 accepted findings,
  5 evidence-insufficient rejects, and 10 status disagreements.
- Duplicate packages are idempotent.
- Lower review rank produces 59 protected skips in the protection fixture.
- Replacement retains record ID and first import time while increasing row version.
- Synthetic failure after three records rolls back records and batch receipt.
- Every import/relink produces append-only source-link attempts.
- No live Jira, AI provider, or production Source Archive writes are performed.

Final packaging and artifact hashes are recorded in the v0.3.38 verification
report after `dist` completes.

## Final Packaging

- Source commit: `15e955bddaa157d8a9f9c3c0914c47a970614630`
- Build version / time: `0.3.38` / `2026/09/01 15:25:29`
- Installer, Portable, and win-unpacked were built successfully.
- Packaged bridge diagnostic passed for win-unpacked and Portable.
- Artifact hashes are in `JiraActivityAnalyzer_v0.3.38_build_manifest.json`.
- Overall acceptance is `PARTIAL / MANUAL GUI VALIDATION PENDING` because the legacy full UI smoke harness fails on an existing preload bridge mismatch.
## Legacy UI Smoke Harness Alignment

- Root cause confirmed as harness drift: removed `connections.testAndSave` API, stale Sidebar text, and incorrect Debug Log toggle.
- Production preload, IPC validation, context isolation, DB identity gate, and `nodeAccess=false` were not relaxed.
- Default current-contract smoke validates 11 routes, five viewports, Debug Log expanded/collapsed, overflow, clipping, Build Time, and Sidebar.
- Legacy deep checks remain opt-in through `npm run test:ui:legacy-deep`.
- Development renderer, win-unpacked, and isolated Portable UI smoke passed.
- Harness correction commit: `84994583aa425baebda13af5344e975bdfbdbdf2`.
- Manual GUI acceptance remains pending; no Tag or Push was performed.