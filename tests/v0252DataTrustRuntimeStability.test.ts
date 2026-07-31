import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CURRENT_STATE_SCHEMA_VERSION, createCurrentStateDatabase } from "../electron/currentStateArchive.js";
import { queryDatabaseIssueEvents } from "../electron/databaseViewer.js";
import { initialRuntimeState, StartupCheckCoordinator } from "../electron/runtimeStatus.js";
import { reconcileRunChain } from "../electron/runReconciliation.js";
import { evaluateStabilityGate } from "../electron/stabilityGate.js";
import { normalizeActivityChange } from "../src/utils/normalizedChange.js";

const comparison = (classification: string, missingIssueKeys: string[] = [], missingEntries: string[] = []) => ({
  enabled: true as const, baselineFound: true, snapshotKey: "synthetic", classification: classification as never, confidence: "normal" as const,
  shouldRetry: classification.startsWith("suspicious_"), retryReason: "", baselineCounts: { bestAtomEntryCount: 100, bestParsedActivityCount: 100, bestIssueKeyCount: 10, bestEntryFingerprintCount: 100 },
  currentCounts: { atomEntryCount: 100 - missingEntries.length, parsedActivityCount: 100 - missingEntries.length, issueKeyCount: 10 - missingIssueKeys.length, entryFingerprintCount: 100 - missingEntries.length },
  missingIssueKeys, missingEntryFingerprints: missingEntries, newIssueKeys: [], newEntryFingerprints: [], baselineUpdated: false, baselineUpdateReason: "", baselinePath: "synthetic"
});

