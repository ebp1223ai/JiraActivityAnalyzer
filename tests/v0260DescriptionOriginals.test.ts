import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import {
  queryDatabaseIssueEvents,
  queryDescriptionComparison,
  queryDescriptionOriginalPreviews
} from "../electron/databaseViewer.js";
import {
  DESCRIPTION_PREVIEW_LIMITS,
  comparisonIntegrity,
  originalContentMetadata,
  originalContentPreview,
  sha256Utf8
} from "../shared/descriptionComparison.js";
import { buildDescriptionDiff, type DescriptionDiffInput } from "../shared/descriptionDiff.js";

const richBefore = [
  "  first line  ",
  "second\tline",
  "third \u{1F469}\u200D\u{1F4BB}",
  "",
  "<script>literal evidence only</script>",
  "sixth line",
  "seventh line",
  ...Array.from({ length: 193 }, (_, index) => "stable line " + (index + 8))
].join("\r\n");
const richAfterLines = richBefore.split("\r\n");
richAfterLines[99] = "changed line 100";
const richAfter = richAfterLines.join("\r\n");

const metadata = originalContentMetadata(richBefore);
assert.equal(metadata.raw, richBefore);
assert.equal(metadata.lineCount, 200);
assert.equal(metadata.charCount, Array.from(richBefore).length);
assert.equal(metadata.byteCountUtf8, Buffer.byteLength(richBefore, "utf8"));
assert.equal(metadata.sha256Utf8, sha256Utf8(richBefore));
const standalonePreview = originalContentPreview(richBefore);
assert.equal(standalonePreview.truncated, true);
assert.equal(standalonePreview.preview?.startsWith("  first line  \r\nsecond\tline"), true);
assert.equal((standalonePreview.preview?.match(/\r\n/g)?.length ?? 0) <= DESCRIPTION_PREVIEW_LIMITS.maxLines, true);
assert.equal(Array.from(standalonePreview.preview ?? "").length <= DESCRIPTION_PREVIEW_LIMITS.maxCodePoints, true);

const diffInput: DescriptionDiffInput = {
  eventId: "event:integrity",
  issueKey: "SYNTH-60",
  fieldId: "description",
  fieldName: "Description",
  sourceType: "jira_changelog",
  sourceId: "history-integrity:0",
  changelogHistoryId: "history-integrity",
  changelogItemIndex: 0,
  before: { available: true, complete: true, value: "before", raw: "before" },
  after: { available: true, complete: true, value: "after", raw: "after" }
};
const integrityDiff = buildDescriptionDiff(diffInput);
assert.equal(comparisonIntegrity(originalContentMetadata("before"), originalContentMetadata("after"), integrityDiff).status, "verified");
assert.equal(comparisonIntegrity(originalContentMetadata("tampered"), originalContentMetadata("after"), integrityDiff).status, "mismatch");

assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0260-"));
const databasePath = path.join(tempRoot, "description-originals.sqlite");
try {
  createCurrentStateDatabase({
    targetPath: databasePath,
    appVersion: "0.2.60-test",
    binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" },
    databaseId: "synthetic-v0260-db",
    now: "2026-08-04T00:00:00.000Z"
  });
  const db = new DatabaseSync(databasePath);
  try {
    db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("jira:issue:SYNTH-60", "native-60", "SYNTH-60", "SYNTH", "2026-08-04T00:00:00.000Z", "2026-08-04T00:00:00.000Z");
    const insert = db.prepare("INSERT INTO activity_events (id, source_object_id, event_type, event_time, actor_account_id, actor_display_name, field_id, field_name, from_value_json, to_value_json, source_record_id, event_identity_hash, event_identity_policy_version, identity_key_type, jira_native_source_id, source_provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, ?, ?, ?, ?)");
    const time = "2026-08-04T08:00:00.000Z";
    insert.run("event:description-rich", "jira:issue:SYNTH-60", "field_changed", time, "synthetic-user", "Synthetic User", "description", "Description", JSON.stringify(richBefore), JSON.stringify(richAfter), "history-rich:0", "1".repeat(64), "jira_changelog_history_item", "history-rich", "jira_changelog", time);
    insert.run("event:description-empty", "jira:issue:SYNTH-60", "field_changed", time, "synthetic-user", "Synthetic User", "description", "Description", JSON.stringify(""), JSON.stringify("created"), "history-empty:0", "2".repeat(64), "jira_changelog_history_item", "history-empty", "jira_changelog", time);
    insert.run("event:description-unavailable", "jira:issue:SYNTH-60", "field_changed", time, "synthetic-user", "Synthetic User", "description", "Description", null, JSON.stringify("new only"), "history-unavailable:0", "3".repeat(64), "jira_changelog_history_item", "history-unavailable", "jira_changelog", time);
    insert.run("event:description-wrong-source", "jira:issue:SYNTH-60", "field_changed", time, "synthetic-user", "Synthetic User", "description", "Description", JSON.stringify("private before"), JSON.stringify("private after"), "comment-60", "4".repeat(64), "jira_comment_id", "comment-60", "jira_comment", time);
    insert.run("event:comment-same-time", "jira:issue:SYNTH-60", "comment_created", time, "synthetic-user", "Synthetic User", null, "Comment", null, JSON.stringify("private comment body"), "comment-same-time", "5".repeat(64), "jira_comment_id", "comment-same-time", "jira_comment", time);
  } finally {
    db.close();
  }

  const compact = queryDatabaseIssueEvents(databasePath, "SYNTH-60", {
    page: 1,
    pageSize: 25,
    sort: { field: "eventTime", direction: "asc" },
    filters: {}
  });
  const richRow = compact.rows.find((row) => row.eventId === "event:description-rich")!;
  assert.ok(richRow);
  assert.equal("before" in richRow, false);
  assert.equal("after" in richRow, false);
  assert.equal(JSON.stringify(richRow).includes("private comment body"), false);
  assert.equal(JSON.stringify(richRow).includes("literal evidence only"), false);
  assert.equal((richRow.descriptionDiff as { status: string }).status, "changed");
  const databaseIdentity = String(richRow.databaseIdentity);
  const generation = String(richRow.previewGeneration);
  assert.ok(databaseIdentity);
  assert.ok(generation);

  const previews = queryDescriptionOriginalPreviews(databasePath, {
    eventIds: ["event:description-rich", "event:description-empty", "event:description-unavailable", "event:description-wrong-source"],
    requestId: "preview-fixture",
    generation,
    databaseIdentity
  });
  assert.equal(previews.items.length, 4);
  const richPreview = previews.items.find((item) => item.activityEventId === "event:description-rich")!;
  assert.equal(richPreview.before.truncated, true);
  assert.equal(richPreview.before.preview, standalonePreview.preview);
  assert.equal(richPreview.before.sha256Utf8, sha256Utf8(richBefore));
  assert.equal("raw" in richPreview.before, false);
  const emptyPreview = previews.items.find((item) => item.activityEventId === "event:description-empty")!;
  assert.equal(emptyPreview.before.availability, "available-empty");
  assert.equal(emptyPreview.before.preview, "");
  const unavailablePreview = previews.items.find((item) => item.activityEventId === "event:description-unavailable")!;
  assert.equal(unavailablePreview.before.availability, "unavailable");
  assert.equal(unavailablePreview.before.preview, null);
  const mismatchPreview = previews.items.find((item) => item.activityEventId === "event:description-wrong-source")!;
  assert.equal(mismatchPreview.diff.status, "source-mismatch");
  assert.equal(mismatchPreview.before.preview, null);

  const comparison = queryDescriptionComparison(databasePath, {
    eventId: "event:description-rich",
    issueKey: "SYNTH-60",
    requestId: "comparison-fixture",
    generation,
    databaseIdentity
  });
  assert.equal(comparison.integrityStatus, "verified");
  assert.equal(comparison.before.raw, richBefore);
  assert.equal(comparison.after.raw, richAfter);
  assert.equal(comparison.before.lineCount, 200);
  assert.equal(comparison.before.sha256Utf8, comparison.diffInputBeforeSha256);
  assert.equal(comparison.after.sha256Utf8, comparison.diffInputAfterSha256);
  assert.equal(comparison.historyId, "history-rich");
  assert.equal(comparison.itemIndex, 0);
  assert.equal(comparison.canonicalFieldId, "description");

  const wrongIssue = queryDescriptionComparison(databasePath, {
    eventId: "event:description-rich",
    issueKey: "OTHER-1",
    requestId: "wrong-issue",
    generation,
    databaseIdentity
  });
  assert.equal(wrongIssue.diff.status, "source-mismatch");
  assert.equal(wrongIssue.before.raw, null);
  assert.throws(() => queryDescriptionOriginalPreviews(databasePath, {
    eventIds: Array.from({ length: 101 }, (_, index) => "event:" + index),
    requestId: "too-large",
    generation,
    databaseIdentity
  }), /DESCRIPTION_PREVIEW_BATCH_LIMIT/);
  assert.throws(() => queryDescriptionComparison(databasePath, {
    eventId: "event:description-rich",
    issueKey: "SYNTH-60",
    requestId: "stale",
    generation,
    databaseIdentity: "stale-database"
  }), /DESCRIPTION_ORIGINAL_REQUEST_STALE/);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const root = process.cwd();
const issueSource = fs.readFileSync(path.join(root, "src/routes/IssueViewerPage.tsx"), "utf8");
const userSource = fs.readFileSync(path.join(root, "src/routes/UserViewerPage.tsx"), "utf8");
const cellSource = fs.readFileSync(path.join(root, "src/components/DescriptionDiffCell.tsx"), "utf8");
const previewSource = fs.readFileSync(path.join(root, "src/components/DescriptionOriginalPreviewCell.tsx"), "utf8");
for (const source of [issueSource, userSource]) {
  assert.doesNotMatch(source, /Use validated Diff controls/);
  assert.match(source, /DescriptionOriginalPreviewCell/);
}
for (const label of ["Before Original", "After Original", "Diff Hunks", "Copy Original", "Show Whitespace", "Wrap", "Sync scroll"]) {
  assert.match(cellSource, new RegExp(label));
}
assert.match(previewSource, /offset \+= 100/);
assert.match(previewSource, /databaseIdentity \+ ":" \+ generation/);
assert.doesNotMatch(cellSource + previewSource, /dangerouslySetInnerHTML/);
console.log("v0.2.60 exact original evidence, preview batch, integrity, and comparison UX tests passed.");
