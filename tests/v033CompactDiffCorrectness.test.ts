import assert from "node:assert/strict";
import { pendingAnalysisRecord } from "../electron/pendingAnalysisExport.js";
import { classifyViewerDiff, viewerDiffPassesFilters, type DiffQuickFilters, type ViewerDiffInput } from "../shared/viewerEfficiency.js";
import { PENDING_ANALYSIS_SCHEMA_VERSION, PendingAnalysisExportError, assertPendingAnalysisRecordSafe, sha256Canonical } from "../shared/pendingAnalysisContract.js";

const base = { issueKey: "SYNTH-330", sourceType: "jira_changelog", sourceId: "330:0", jiraNativeSourceId: "330" };
function classify(eventId: string, fieldName: string, before: unknown, after: unknown, fieldId = fieldName.toLowerCase().replace(/ /g, "_")) {
  return classifyViewerDiff({ ...base, eventId, fieldId, fieldName, before, after } as ViewerDiffInput);
}
function changes(diff: ReturnType<typeof classifyViewerDiff>) { return diff.diffHunks.flatMap((hunk) => hunk.lines).filter((line) => line.kind !== "context"); }
function assertChanged(diff: ReturnType<typeof classifyViewerDiff>, deleted: string[], inserted: string[]) {
  assert.equal(diff.status, "changed");
  assert.equal(diff.isSubstantiveChange, true);
  assert.ok(diff.diffHunks.length > 0);
  assert.deepEqual(changes(diff).filter((line) => line.kind === "delete").map((line) => line.text), deleted);
  assert.deepEqual(changes(diff).filter((line) => line.kind === "insert").map((line) => line.text), inserted);
  assert.equal(diff.deletedCount, deleted.length);
  assert.equal(diff.addedCount, inserted.length);
}

function recordFrom(eventId: string, fieldName: string, before: unknown, after: unknown) {
  const input = { ...base, eventId, fieldId: fieldName.toLowerCase(), fieldName, before, after };
  const diff = classifyViewerDiff(input);
  return pendingAnalysisRecord({ eventId, issueKey: base.issueKey, projectKey: "SYNTH", fieldId: input.fieldId, fieldName,
    sourceRecordId: base.sourceId, jiraNativeSourceId: base.jiraNativeSourceId, sourceProvenance: base.sourceType,
    before, after, beforeAvailable: diff.beforeAvailable, afterAvailable: diff.afterAvailable, diffStatus: diff.status,
    addedCount: diff.addedCount, deletedCount: diff.deletedCount, diffHunks: diff.diffHunks },
  { databaseId: "synthetic-db-v033", jiraServerFingerprint: "synthetic-jira-v033" });
}

