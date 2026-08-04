import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createCurrentStateDatabase, CURRENT_STATE_SCHEMA_VERSION } from "../electron/currentStateArchive.js";
import { queryDatabaseIssueEvents, queryDescriptionFullContext } from "../electron/databaseViewer.js";
import { DESCRIPTION_DIFF_LIMITS, buildDescriptionDiff, resolveDescriptionFullContext, type DescriptionDiffInput } from "../shared/descriptionDiff.js";

const input = (overrides: Partial<DescriptionDiffInput> = {}): DescriptionDiffInput => ({
  eventId: "event:description-1", issueKey: "SYNTH-1", fieldId: "description", fieldName: "Description",
  sourceType: "jira_changelog", sourceId: "history-1:0", changelogHistoryId: "history-1", changelogItemIndex: 0,
  before: { available: true, complete: true, value: "Before line" }, after: { available: true, complete: true, value: "After line" }, ...overrides
});
assert.equal(CURRENT_STATE_SCHEMA_VERSION, 3);
const base = buildDescriptionDiff(input());
assert.equal(base.status, "changed");
assert.equal(base.sourceType, "jira_changelog");
assert.equal(base.sourceId, "history-1:0");
assert.equal(base.addedLines, 1);
assert.equal(base.deletedLines, 1);
assert.equal("beforeText" in base, false);
assert.equal("afterText" in base, false);
assert.equal(buildDescriptionDiff(input({ sourceType: "jira_comment" })).status, "source-mismatch");
assert.equal(buildDescriptionDiff(input({ fieldId: "comment", fieldName: "Comment" })).status, "source-mismatch");
assert.equal(buildDescriptionDiff(input({ sourceId: "history-2:0" })).diagnosticsCode, "DESCRIPTION_EVENT_IDENTITY_MISMATCH");
assert.equal(buildDescriptionDiff(input({ eventId: "" })).status, "source-mismatch");
assert.equal(buildDescriptionDiff(input({ before: { available: false, complete: false } })).status, "before-unavailable");
assert.equal(buildDescriptionDiff(input({ after: { available: false, complete: false } })).status, "after-unavailable");
assert.equal(buildDescriptionDiff(input({ before: { available: true, complete: true, value: "" }, after: { available: true, complete: true, value: "created" } })).status, "changed");
assert.equal(buildDescriptionDiff(input({ before: { available: true, complete: true, value: "A  B\r\n" }, after: { available: true, complete: true, value: "A B\n\n" } })).status, "whitespace-only");
assert.equal(buildDescriptionDiff(input({ before: { available: true, complete: true, value: "same" }, after: { available: true, complete: true, value: "same" } })).status, "unchanged");

const before200 = Array.from({ length: 200 }, (_, index) => `line ${index + 1}`);
const after200 = [...before200]; after200[99] = "line 100 changed";
const one = buildDescriptionDiff(input({ before: { available: true, complete: true, value: before200.join("\n") }, after: { available: true, complete: true, value: after200.join("\n") } }));
assert.equal(one.status, "changed");
assert.equal(one.hunks.length, 1);
assert.equal(one.hunks[0].lines.length, 6);
assert.equal(one.hunks[0].lines.filter((line) => line.kind === "context").length, 4);
assert.equal(one.hunks.flatMap((hunk) => hunk.lines).some((line) => line.text === "line 1"), false);
const separated = [...before200]; separated[19] = "changed twenty"; separated[179] = "changed one eighty";
assert.equal(buildDescriptionDiff(input({ before: { available: true, complete: true, value: before200.join("\n") }, after: { available: true, complete: true, value: separated.join("\n") } })).hunks.length, 2);

