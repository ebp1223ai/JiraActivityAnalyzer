# v0.3.25 Results UI Report

Target Version: 0.3.25
Overall Status: Partial / Manual Validation Pending
Package Source Commit: 771fe6dc0f0f16e674fc65c987ce4a86ce16b550
Branch: feat/v0.3.25-per-file-rule-selection-gated-results-workspace

Automated evidence is complete for synthetic contracts, regression, build, package inventory and isolated short launch. Managed OAuth, real Jira, production SQLite, formal 117-record analysis and clean Windows GUI remain Manual Validation Pending.

- Results reads only snapshot.activeResult and the successful result registry.
- Failed Run fallback through runs[0] was removed.
- Successful history is a compact selector.
- Active header displays record count, package-derived statistics, lineage hashes and Package/HTML/SQLite states.
- Diagnostics, provider conversation, token metrics, Bridge details and failure lifecycle were removed from Results and remain available in Workspace.
- Report, HTML and review actions operate on the Active Dataset.