const fallback = normalizeActivityChange({ fieldName: "Comment", eventType: "comment_updated", after: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Full after" }] }] } });
assert.equal(fallback.beforeAvailability, "unavailable");
assert.equal(fallback.diffStatus, "fallback_full_after");
assert.equal(fallback.diffBasis, "after_only");
assert.equal(fallback.displayContent, "Full after");
const unchanged = normalizeActivityChange({ fieldName: "Comment", eventType: "comment_updated", before: "same", after: "same" });
assert.equal(unchanged.diffStatus, "unchanged");
assert.equal(unchanged.diffBasis, "after_full_display");
assert.equal(unchanged.displayContent, "same");
const descriptionUnavailable = normalizeActivityChange({ fieldName: "Description", eventType: "field_changed", after: "new" });
assert.equal(descriptionUnavailable.diffStatus, "unavailable");
assert.equal(descriptionUnavailable.diffBasis, "not_available");
const created = normalizeActivityChange({ fieldName: "Comment", eventType: "comment_created", before: null, after: "created" });
assert.equal(created.beforeAvailability, "not_applicable");
assert.equal(created.diffStatus, "changed");
const empty = normalizeActivityChange({ fieldName: "Status", before: "Open", after: "" });
assert.equal(empty.afterAvailability, "empty");
const malformed = normalizeActivityChange({ fieldName: "Description", before: '{"type":"doc"', after: "new" });
assert.equal(malformed.beforeAvailability, "parse_failed");
assert.equal(JSON.stringify(fallback).includes("[object Object]"), false);

assert.equal(evaluateStabilityGate({ comparison: comparison("first_observation") }).outcome, "stable_initial");
assert.equal(evaluateStabilityGate({ comparison: comparison("suspicious_count_regression"), retryRecovered: true }).outcome, "stable_after_retry");
const usable = evaluateStabilityGate({ comparison: comparison("suspicious_known_entries_missing", [], ["one"]), allRoundsCompleted: true, requestFailureCount: 0, reconciliationPassed: true, fingerprintConsistent: true, userContinueDecision: { accepted: true, decidedAt: "2026-07-31T00:00:00.000Z" } });
assert.equal(usable.outcome, "unstable_usable");
assert.equal(usable.formalDatabaseWriteAllowed, false);
assert.equal(usable.workflowAllowed, true);
assert.equal(evaluateStabilityGate({ comparison: comparison("suspicious_mixed_regression", ["A", "B"], Array.from({ length: 8 }, (_, index) => String(index))), allRoundsCompleted: true, reconciliationPassed: true, fingerprintConsistent: true }).outcome, "unstable_blocked");
assert.equal(evaluateStabilityGate({}).outcome, "not_evaluated");

assert.equal(reconcileRunChain({ activityStream: { runId: "a" }, timeline: { runId: "t", parentRunId: "a" }, fullFetch: { runId: "f", parentRunId: "t" }, databaseSave: { runId: "d", parentRunId: "f" } }).status, "passed");
assert.equal(reconcileRunChain({ activityStream: { runId: "a" }, timeline: { runId: "t", parentRunId: "wrong" } }).status, "failed");

const runtime = initialRuntimeState();
const coordinator = new StartupCheckCoordinator(async () => ({ ...runtime.jira, requestId: undefined as never }), async () => ({ ...runtime.database, requestId: undefined as never }));
const settingsChanged = coordinator.markJiraSettingsChanged({ settingsFingerprint: "fp-1", baseUrlNormalized: "https://jira.example.invalid", username: "synthetic", authType: "bearer" });
assert.equal(settingsChanged.jira.status, "SETTINGS_CHANGED");
assert.equal(settingsChanged.jira.connectionStatus, "settings_changed");

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 2, "v0.2.52 must not change SQLite schema");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0252-"));
const databasePath = path.join(tempRoot, "benchmark.sqlite");
try {
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.2.52-test", binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" }, databaseId: "synthetic-v0252-db", now: "2026-07-31T00:00:00.000Z" });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("BEGIN");
    db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("jira:issue:SYNTH-52", "native-52", "SYNTH-52", "SYNTH", "2026-07-31T00:00:00.000Z", "2026-07-31T00:00:00.000Z");
    db.prepare(`INSERT INTO current_issue_snapshots (source_object_id, summary, status, issue_type, priority, resolution, assignee, reporter, creator, labels_json, components_json, versions_json, start_date, due_date, jira_updated_at, snapshot_json, snapshot_updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, '[]', '[]', '[]', NULL, NULL, ?, '{}', ?)`).run("jira:issue:SYNTH-52", "Synthetic benchmark", "Done", "Task", "Medium", "2026-07-31T00:00:00.000Z", "2026-07-31T00:00:00.000Z");
    const insert = db.prepare(`INSERT INTO activity_events (id, source_object_id, event_type, event_time, actor_account_id, actor_display_name, field_id, field_name, from_value_json, to_value_json, source_record_id, event_identity_hash, event_identity_policy_version, identity_key_type, jira_native_source_id, source_provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, 'jira_changelog_history_item', ?, ?, ?)`);
    for (let index = 0; index < 3_000; index += 1) {
      const id = `event-${index}`;
      insert.run(id, "jira:issue:SYNTH-52", index % 3 === 0 ? "status_changed" : "field_changed", new Date(Date.UTC(2026, 6, 1) + index * 60_000).toISOString(), index % 2 ? "user-a" : "user-b", index % 2 ? "Synthetic A" : "Synthetic B", "status", "Status", '"Open"', '"Done"', `history-${index}:0`, crypto.createHash("sha256").update(id).digest("hex"), `history-${index}`, "jira_changelog", "2026-07-31T00:00:00.000Z");
    }
    db.exec("COMMIT");
  } finally { db.close(); }
  const simple = queryDatabaseIssueEvents(databasePath, "SYNTH-52", { page: 1, pageSize: 100, filters: { action: { values: ["status_changed"] } } });
  const compound = queryDatabaseIssueEvents(databasePath, "SYNTH-52", { page: 1, pageSize: 100, filters: { actor: { values: ["Synthetic A"] }, action: { values: ["field_changed"] }, before: { text: "Open" }, after: { text: "Done" } } });
  const cached = queryDatabaseIssueEvents(databasePath, "SYNTH-52", { page: 1, pageSize: 100, filters: { action: { values: ["status_changed"] } } });
  assert.equal(simple.filteredCount, 1_000);
  assert.equal(compound.filteredCount, 1_000);
  assert.equal(cached.diagnostics.cacheHit, true);
  assert.ok(simple.diagnostics.totalMs < 500, `simple query ${simple.diagnostics.totalMs}ms exceeded 500ms`);
  assert.ok(compound.diagnostics.totalMs < 1_000, `compound query ${compound.diagnostics.totalMs}ms exceeded 1000ms`);
  console.log(JSON.stringify({ benchmark: { simpleMs: simple.diagnostics.totalMs, compoundMs: compound.diagnostics.totalMs, cacheHit: cached.diagnostics.cacheHit } }));
} finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }

const analysisSource = fs.readFileSync(path.join(process.cwd(), "src/routes/AnalysisPage.tsx"), "utf8");
assert.ok(analysisSource.includes('data-testid="analysis-advanced-details-v252"'));
assert.equal(analysisSource.includes("false && userAnalysis.activeTab"), false);
assert.ok(analysisSource.includes("Selected User") && analysisSource.includes("Start Date") && analysisSource.includes("End Date"));
console.log("v0.2.52 focused data-trust/runtime/stability/usability checks passed");