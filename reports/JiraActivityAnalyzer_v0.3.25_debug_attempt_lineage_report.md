# v0.3.25 Debug Attempt Lineage Report

Target Version: 0.3.25
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 771fe6dc0f0f16e674fc65c987ce4a86ce16b550
Branch: feat/v0.3.25-per-file-rule-selection-gated-results-workspace

Automated evidence is complete for synthetic contracts, regression, build, package inventory and isolated short launch. Managed OAuth, real Jira, production SQLite, formal 117-record analysis and clean Windows GUI remain Manual Validation Pending.

- Current Analysis Attempt directory is tracked independently from the selected canonical Run.
- A preflight-only attempt exports current-attempt evidence.
- Debug collection no longer falls back to the newest prior Run when the current attempt has no Run.
- Canonical Run evidence is copied only when the current selected Run path is an exact known candidate.
- The short launch diagnostics showed did-finish-load and no renderer crash, white-screen, unresponsive or fatal events.