function run() {
  assert.equal(PENDING_ANALYSIS_SCHEMA_VERSION, "0.3.3-draft.1");
  assertChanged(classify("status", "Status", '"IN PROGRESS"', '"In Review"'), ["IN PROGRESS"], ["In Review"]);
  for (const field of ["Assignee", "Resolution", "Priority", "Summary", "Start Date", "Due Date"]) {
    assertChanged(classify(field, field, '"old value"', '"new value"'), ["old value"], ["new value"]);
  }
  const insertOnly = classify("date-add", "Due Date", null, '"2026-08-10"');
  assertChanged(insertOnly, [], ["2026-08-10"]); assert.equal(insertOnly.beforeAvailable, false);
  const deleteOnly = classify("date-remove", "Start Date", '"2026-08-09"', null);
  assertChanged(deleteOnly, ["2026-08-09"], []); assert.equal(deleteOnly.afterAvailable, false);

  assert.equal(classify("labels-order", "Labels", '["beta","alpha"]', '["alpha","beta"]').status, "unchanged");
  assertChanged(classify("labels-add", "Labels", '["alpha"]', '["alpha","beta"]'), [], ["beta"]);
  assert.equal(classify("ordered-array", "Ordered Steps", '["first","second"]', '["second","first"]').status, "changed");
  assert.equal(classify("json-order", "Custom JSON", '{"b":2,"a":1}', '{"a":1,"b":2}').status, "unchanged");
  assertChanged(classify("json-change", "Custom JSON", '{"a":1,"b":"old"}', '{"b":"new","a":1}'), ['  "b": "old"'], ['  "b": "new"']);
  assertChanged(classify("attachment", "Attachment", '{"name":"old.txt","size":10,"localPath":"C:/temp/old.txt"}', '{"size":20,"name":"new.txt","localPath":"D:/runtime/new.txt"}'), ['  "name": "old.txt",', '  "size": 10'], ['  "name": "new.txt",', '  "size": 20']);
  assert.equal(JSON.stringify(classify("attachment", "Attachment", '{"name":"same.txt","localPath":"C:/temp/a"}', '{"name":"same.txt","localPath":"D:/temp/b"}').diffHunks).includes("temp"), false);
  assert.equal(classify("unicode-crlf", "Summary", '"繁體中文\r\n第二行"', '"繁體中文\n第二行"').status, "unchanged");
  assertChanged(classify("null-empty", "Custom", "null", '""'), ["<null>"], ["<empty string>"]);
  assert.equal(classify("empty-array", "Custom", "[]", "[]").status, "unchanged");

  const record = recordFrom("record-status", "Status", '"Open"', '"Closed"');
  assert.equal(record.diff.diffText, null);
  assertChanged({ ...classify("record-status", "Status", '"Open"', '"Closed"'), diffHunks: record.diff.diffHunks }, ["Open"], ["Closed"]);
  assertPendingAnalysisRecordSafe(record);
  const invalid = structuredClone(record);
  invalid.diff.diffHunks = [];
  const { recordSha256: _old, ...integrityBase } = invalid.integrity;
  invalid.integrity.recordSha256 = sha256Canonical({ reference: invalid.reference, diff: invalid.diff, integrity: integrityBase });
  assert.throws(() => assertPendingAnalysisRecordSafe(invalid), (error: unknown) => error instanceof PendingAnalysisExportError
    && error.code === "EXPORT_INTEGRITY_FAILED" && error.integrityReason === "DIFF_CONTENT_MISSING");

  const changed = classify("filter-changed", "Status", '"A"', '"B"');
  const unchanged = classify("filter-unchanged", "Status", '"A"', '"A"');
  const added = classify("filter-added", "Status", null, '"B"');
  const removed = classify("filter-removed", "Status", '"A"', null);
  const f = (overrides: Partial<DiffQuickFilters>): DiffQuickFilters => ({ hideNoChange: false, hideZeroAdded: false, hideZeroDeleted: false, hideBeforeUnavailable: false, ...overrides });
  assert.equal(viewerDiffPassesFilters(unchanged, f({ hideNoChange: true })), false);
  assert.equal(viewerDiffPassesFilters(changed, f({ hideNoChange: true })), true);
  assert.equal(viewerDiffPassesFilters(removed, f({ hideZeroAdded: true })), false);
  assert.equal(viewerDiffPassesFilters(added, f({ hideZeroDeleted: true })), false);
  assert.equal(viewerDiffPassesFilters(added, f({ hideBeforeUnavailable: true })), false);
  assert.equal(viewerDiffPassesFilters(changed, f({ hideNoChange: true, hideZeroAdded: true, hideZeroDeleted: true, hideBeforeUnavailable: true })), true);
  assert.equal(viewerDiffPassesFilters(added, f({ hideNoChange: true, hideZeroAdded: true, hideZeroDeleted: true, hideBeforeUnavailable: true })), false);

  console.log("v0.3.3 compact Diff correctness tests passed", JSON.stringify({ schemaVersion: PENDING_ANALYSIS_SCHEMA_VERSION, statusHunks: record.diff.diffHunks.length }));
}
run();
