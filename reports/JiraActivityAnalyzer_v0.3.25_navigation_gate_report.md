# v0.3.25 Navigation Gate Report

Target Version: 0.3.25
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 771fe6dc0f0f16e674fc65c987ce4a86ce16b550
Branch: feat/v0.3.25-per-file-rule-selection-gated-results-workspace

Automated evidence is complete for synthetic contracts, regression, build, package inventory and isolated short launch. Managed OAuth, real Jira, production SQLite, formal 117-record analysis and clean Windows GUI remain Manual Validation Pending.

- Contract: jaa-analysis-navigation-decision-v1.
- Analysis Attempt is durably created before preflight and may remain without a Run.
- Preflight failures create a DENY receipt and do not create a fake Run.
- Capacity confirmation retains the linked Attempt/Run and does not navigate.
- Renderer navigation occurs only when navigationDecision.decision equals ALLOW.
- ALLOW requires a successful Run whose durable analyzed-result SHA-256 matches the committed Active Result.
- Failed, deferred and uncommitted results remain in Workspace.