import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createImeFilterState, reduceImeFilterState } from "../src/utils/imeFilterState.js";
import { compactDiff, normalizeActivityChange } from "../src/utils/normalizedChange.js";
import { canonicalizeRichContent } from "../src/utils/richContent.js";
import { normalizeTablePreferences } from "../src/utils/tablePreferences.js";
import { normalizeViewerTableSession, setViewerRowExpanded, stableViewerRowId, viewerQueryCacheKey } from "../src/utils/viewerSessionState.js";

const root = process.cwd();
const source = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

let ime = createImeFilterState("");
ime = reduceImeFilterState(ime, { type: "composition-start" });
ime = reduceImeFilterState(ime, { type: "composition-update", value: "中文組字" });
assert.equal(ime.pendingCommit, null);
assert.equal(ime.revision, 0);
assert.equal(reduceImeFilterState(ime, { type: "external", value: "stale" }).draftValue, "中文組字");
ime = reduceImeFilterState(ime, { type: "composition-end", value: "中文完成" });
assert.equal(ime.pendingCommit, "中文完成");
assert.equal(ime.revision, 1);
ime = reduceImeFilterState(ime, { type: "input", value: "中文完成" });
assert.equal(ime.revision, 1, "post-composition input must not duplicate the commit");
ime = reduceImeFilterState(ime, { type: "commit-applied", value: "中文完成" });
assert.equal(ime.committedValue, "中文完成");
assert.equal(ime.pendingCommit, null);

for (const component of ["src/components/DatabaseIssueTable.tsx", "src/components/SqliteDataTable.tsx"]) {
  const content = source(component);
  assert.match(content, /data-table-filter-row="layout"/);
  assert.doesNotMatch(content, /data-table-filter-row="overlay"/);
}
assert.doesNotMatch(source("src/components/ExcelFilterPopover.tsx"), /\b(?:absolute|fixed|z-\d+)\b/);

const richObject = { body: { type: "doc", attrs: { version: 1 }, content: [{ type: "paragraph", attrs: { localId: "a" }, content: [{ type: "text", text: "第一段" }] }, { type: "paragraph", content: [{ type: "text", text: "第二段" }] }] } };
const canonical = canonicalizeRichContent(richObject);
assert.match(canonical.displayText, /第一段/);
assert.match(canonical.displayText, /第二段/);
assert.doesNotMatch(canonical.displayText, /\[object Object\]/);
assert.equal(canonical.rawValue, richObject);

const created = normalizeActivityChange({ fieldName: "Comment", before: null, after: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "新增留言" }] }] } });
assert.deepEqual(compactDiff(created).map((item) => item.kind), ["added"]);
const deleted = normalizeActivityChange({ fieldName: "Comment", before: "刪除留言", after: null });
assert.deepEqual(compactDiff(deleted).map((item) => item.kind), ["removed"]);
const edited = normalizeActivityChange({ fieldName: "Description", before: "hello brave world", after: "hello bright world" });
const editedDiff = compactDiff(edited);
assert.ok(editedDiff.some((item) => item.kind === "removed" && item.text.length < "hello brave world".length));
assert.ok(editedDiff.some((item) => item.kind === "added" && item.text.length < "hello bright world".length));
const canonicalNoop = normalizeActivityChange({
  fieldName: "Description",
  before: { type: "doc", attrs: { version: 1 }, content: [{ type: "paragraph", attrs: { id: "old" }, content: [{ type: "text", text: "相同內容  \r\n" }] }] },
  after: { type: "doc", attrs: { version: 99 }, content: [{ type: "paragraph", attrs: { id: "new" }, content: [{ type: "text", text: "相同內容\u200b\n" }] }] }
});
assert.equal(canonicalNoop.diffKind, "none");
assert.deepEqual(compactDiff(canonicalNoop), []);
assert.notDeepEqual(canonicalNoop.beforeRaw, canonicalNoop.afterRaw);

const rowA = { issueKey: "SYNTH-1", changelogId: "100", historyItemIndex: 0, fieldName: "description" };
const rowB = { issueKey: "SYNTH-1", changelogId: "100", historyItemIndex: 1, fieldName: "description" };
assert.notEqual(stableViewerRowId(rowA), stableViewerRowId(rowB));
let tableState = normalizeViewerTableSession({ expandedRowIds: [stableViewerRowId(rowA)], scrollLeft: 14.4, scrollTop: 88.6 });
assert.equal(tableState.expandedRowIds.includes(stableViewerRowId([rowB, rowA][1])), true, "sorting must preserve expansion by stable identity");
tableState = setViewerRowExpanded(tableState, stableViewerRowId(rowB), true);
assert.equal(tableState.expandedRowIds.length, 2);
assert.equal(normalizeViewerTableSession({ expandedRowIds: ["", 9, "event:1", "event:1"], scrollTop: -5 }).expandedRowIds.length, 1);

const firstKey = viewerQueryCacheKey("db-1", "SYNTH-1", "events", { page: 2, pageSize: 25, filters: { status: { values: ["Done"] }, actor: { text: "測試" } }, sort: null });
const reorderedKey = viewerQueryCacheKey("db-1", "SYNTH-1", "events", { sort: null, filters: { actor: { text: "測試" }, status: { values: ["Done"] } }, pageSize: 25, page: 2 });
assert.equal(firstKey, reorderedKey);
assert.notEqual(firstKey, viewerQueryCacheKey("db-2", "SYNTH-1", "events", { page: 2, pageSize: 25, filters: { status: { values: ["Done"] }, actor: { text: "測試" } }, sort: null }));

const columns = [{ id: "eventTime", queryField: "eventTime", required: true, defaultWidth: 170 }, { id: "diff", queryField: "diff", defaultWidth: 400 }];
const normalizedPreference = normalizeTablePreferences({ pageSize: "broken", pageIndex: -10, filters: { unknown: { text: "bad" } }, columnWidths: { diff: 99999 } }, columns);
assert.equal(normalizedPreference.pageIndex, 1);
assert.ok(normalizedPreference.columnWidths.diff <= 640);
assert.equal("unknown" in (normalizedPreference.filters ?? {}), false);

const issueSource = source("src/routes/IssueViewerPage.tsx");
const userSource = source("src/routes/UserViewerPage.tsx");
for (const content of [issueSource, userSource]) {
  assert.match(content, /databaseIdentity/);
  assert.match(content, /pending\w*RequestId/);
  assert.match(content, /requestId !== latest/);
  assert.match(content, /tableStates/);
}
assert.match(issueSource, /loadedIssueKey/);
assert.match(userSource, /loadedUserId/);
assert.doesNotMatch(issueSource, /useEffect\(\(\) => \{[\s\S]{0,250}result: null, status: "initial"/);
assert.doesNotMatch(userSource, /useEffect\(\(\) => \{[\s\S]{0,250}detail: null/);

console.log("v0.2.51 IME, layout filter, rich-content diff, and viewer session contracts passed.");