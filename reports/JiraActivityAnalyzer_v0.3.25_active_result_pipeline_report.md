# v0.3.25 Active Result Pipeline Report

Target Version: 0.3.25
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 771fe6dc0f0f16e674fc65c987ce4a86ce16b550
Branch: feat/v0.3.25-per-file-rule-selection-gated-results-workspace

Automated evidence is complete for synthetic contracts, regression, build, package inventory and isolated short launch. Managed OAuth, real Jira, production SQLite, formal 117-record analysis and clean Windows GUI remain Manual Validation Pending.

- Contract: jaa-active-analysis-result-v1.
- Automatic analysis and manual analyzed JSON import call the same ActiveResultRegistry commit path.
- Eligible results must be terminal-success, non-empty, exact count, durable, reopenable and SHA-256 verified.
- Failed, partial, cancelled, timeout, invalid and zero-result Runs cannot replace Active.
- Same artifact SHA-256 is idempotent.
- Successful history is ordered by authoritative completion time rather than filesystem mtime.
- Package, HTML and SQLite are represented as independent downstream states; package-derived statistics never use diagnostics or model self-report.