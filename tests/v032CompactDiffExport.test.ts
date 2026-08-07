import assert from "node:assert/strict";
import crypto from "node:crypto";
import { pendingAnalysisRecord } from "../electron/pendingAnalysisExport.js";
import {
  PENDING_ANALYSIS_EXPORT_MODE,
  PENDING_ANALYSIS_SCHEMA_VERSION,
  PendingAnalysisExportError,
  assertNoEmbeddedFullContent,
  assertPendingAnalysisRecordSafe,
  canonicalJson,
  sha256Canonical
} from "../shared/pendingAnalysisContract.js";
import { buildDescriptionDiff } from "../shared/descriptionDiff.js";

const sha = (value: string) => crypto.createHash("sha256").update(value, "utf8").digest("hex");

function forbiddenKeys(value: unknown) {
  const forbidden = new Set(["beforeraw", "afterraw", "parsedbefore", "parsedafter", "before", "after", "beforecontent", "aftercontent", "fromvalue", "tovalue", "fromstring", "tostring", "oldvalue", "newvalue", "rawbefore", "rawafter"]);
  const found: string[] = [];
  const visit = (child: unknown, path = "$compact") => {
    if (Array.isArray(child)) child.forEach((item, index) => visit(item, `${path}[${index}]`));
    else if (child && typeof child === "object") for (const [key, item] of Object.entries(child as Record<string, unknown>)) {
      if (forbidden.has(key.toLowerCase())) found.push(`${path}.${key}`);
      visit(item, `${path}.${key}`);
    }
  };
  visit(value);
  return found;
}

function run() {
  assert.equal(PENDING_ANALYSIS_SCHEMA_VERSION, "0.3.2-draft.1");
  assert.equal(PENDING_ANALYSIS_EXPORT_MODE, "compact-reference");
  const common = Array.from({ length: 320 }, (_, index) => `unchanged line ${index}`);
  const beforeRaw = JSON.stringify({ type: "doc", content: [...common.slice(0, 160), "old substantive line", ...common.slice(160)] });
  const afterRaw = JSON.stringify({ type: "doc", content: [...common.slice(0, 160), "new substantive line", ...common.slice(160)] });
  const descriptionDiff = buildDescriptionDiff({
    eventId: "stable-event-v032", issueKey: "SYNTH-320", fieldId: "description", fieldName: "Description",
    sourceType: "jira_changelog", sourceId: "83462530:0", changelogHistoryId: "83462530", changelogItemIndex: 0,
    before: { available: true, complete: true, raw: beforeRaw, value: JSON.parse(beforeRaw) },
    after: { available: true, complete: true, raw: afterRaw, value: JSON.parse(afterRaw) }
  });
  assert.equal(descriptionDiff.status, "changed");
  const row = {
    eventId: "stable-event-v032", issueId: "320", issueKey: "SYNTH-320", projectKey: "SYNTH",
    eventTime: "2026-08-07T00:00:00.000Z", userId: "user-320", displayName: "Synthetic User",
    fieldId: "description", fieldName: "Description", sourceRecordId: "83462530:0",
    jiraNativeSourceId: "83462530", sourceProvenance: "jira_changelog", historyId: "83462530", itemIndex: 0,
    before: beforeRaw, after: afterRaw, beforeComplete: 1, afterComplete: 1, diffStatus: "changed",
    addedCount: descriptionDiff.addedLines, deletedCount: descriptionDiff.deletedLines, descriptionDiff
  };
  const source = { databaseId: "synthetic-db-v032", jiraServerFingerprint: "synthetic-jira-v032" };
  const first = pendingAnalysisRecord(row, source);
  const second = pendingAnalysisRecord(structuredClone(row), source);
  assert.deepEqual(first, second, "compact record and recordSha256 must be deterministic");
  assert.equal(first.reference.activityEventId, "stable-event-v032");
  assert.equal(first.reference.sourceRecordStableId, "83462530:0");
  assert.equal(first.reference.historyId, "83462530");
  assert.equal(first.reference.historyItemIndex, 0);
  assert.equal(first.reference.beforeSha256, sha(beforeRaw));
  assert.equal(first.reference.afterSha256, sha(afterRaw));
  assert.equal(first.diff.addedLineCount, 1);
  assert.equal(first.diff.removedLineCount, 1);
  assert.equal(first.diff.diffStatus, "changed");
  assert.equal(first.diff.isSubstantiveChange, true);
  assert.equal(first.diff.diffText, null);
  assert.ok(first.diff.diffHunks.flatMap((hunk) => hunk.lines).some((line) => line.kind === "delete" && line.text === "old substantive line"));
  assert.ok(first.diff.diffHunks.flatMap((hunk) => hunk.lines).some((line) => line.kind === "insert" && line.text === "new substantive line"));
  assert.deepEqual(forbiddenKeys(first), []);
  assertNoEmbeddedFullContent(first);
  const compactText = canonicalJson(first);
  assert.equal(compactText.includes(beforeRaw), false);
  assert.equal(compactText.includes(afterRaw), false);
  const legacyExpanded = canonicalJson({ beforeRaw, afterRaw, parsedBefore: JSON.parse(beforeRaw), parsedAfter: JSON.parse(afterRaw), diffHunks: descriptionDiff.hunks });
  assert.ok(Buffer.byteLength(compactText) < Buffer.byteLength(legacyExpanded) * 0.35, "compact record must be substantially smaller than duplicated full content");
  const { recordSha256, ...integrityBase } = first.integrity;
  assert.equal(recordSha256, sha256Canonical({ reference: first.reference, diff: first.diff, integrity: integrityBase }));
  assertPendingAnalysisRecordSafe(first);
  assert.throws(() => assertPendingAnalysisRecordSafe({ ...first, reference: { ...first.reference, issueKey: "TAMPER-1" } }), (error: unknown) => error instanceof PendingAnalysisExportError && error.code === "EXPORT_INTEGRITY_FAILED");
  assert.throws(() => assertNoEmbeddedFullContent({ nested: { beforeRaw: "must not serialize" } }), (error: unknown) => error instanceof PendingAnalysisExportError && error.code === "EXPORT_INTEGRITY_FAILED" && error.integrityReason === "FULL_CONTENT_FIELD_FORBIDDEN");

  const comment = pendingAnalysisRecord({
    eventId: "comment-v032", issueId: "320", issueKey: "SYNTH-320", projectKey: "SYNTH", eventTime: "2026-08-07T01:00:00.000Z",
    eventType: "comment_created", fieldId: "comment", fieldName: "Comment", sourceRecordId: "comment-99",
    jiraNativeSourceId: "comment-99", sourceProvenance: "jira_comment", before: null, after: "new comment body",
    beforeComplete: 0, afterComplete: 1, diffStatus: "changed", addedCount: 1, deletedCount: 0
  }, source);
  assert.equal(comment.diff.beforeAvailability, "UNAVAILABLE");
  assert.equal(comment.diff.afterAvailability, "AVAILABLE");
  assert.equal(comment.reference.afterSha256, sha("new comment body"));
  assert.equal(canonicalJson(comment).includes("new comment body"), false);
  assert.deepEqual(forbiddenKeys(comment), []);

  console.log("v0.3.2 compact Diff export tests passed", JSON.stringify({
    schemaVersion: PENDING_ANALYSIS_SCHEMA_VERSION,
    compactBytes: Buffer.byteLength(compactText),
    legacyExpandedBytes: Buffer.byteLength(legacyExpanded),
    diffHunks: first.diff.diffHunks.length
  }));
}

run();