const english = buildDescriptionDiff(input({ before: { available: true, complete: true, value: "The quick fox" }, after: { available: true, complete: true, value: "The swift fox" } }));
assert.equal(english.hunks[0].lines.some((line) => line.inlineSegments?.some((segment) => segment.kind === "insert" && segment.text.includes("swift"))), true);
const cjk = buildDescriptionDiff(input({ before: { available: true, complete: true, value: "使用舊版本" }, after: { available: true, complete: true, value: "使用新版本" } }));
assert.equal(cjk.hunks[0].lines.some((line) => line.inlineSegments?.some((segment) => segment.kind === "insert" && segment.text.includes("新"))), true);
const emoji = buildDescriptionDiff(input({ before: { available: true, complete: true, value: "Ready 😀" }, after: { available: true, complete: true, value: "Ready 🚀" } }));
assert.equal(JSON.stringify(emoji).includes("�"), false);
const html = buildDescriptionDiff(input({ before: { available: true, complete: true, value: "<p>safe</p>" }, after: { available: true, complete: true, value: "<script>alert(1)</script><p>safe changed</p>" } }));
assert.equal(JSON.stringify(html).includes("<script"), false);
const adf = buildDescriptionDiff(input({ before: { available: true, complete: true, value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "old" }] }] } }, after: { available: true, complete: true, value: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }] } } }));
assert.equal(JSON.stringify(adf).includes("[object Object]"), false);
assert.equal(buildDescriptionDiff(input({ before: { available: true, complete: true, value: "x".repeat(DESCRIPTION_DIFF_LIMITS.maxCharacters + 1) } })).status, "diff-too-large");
const full = resolveDescriptionFullContext(input(), "event:description-1");
assert.equal(full.status, "ready"); assert.equal(full.beforeText, "Before line");
assert.equal(resolveDescriptionFullContext(input(), "event:other").status, "source-mismatch");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0259-"));
const databasePath = path.join(tempRoot, "description.sqlite");
try {
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.2.59-test", binding: { serverIdentity: "synthetic-server", baseUrlNormalized: "https://jira.example.invalid" }, databaseId: "synthetic-v0259-db", now: "2026-08-04T00:00:00.000Z" });
  const db = new DatabaseSync(databasePath);
  try {
    db.prepare("INSERT INTO source_objects (id, jira_issue_id, issue_key, project_key, first_saved_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").run("jira:issue:SYNTH-1", "native-1", "SYNTH-1", "SYNTH", "2026-08-04T00:00:00.000Z", "2026-08-04T00:00:00.000Z");
    const insert = db.prepare("INSERT INTO activity_events (id, source_object_id, event_type, event_time, actor_account_id, actor_display_name, field_id, field_name, from_value_json, to_value_json, source_record_id, event_identity_hash, event_identity_policy_version, identity_key_type, jira_native_source_id, source_provenance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 3, ?, ?, ?, ?)");
    const time = "2026-08-04T08:00:00.000Z";
    insert.run("event:description-db", "jira:issue:SYNTH-1", "field_changed", time, "user-1", "Synthetic User", "description", "Description", JSON.stringify("before description"), JSON.stringify("after description"), "history-db:0", "1".repeat(64), "jira_changelog_history_item", "history-db", "jira_changelog", time);
    insert.run("event:comment-db", "jira:issue:SYNTH-1", "comment_created", time, "user-1", "Synthetic User", null, "Comment", null, JSON.stringify("private comment body"), "comment-1", "2".repeat(64), "jira_comment_id", "comment-1", "jira_comment", time);
  } finally { db.close(); }
  const result = queryDatabaseIssueEvents(databasePath, "SYNTH-1", { page: 1, pageSize: 25, sort: { field: "eventTime", direction: "asc" }, filters: {} });
  const description = result.rows.find((row) => row.eventId === "event:description-db")!;
  assert.equal(description.commentId, null);
  assert.equal(description.commentBody, undefined);
  assert.equal((description.descriptionDiff as { status: string }).status, "changed");
  assert.equal(JSON.stringify(description).includes("private comment body"), false);
  const context = queryDescriptionFullContext(databasePath, { eventId: "event:description-db", issueKey: "SYNTH-1", requestId: 7, revision: 3 });
  assert.equal(context.status, "ready"); assert.equal(context.requestId, 7); assert.equal(context.beforeText, "before description");
} finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }

const root = process.cwd();
const issueSource = fs.readFileSync(path.join(root, "src/routes/IssueViewerPage.tsx"), "utf8");
const userSource = fs.readFileSync(path.join(root, "src/routes/UserViewerPage.tsx"), "utf8");
const cellSource = fs.readFileSync(path.join(root, "src/components/DescriptionDiffCell.tsx"), "utf8");
assert.doesNotMatch(issueSource, /row\.commentBody \?\? activityEventAfter\(row\)/);
assert.doesNotMatch(userSource, /row\.commentBody \?\? activityEventAfter\(row\)/);
assert.match(cellSource, /Show Full Context/);
assert.match(cellSource, /Description source mismatch/);
assert.doesNotMatch(cellSource, /dangerouslySetInnerHTML/);
console.log("v0.2.59 Description source identity, hunk rendering, full-context, and privacy tests passed.");
