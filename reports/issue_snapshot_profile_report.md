# Issue Snapshot Profile Report

- Identity：`jiraServerIdentity + normalizedIssueKey`；同 identity 不採 last-write-wins。
- Reference 至少含 snapshotId、snapshotSha256、jiraServerIdentity、normalizedIssueKey。
- Field states：PRESENT、EMPTY、NOT_APPLICABLE、NOT_CAPTURED、SOURCE_UNAVAILABLE、CONFLICT。
- Feature/Story/Task rootCause 為 NOT_APPLICABLE；來源不可用不偽造成空值。
- Synthetic dedup 與 unavailable field：PASS。Production SQLite source：Manual Validation Pending。
