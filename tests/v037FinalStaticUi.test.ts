import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AiAnalysisTabs } from "../src/ai-analysis/AiAnalysisTabs.js";
import { analyzedDatasetFixture, pendingDatasetFixtures } from "../src/ai-analysis/fixtures.js";
import {
  analysisBlockers,
  analyzedFileName,
  buildStaticSkillReport,
  isAnalyzedActivityPayload,
  isPendingAnalysisPayload,
  reportFileName,
  sanitizeDiagnosticPayload,
  sanitizeText
} from "../src/ai-analysis/helpers.js";
import { skillCatalogFixture } from "../src/ai-analysis/skillCatalogFixture.js";
import { aiAnalysisReducer, initialAiAnalysisState } from "../src/ai-analysis/state.js";

const read = (file: string) => fs.readFileSync(path.resolve(file), "utf8");

function run() {
  const tabsSource = read("src/ai-analysis/AiAnalysisTabs.tsx");
  const tabBlock = tabsSource.slice(tabsSource.indexOf("const tabs"), tabsSource.indexOf("export function"));
  assert.equal((tabBlock.match(/id: "/g) ?? []).length, 3, "AI Analysis must expose exactly three primary tabs");
  assert.deepEqual(
    [...tabBlock.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]),
    ["AI 連線與診斷", "分析工作區", "Activity Events 分析結果"]
  );
  assert.equal(typeof AiAnalysisTabs, "function");

  const pageSources = [
    read("src/routes/AiAnalysisPage.tsx"),
    read("src/ai-analysis/AnalysisWorkspaceTab.tsx"),
    read("src/ai-analysis/AnalysisResultsTab.tsx")
  ].join("\n");
  assert.equal(pageSources.includes("ANALYSIS DETAIL"), false);
  assert.equal(pageSources.includes("Skill Report" + " Main Tab"), false);
  const pageHeader = read("src/routes/AiAnalysisPage.tsx").split("<AiAnalysisTabs")[0];
  assert.equal(/<button[^>]*>[^<]*AI 連線與診斷/u.test(pageHeader), false, "No top-right AI diagnostics shortcut");

  assert.equal(skillCatalogFixture.length, 279);
  assert.equal(new Set(skillCatalogFixture.map((entry) => entry.id)).size, 279);
  assert.equal(skillCatalogFixture.every((entry) => entry.catalogStatus === "review-draft"), true);
  assert.equal(skillCatalogFixture.every((entry) => entry.detailDescription === null), true);

  const originalLocal = initialAiAnalysisState.services.local;
  let state = aiAnalysisReducer(initialAiAnalysisState, { type: "save_settings", service: "cloud", at: "12:00" });
  assert.deepEqual(state.services.local, originalLocal, "Cloud settings must not alter local state");
  state = aiAnalysisReducer(state, { type: "diagnostic_complete", service: "cloud", at: "12:01" });
  assert.equal(state.services.cloud.testStatus, "passed");
  assert.equal(state.services.cloud.testedSettingsVersion, state.services.cloud.settingsVersion);
  state = aiAnalysisReducer(state, { type: "update_setting", service: "cloud", field: "model", value: "Synthetic Model v2" });
  assert.equal(state.services.cloud.testStatus, "not_tested", "Changing saved settings invalidates diagnostics");
  assert.equal(state.services.cloud.testedSettingsVersion, null);

  assert.deepEqual(
    analysisBlockers("offline", null, pendingDatasetFixtures[0], initialAiAnalysisState.basisFiles),
    [],
    "Offline mode must not depend on cloud or local connection readiness"
  );
  assert.equal(analysisBlockers("cloud", state.services.cloud, pendingDatasetFixtures[0], state.basisFiles).length, 1);
  assert.deepEqual(analysisBlockers("local", state.services.local, pendingDatasetFixtures[0], state.basisFiles), []);
  const failedState = aiAnalysisReducer(state, { type: "diagnostic_failed", service: "cloud", stepId: "network", at: "12:02", message: "Synthetic failure" });
  assert.equal(analysisBlockers("cloud", failedState.services.cloud, pendingDatasetFixtures[0], failedState.basisFiles)[0], "最近一次完整診斷失敗");
  assert.equal(analysisBlockers("local", state.services.local, null, state.basisFiles).includes("尚未選取有效的待分析資料檔"), true);

  const mockRun = {
    id: "RUN-TEST", status: "running" as const, sourcePendingId: pendingDatasetFixtures[0].id,
    outputAnalyzedId: analyzedDatasetFixture.id, snapshot: analyzedDatasetFixture.snapshot,
    progress: 0, currentStep: "準備", startedAt: "12:02", completedAt: null
  };
  state = aiAnalysisReducer(state, { type: "start_analysis", run: mockRun, dataset: analyzedDatasetFixture });
  assert.equal(state.activeTab, "results");
  assert.equal(state.selectedAnalyzedId, analyzedDatasetFixture.id);

  assert.equal(analyzedFileName("pending-analysis-demo.json"), "分析-pending-analysis-demo.json");
  assert.equal(analyzedFileName("分析-pending-analysis-demo.json"), "分析-pending-analysis-demo.json");
  assert.equal(reportFileName("分析-pending-analysis-demo.json"), "skill-analysis-pending-analysis-demo.html");

  const pendingPayload = { schemaName: "pending-analysis-demo", records: [] };
  const analyzedPayload = { analysisRun: { status: "completed" }, records: [{ analyses: [] }] };
  assert.equal(isPendingAnalysisPayload(pendingPayload), true);
  assert.equal(isAnalyzedActivityPayload(pendingPayload), false);
  assert.equal(isAnalyzedActivityPayload(analyzedPayload), true);
  assert.equal(isPendingAnalysisPayload(analyzedPayload), false);
  const secondAnalyzed = { ...analyzedDatasetFixture, id: "analyzed-second", fileName: "分析-second.json", subject: "Second dataset" };
  state = aiAnalysisReducer(state, { type: "import_analyzed", dataset: secondAnalyzed });
  state = aiAnalysisReducer(state, { type: "select_analyzed", id: secondAnalyzed.id });
  assert.equal(state.selectedAnalyzedId, secondAnalyzed.id);
  assert.equal(state.analyzedDatasets.find((item) => item.id === state.selectedAnalyzedId)?.subject, "Second dataset");
  assert.deepEqual(JSON.parse(JSON.stringify(analyzedDatasetFixture)), analyzedDatasetFixture, "Analyzed JSON download model must serialize as valid JSON");

  const secret = "TOP-SECRET-037";
  const sanitized = sanitizeDiagnosticPayload({
    authorization: `Bearer ${secret}`,
    nested: { apiToken: secret, url: `https://example.invalid/check?token=${secret}` },
    message: `Authorization: Basic ${secret}`
  });
  assert.equal(JSON.stringify(sanitized).includes(secret), false);
  assert.equal(sanitizeText(`Bearer ${secret}`).includes(secret), false);

  const report = buildStaticSkillReport(analyzedDatasetFixture, skillCatalogFixture);
  assert.equal(report.startsWith("<!doctype html>"), true);
  assert.equal(report.includes("<style>"), true);
  assert.equal(report.includes("<script>"), true);
  assert.equal(report.includes("<script src="), false);
  assert.equal(report.includes("<link rel="), false);
  assert.equal(report.includes("Catalog Skills<b>279</b>"), true);
  assert.equal(report.includes("完整 fixture：279 項"), true);
  assert.equal(report.includes("尚待補齊"), true);
  const referencedSkill = analyzedDatasetFixture.records[0].skills[0];
  const catalogSkill = skillCatalogFixture.find((entry) => entry.id === referencedSkill.skillId);
  assert.ok(catalogSkill);
  assert.equal(report.includes(`title="${catalogSkill.id} · ${catalogSkill.name} · ${catalogSkill.group} · Catalog: review-draft · 尚待補齊"`), true);
  assert.equal(report.includes("skill-analysis-filtered.csv"), true);
  assert.equal(report.includes("TOP-SECRET-037"), false);

  const packageJson = JSON.parse(read("package.json"));
  assert.equal(packageJson.version, "0.3.7");
  assert.equal(read("VERSION").trim(), "0.3.7");
  assert.equal(read("src/App.tsx").includes('path="/ai-analysis"'), true);
  assert.equal(read("src/components/Sidebar.tsx").includes('to: "/ai-analysis"'), true);

  console.log("v0.3.7 final static UI tests passed");
}

run();
