# Pending Analysis Contract v0.3.0

- Schema name: `jira-activity-analyzer.pending-analysis`
- Schema version: `0.3.0-draft.1`
- Contract status: `review-draft`
- Encoding: readable UTF-8 JSON, LF, no compression
- Timezone: `Asia/Taipei`; `createdAt` contains `+08:00`

## Envelope

| Field | Type | Source / Semantics | Nullable |
|---|---|---|---|
| `exportId` | string | main-process run UUID | No |
| `sourceView` | enum | Issue Activity Events or User All Activity Events | No |
| `sourceDatabase.sourceDatabaseId` | string | Current-State `database_metadata.database_id` | No |
| `jiraServerFingerprint` | string | saved Jira server identity hash | No |
| `jiraServerHost` | string | sanitized host only | No |
| `sourceSchemaVersion` | number | Current-State schema; remains v3 | No |
| `databaseGeneration` | string | hash of runtime file identity; contains no path | No |
| `querySnapshot` | object | frozen typed filters, date, Diff quick filters, sort, revision and subject | No |
| `filterSnapshotHash` | SHA-256 | canonical query/subject JSON excluding page/pageSize | No |
| `counts` | object | start/export/skipped/failed/batch counts | No |
| `records` | array | complete matched set in deterministic sort order | No |
| `integrity` | object | canonical records digest, count, schema, completion, algorithm | No |

## Record Sections

`evidenceIdentity` contains deterministic `evidenceId`, stable activity event ID, stable source record ID, DB ID, Jira fingerprint, Issue/history/item/comment/field identity, source type and source content hash. `evidenceId` is SHA-256 over database ID + canonical source identity + canonical content hash; SQLite `rowid` is never used.

`eventMetadata` contains event time/type/action, stable actor identity and display value, project key, source/provenance and integrity status.

`analysisContent` contains exact SQLite `beforeRaw`/`afterRaw`, availability, SHA-256, canonical Diff status/reason/hunks/counts, substantive-change flag, parsed convenience values and diagnostics. Description hashes and hunks come from the existing canonical Diff pipeline. No preview, current Description, Comment, or latest-value fallback can replace original evidence.

`currentIssueContext` contains current saved summary/project/type/status/priority/labels/components/assignee/reporter/creator/start/due/snapshot time. Its semantics are explicitly `CURRENT_SAVED_ISSUE_SNAPSHOT`, never event-time. Project name and current Description are `null` when not reliably projected.

`relatedContextCandidates.sameHistoryItems` is an empty bounded list with `UNAVAILABLE` diagnostic in this draft. No unbounded Issue history or remote request is performed.

## Canonicalization and Integrity

Object keys are sorted recursively; arrays retain deterministic query order. SHA-256 uses UTF-8 canonical JSON. Each record has a canonical record hash; the top level has a canonical records-array digest. The UI separately reports the final whole-file SHA-256 to avoid self-reference.

Success requires `filteredCountAtStart == exportedCount`, zero skipped/failed records, complete source DB identity, unchanged database generation, valid records digest, and atomic final rename.

## Fatal / Non-fatal Matrix

| Condition | Handling |
|---|---|
| No records, DB unavailable/changed, invalid snapshot, count mismatch | Fatal; no final JSON |
| Missing DB/event stable identity, unsafe path/credential key, integrity failure | Fatal; no final JSON |
| Cancel/write/finalize/path failure | Fatal; partial cleanup |
| Missing history/comment/field where not applicable | Non-fatal null plus availability |
| same-history/current Description/project name unavailable | Non-fatal null/empty plus diagnostic |

## Open Review Items

Real exported content must determine which context fields remain, whether selected sets are needed, whether same-history/context expansion is valuable, and whether a later AI payload needs an internal/full versus minimized split. This contract is not final and does not claim readiness for AI skill classification.
