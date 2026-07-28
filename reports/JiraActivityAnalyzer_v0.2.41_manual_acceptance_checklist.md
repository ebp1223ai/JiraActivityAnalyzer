# JiraActivityAnalyzer v0.2.41 Manual Acceptance Checklist

Status: **NOT EXECUTED / 待實機驗收**

Use a newly created v0.2.41 database. Do not select or modify a v0.2.39 or v0.2.40 acceptance database.

| Round | Action | Expected | Status |
|---:|---|---|---|
| 1 | Full Fetch four selected Issues into the new database | 4 New | NOT EXECUTED |
| 2 | Immediately fetch the same Issues | 4 Existing | NOT EXECUTED |
| 3 | View/open the Jira Issues, then fetch again | 4 Existing | NOT EXECUTED |
| 4 | Observe only Debug/Working Days recalculation | 4 Existing; metrics may update | NOT EXECUTED |
| 5 | Manually change one business field in Jira | 1 meaningful Updated, 3 Existing | NOT EXECUTED |
| 6 | Manually add one Comment | Exactly one new `comment_created` | NOT EXECUTED |
| 7 | Manually edit that Comment | No second Created; one applicable Updated | NOT EXECUTED |
| 8 | Fetch again without changes | 4 Existing; 0 new Events | NOT EXECUTED |
| 9 | Run the deterministic missing/invalid Issue Links evidence test | Issue is blocked, prior state retained | PASSED BY AUTOMATED TEST |
| 10 | Run deterministic transaction failure injection | Entire Issue transaction rolls back | PASSED BY AUTOMATED TEST |

For each real round record outcome, stable hash prefix, policy fingerprint, revision, successful fetch count, payload hash/timestamp, observed metrics, Coverage evidence, event counts, and table row counts.

Focused real-Issue set:

- `COPGEN1-142541`
- `COPGEN1-138930`
- Two additional eligible Issues selected during the same test run

JiraActivityAnalyzer must not modify Jira. Rounds requiring edits are performed manually outside the application by an authorized user.
