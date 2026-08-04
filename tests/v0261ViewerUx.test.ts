import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { normalizeUiPreferences } from "../electron/uiPreferences.js";
import { resetTableLayout } from "../src/utils/tablePreferences.js";
import type { TablePreferences } from "../src/types/uiPreferences.js";

const columns = [
  { id: "required", required: true, defaultVisible: true, defaultWidth: 180 },
  { id: "optional", defaultVisible: true, defaultWidth: 220 },
  { id: "hidden", defaultVisible: false, defaultWidth: 160 }
];
const preferences: TablePreferences = {
  visibleColumns: ["required", "hidden"],
  columnOrder: ["hidden", "required", "optional"],
  columnWidths: { required: 333, hidden: 444 },
  pageSize: 100,
  pageIndex: 7,
  sort: { field: "required", direction: "desc" },
  filters: { required: { text: "keep-filter" } }
};
const reset = resetTableLayout(preferences, columns);
assert.deepEqual(reset.visibleColumns, ["required", "optional"]);
assert.deepEqual(reset.columnOrder, ["required", "optional", "hidden"]);
assert.deepEqual(reset.columnWidths, {});
assert.equal(reset.pageSize, 100);
assert.equal(reset.pageIndex, 7);
assert.deepEqual(reset.sort, preferences.sort);
assert.deepEqual(reset.filters, preferences.filters);

const legacyPreset = {
  id: "legacy-preset-1",
  viewerId: "issueViewer",
  tabId: "changelog",
  name: "Legacy preset",
  query: { filters: { field: { values: ["description"] } }, pageSize: 50 },
  updatedAt: "2026-08-04T00:00:00.000Z"
};
const normalized = normalizeUiPreferences({ filterPresets: [legacyPreset] });
assert.equal(normalized.filterPresets.length, 1);
assert.equal(normalized.filterPresets[0].id, legacyPreset.id);
assert.equal(normalized.filterPresets[0].name, legacyPreset.name);

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const issueSource = read("src/routes/IssueViewerPage.tsx");
const userSource = read("src/routes/UserViewerPage.tsx");
const dashboardSource = read("src/routes/DashboardPage.tsx");
const diffSource = read("src/components/DescriptionDiffCell.tsx");
const previewSource = read("src/components/DescriptionOriginalPreviewCell.tsx");
const detailSource = read("src/components/ActivityEventDetailPanel.tsx");
const sqliteTableSource = read("src/components/SqliteDataTable.tsx");
const databaseTableSource = read("src/components/DatabaseIssueTable.tsx");
const comparisonSource = read("src/components/ActivityComparisonTable.tsx");

for (const source of [issueSource, userSource, dashboardSource]) {
  assert.doesNotMatch(source, /FilterPresetControl|saveFilterPresets|Filter Preset|Preset Name/);
}
assert.doesNotMatch(diffSource, /Sync scroll|syncScroll|beforePane|afterPane|Collapse row/);
assert.match(diffSource, /Before Original/);
assert.match(diffSource, /After Original/);
assert.match(diffSource, /Diff Hunks/);
assert.match(diffSource, /onExpandedChange\?\.\(!expanded\)/);
assert.match(previewSource, /onExpandedChange\(!expanded\)/);
assert.match(previewSource, /Hide Full Original \/ 隱藏完整原文/);
assert.match(previewSource, /View Full Original \/ 查看完整原文/);
assert.match(detailSource, /<DescriptionDiffCell row=\{row\} detail \/>/);
assert.doesNotMatch(detailSource, /<DescriptionDiffCell row=\{row\} expanded detail \/>/);
assert.match(issueSource, /mode="issue-changelog"/);
assert.match(issueSource, /mode="issue-events"/);
assert.match(userSource, /mode="user-events"/);
assert.match(comparisonSource, /DescriptionOriginalPreviewCell/);
assert.match(comparisonSource, /<DiffCell row=\{row\} expanded=\{context.expanded\} onExpandedChange=\{context.setExpanded\}/);
assert.match(sqliteTableSource, /Reset Table Layout \/ 重設表格版面/);
assert.match(sqliteTableSource, /resetTableLayout\(normalized/);
assert.doesNotMatch(sqliteTableSource, /table_query_reset|table_settings_reset/);
assert.match(databaseTableSource, /Reset Table Layout \/ 重設表格版面/);
assert.match(databaseTableSource, /onPreferencesChange\(\{ \.\.\.preferences, visibleColumns:/);

console.log("v0.2.61 viewer diff presentation and table layout UX tests passed.");