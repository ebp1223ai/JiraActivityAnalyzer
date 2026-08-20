# v0.3.25 Rule Selection Transaction Report

Target Version: 0.3.25
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 771fe6dc0f0f16e674fc65c987ce4a86ce16b550
Branch: feat/v0.3.25-per-file-rule-selection-gated-results-workspace

Automated evidence is complete for synthetic contracts, regression, build, package inventory and isolated short launch. Managed OAuth, real Jira, production SQLite, formal 117-record analysis and clean Windows GUI remain Manual Validation Pending.

- Contract: jaa-rule-set-selection-transaction-v1.
- Four independent roles: manifest, common_rules, catalog and html_template.
- Per-role selection updates Draft only. Synthetic tests prove 1/4, 2/4 and 3/4 do not replace Active.
- 4/4 validation performs exact basename, UTF-8, bytes, SHA-256, version and Manifest binding checks before one Active commit.
- Invalid hash preserves the previous Active Set. Cancel Draft and explicit Bundled activation are covered.
- Manual Active restart reopens all four paths and fails closed if validation cannot be repeated.
- No bundled/manual source mixing or silent fallback is implemented.