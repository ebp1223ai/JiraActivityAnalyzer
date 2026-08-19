import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const ISSUE_SNAPSHOT_CONTRACT_VERSION = "jaa-run-issue-snapshot-v1" as const;
export type IssueSnapshot = { issueId: string | null; issueKey: string; projectKey: string; issueType: { id: string | null; name: string } | null; priority: { id: string | null; name: string } | null; jiraStatus: { id: string | null; name: string } | null; summary?: string | null; assignee?: string | null };
export type IssueSnapshotReceipt = { schemaVersion: "jaa-run-issue-snapshot-receipt-v1"; contractVersion: typeof ISSUE_SNAPSHOT_CONTRACT_VERSION; expectedUniqueIssueCount: number; resolvedCount: number; missingCount: number; conflictCount: number; sourceDatabaseIdentity: string | null; capturedAt: string; snapshotSha256: string; diagnostics: string[] };
const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, stable((value as Record<string, unknown>)[key])])) : value;
const hash = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
export const normalizeIssueKey = (value: string) => value.trim().toUpperCase();

export function buildRunIssueSnapshots(issueKeys: string[], resolve: (issueKey: string) => IssueSnapshot | null, options: { sourceDatabaseIdentity?: string | null; capturedAt?: string } = {}) {
  const unique = [...new Set(issueKeys.map(normalizeIssueKey).filter(Boolean))]; const snapshots: IssueSnapshot[] = []; const diagnostics: string[] = []; let missingCount = 0; let conflictCount = 0;
  for (const issueKey of unique) { const snapshot = resolve(issueKey); if (!snapshot) { missingCount += 1; diagnostics.push(`MISSING_ISSUE_SNAPSHOT:${issueKey}`); snapshots.push({ issueId: null, issueKey, projectKey: issueKey.split("-")[0] ?? "資料未提供", issueType: null, priority: null, jiraStatus: null }); continue; } if (normalizeIssueKey(snapshot.issueKey) !== issueKey) { conflictCount += 1; diagnostics.push(`ISSUE_SNAPSHOT_KEY_CONFLICT:${issueKey}:${snapshot.issueKey}`); } snapshots.push({ ...snapshot, issueKey }); }
  const receipt: IssueSnapshotReceipt = { schemaVersion: "jaa-run-issue-snapshot-receipt-v1", contractVersion: ISSUE_SNAPSHOT_CONTRACT_VERSION, expectedUniqueIssueCount: unique.length, resolvedCount: unique.length - missingCount, missingCount, conflictCount, sourceDatabaseIdentity: options.sourceDatabaseIdentity ?? null, capturedAt: options.capturedAt ?? new Date().toISOString(), snapshotSha256: hash(snapshots), diagnostics };
  return { snapshots, receipt, warning: missingCount || conflictCount ? "report_enrichment_warning" as const : null };
}

export function loadRunIssueSnapshotsFromSqlite(databasePath: string, issueKeys: string[], capturedAt?: string) {
  const absolute = path.resolve(databasePath);
  if (!fs.existsSync(absolute)) return buildRunIssueSnapshots(issueKeys, () => null, { sourceDatabaseIdentity: null, capturedAt });
  const stat = fs.statSync(absolute);
  const sourceDatabaseIdentity = hash({ path: absolute.toLocaleLowerCase("en-US"), size: stat.size, mtimeMs: stat.mtimeMs });
  const db = new DatabaseSync(absolute, { readOnly: true });
  try {
    const query = db.prepare(`SELECT o.id AS issueId, o.issue_key AS issueKey, o.project_key AS projectKey,
      s.issue_type AS issueType, s.priority, s.status AS jiraStatus, s.summary, s.assignee
      FROM source_objects o LEFT JOIN current_issue_snapshots s ON s.source_object_id=o.id
      WHERE UPPER(TRIM(o.issue_key))=?`);
    return buildRunIssueSnapshots(issueKeys, (issueKey) => {
      const row = query.get(issueKey) as Record<string, unknown> | undefined;
      return row ? { issueId: row.issueId === null || row.issueId === undefined ? null : String(row.issueId), issueKey: String(row.issueKey ?? issueKey), projectKey: String(row.projectKey ?? issueKey.split("-")[0] ?? "資料未提供"), issueType: row.issueType ? { id: null, name: String(row.issueType) } : null, priority: row.priority ? { id: null, name: String(row.priority) } : null, jiraStatus: row.jiraStatus ? { id: null, name: String(row.jiraStatus) } : null, summary: row.summary ? String(row.summary) : null, assignee: row.assignee ? String(row.assignee) : null } : null;
    }, { sourceDatabaseIdentity, capturedAt });
  } finally { db.close(); }
}
export function calculateIssueStatistics<T extends { issueKey: string }>(records: T[], snapshots: IssueSnapshot[] = []) {
  const counts = new Map<string, number>(); records.forEach((record) => { const key = normalizeIssueKey(record.issueKey); if (key) counts.set(key, (counts.get(key) ?? 0) + 1); });
  const snapshotByKey = new Map(snapshots.map((snapshot) => [normalizeIssueKey(snapshot.issueKey), snapshot]));
  const distribution = (select: (snapshot: IssueSnapshot | undefined, issueKey: string) => string) => Object.fromEntries([...counts.keys()].map((key) => select(snapshotByKey.get(key), key) || "資料未提供").reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>()));
  return { activityEventCount: records.length, uniqueIssueCount: counts.size, issuesWithMultipleEvents: [...counts.values()].filter((count) => count > 1).length, duplicateEventOccurrences: records.length - counts.size, projectDistribution: distribution((snapshot, key) => snapshot?.projectKey ?? key.split("-")[0] ?? "資料未提供"), issueTypeDistribution: distribution((snapshot) => snapshot?.issueType?.name ?? "資料未提供"), priorityDistribution: distribution((snapshot) => snapshot?.priority?.name ?? "資料未提供"), jiraIssueStatusDistribution: distribution((snapshot) => snapshot?.jiraStatus?.name ?? "資料未提供") };
}
