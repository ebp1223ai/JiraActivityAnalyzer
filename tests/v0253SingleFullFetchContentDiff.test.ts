import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  decideCommentContent,
  decideContentDisplay,
  decideDescriptionContent,
  decideWorklogContent,
  type ContentValue
} from "../electron/contentDisplayDecision";
import { fetchJiraPages } from "../electron/jira/jiraPagination";
import { classifyWorklogCompleteness, normalizeWorklogs } from "../electron/worklogCompleteness";
import {
  createCurrentStateDatabase,
  currentStateCounts,
  migrateCurrentStateDatabaseToV3,
  writeCurrentStateBatch
} from "../electron/currentStateArchive";
import { defaultCompleteCoverage } from "../electron/coverageProfile";
import type { JiraHttpResult } from "../electron/jira/jiraTypes";

const source = (value: string | null, present = true, complete = true): ContentValue => ({
  present,
  text: value,
  complete,
  source: "changelog",
  sourceId: "history-1"
});

const response = (json: unknown, status: number | "-" = 200): JiraHttpResult => ({
  ok: typeof status === "number" && status >= 200 && status < 300,
  status,
  contentType: "application/json",
  json,
  errorType: status === 200 ? undefined : "HTTP_ERROR"
});

async function main() {
  const diff = decideContentDisplay({ before: source("Timeout = 10000"), after: source("Timeout = 15000") });
  assert.equal(diff.mode, "diff");
  assert.equal(diff.beforeComplete, true);
  assert.equal(diff.afterComplete, true);
  assert.equal(decideContentDisplay({ before: source("same"), after: source("same") }).mode, "diff");

  const latestComment = decideCommentContent({
    commentId: "200",
    before: null,
    comments: [
      { id: "199", text: "wrong nearby comment", complete: true },
      { id: "200", text: "Timeout 已調整為 15000", complete: true }
    ]
  });
  assert.equal(latestComment.mode, "latest_content");
  assert.equal(latestComment.displayText, "Timeout 已調整為 15000");
  assert.equal(latestComment.sourceId, "200");
  assert.equal(decideCommentContent({ commentId: "201", comments: [{ id: "200", text: "must not guess", complete: true }] }).mode, "empty");

  const description = decideDescriptionContent({
    before: null,
    currentDescription: { ...source("目前 Description"), source: "current_issue_field" }
  });
  assert.equal(description.mode, "latest_content");
  assert.equal(decideContentDisplay({ before: source("only before"), after: null }).mode, "empty");
  assert.equal(decideContentDisplay({ latest: source("") }).mode, "empty");
  assert.equal(decideContentDisplay({ latest: { ...source("bad"), parseFailed: true } }).mode, "parse_failed");

  const worklogLatest = decideWorklogContent({
    worklogId: "77",
    worklogs: [{ id: "77", text: "investigation complete", complete: true }]
  });
  assert.equal(worklogLatest.mode, "latest_content");
  assert.equal(decideWorklogContent({ worklogId: "78", worklogs: [{ id: "77", text: "must not guess", complete: true }] }).mode, "empty");
  assert.equal(decideWorklogContent({ worklogId: "77", worklogs: [], deleted: true }).mode, "empty");

  const worklogRows = [
    { id: "1", comment: "first", timeSpent: "1h", timeSpentSeconds: 3600 },
    { id: "2", comment: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "second" }] }] }, timeSpent: "30m", timeSpentSeconds: 1800 }
  ];
  const paged = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["worklogs"],
    pageSize: 1,
    fetchPage: async (startAt) => ({ result: response({ total: 2, worklogs: worklogRows.slice(startAt, startAt + 1) }), attempts: 1 })
  });
  const normalized = normalizeWorklogs({ worklogs: paged.items, issueId: "10001", issueKey: "TEST-1", sourceRunId: "run-53" });
  const complete = classifyWorklogCompleteness(paged.metadata, paged.metadata.pages.map((page) => page.status), normalized.parseErrorCount);
  assert.equal(complete.status, "complete");
  assert.equal(complete.uniqueWorklogCount, 2);
  assert.equal(normalized.records[1].commentText, "second");

  const duplicate = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["worklogs"],
    pageSize: 2,
    fetchPage: async (startAt) => ({ result: response({ total: 3, worklogs: startAt === 0 ? [{ id: "1" }, { id: "2" }] : [{ id: "2" }] }), attempts: 1 })
  });
  assert.equal(classifyWorklogCompleteness(duplicate.metadata, duplicate.metadata.pages.map((page) => page.status)).status, "incomplete");
  const forbidden = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["worklogs"],
    fetchPage: async () => ({ result: response(null, 403), attempts: 1 })
  });
  assert.equal(classifyWorklogCompleteness(forbidden.metadata, [403]).status, "permission_restricted");
  const unsupported = await fetchJiraPages<Record<string, unknown>>({
    itemFields: ["worklogs"],
    fetchPage: async () => ({ result: response(null, 404), attempts: 1 })
  });
  assert.equal(classifyWorklogCompleteness(unsupported.metadata, [404]).status, "unsupported");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0253-"));
  const databasePath = path.join(root, "current-state.db");
  const binding = { serverIdentity: "server-v53", baseUrlNormalized: "https://jira.example.test" };
  createCurrentStateDatabase({ targetPath: databasePath, appVersion: "0.2.53", binding });
  const issue = {
    issue: { id: "10001", key: "TEST-1", fields: { summary: "v53", created: "2026-07-31T00:00:00.000Z", updated: "2026-07-31T01:00:00.000Z", issuelinks: [] } },
    changelog: [],
    comments: [],
    worklogs: normalized.records,
    attachments: []
  };
  const first = writeCurrentStateBatch({
    operationId: "save-1",
    runId: "run-53",
    databasePath,
    jira: binding,
    items: [{ issueKey: "TEST-1", eligibility: "eligible", rawJson: issue, coverage: defaultCompleteCoverage({ issueLinks: 0 }) }]
  });
  assert.equal(first.ok, true);
  const second = writeCurrentStateBatch({
    operationId: "save-2",
    runId: "run-53-repeat",
    databasePath,
    jira: binding,
    items: [{ issueKey: "TEST-1", eligibility: "eligible", rawJson: issue, coverage: defaultCompleteCoverage({ issueLinks: 0 }) }]
  });
  assert.equal(second.ok, true);
  assert.equal(currentStateCounts(databasePath).worklogs, 2);
  const db = new DatabaseSync(databasePath);
  assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM worklogs").get() as { count: number }).count), 2);
  assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE source_worklog_id IS NOT NULL").get() as { count: number }).count) >= 2, true);
  db.prepare("UPDATE database_metadata SET schema_version=2 WHERE metadata_key='primary'").run();
  db.exec("DROP TABLE worklogs");
  db.close();
  const migrated = migrateCurrentStateDatabaseToV3(databasePath);
  assert.equal(migrated.migrated, true);
  assert.equal(currentStateCounts(databasePath).source_objects, 1);
  assert.equal(currentStateCounts(databasePath).worklogs, 0);

  const partial = writeCurrentStateBatch({
    operationId: "blocked",
    runId: "run-partial",
    databasePath,
    jira: binding,
    items: [{ issueKey: "TEST-2", eligibility: "partial" }]
  });
  assert.equal(partial.summary.excludedPartial, 1);
  assert.equal(currentStateCounts(databasePath).source_objects, 1);
  fs.rmSync(root, { recursive: true, force: true });
  console.log("v0.2.53 focused tests passed: content decisions, worklog pagination, SQLite dedupe, provenance, migration, and partial gate.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
