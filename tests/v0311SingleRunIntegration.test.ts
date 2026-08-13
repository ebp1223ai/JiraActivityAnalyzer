import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const ipc = fs.readFileSync(path.join(root, "electron", "aiAnalysisIpc.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "electron", "chatGptService.ts"), "utf8");
const module = fs.readFileSync(path.join(root, "electron", "aiAnalysisSingleRunV0311.ts"), "utf8");
const ui = fs.readFileSync(path.join(root, "src", "ai-analysis", "AiAnalysisReconstructedPage.tsx"), "utf8");

test("ChatGPT branch issues exactly one runAnalysis and has no repair or per-record loop", () => {
  const branch = ipc.match(/else if \(payload\.mode === "CHATGPT"\) \{([\s\S]*?)\n      \} else \{/)?.[1] ?? "";
  assert.ok(branch.length > 1000);
  assert.equal((branch.match(/chatgpt\.runAnalysis\(/g) ?? []).length, 1);
  assert.doesNotMatch(branch, /for\s*\(|Repair this invalid|retryCount\s*\+=|selected\[index\]/);
  assert.match(branch, /mainPayloadCount = 1/);
  assert.match(branch, /rulesTransmissionCount = 1/);
  assert.match(ipc, /threadCreatedCount/);
  assert.match(ipc, /acceptedTurnCount/);
  assert.match(ipc, /turnCompletedCount/);
});

test("v0.3.12 capacity warning replaces the v0.3.11 hard block before ChatGPT dispatch", () => {
  const branch = ipc.match(/else if \(payload\.mode === "CHATGPT"\) \{([\s\S]*?)\n      \} else \{/)?.[1] ?? "";
  const capacity = branch.indexOf("buildCapacityCalculationSnapshot");
  const warning = branch.indexOf("waiting_capacity_confirmation", capacity);
  const request = branch.indexOf("await chatgpt.runAnalysis", capacity);
  assert.ok(capacity > 0 && warning > capacity && request > warning);
  assert.doesNotMatch(branch, /throw new AiAnalysisError\("ANALYSIS_INPUT_CONTEXT_TOO_LARGE"/);
});

test("App Server response exposes real thread and turn identity", () => {
  assert.match(service, /threadId: active\.threadId, turnId: active\.turnId/);
  assert.match(service, /request\.runId \?\?/);
  assert.match(ipc, /runAnalysis\(\{ runId, prompt:/);
  assert.match(ipc, /promptSha256 = request\.requestPackage\.finalProviderPayloadSha256/);
  assert.match(service, /PROVIDER_PAYLOAD_HASH_MISMATCH_BEFORE_PROVIDER/);
  assert.match(ipc, /buildDistributionDiagnostics\(run\.results, run\.rules\)/);
  assert.match(service, /thread\/start/);
  assert.match(service, /turn\/start/);
  assert.match(service, /turn\/interrupt/);
  assert.match(service, /thread\/delete/);
});

test("completed artifacts pair JSON and Golden HTML before SQLite commit", () => {
  const jsonWrite = ipc.indexOf("JSON.stringify(analyzedDocument(run)");
  const htmlWrite = ipc.indexOf("atomicExport(reportPath, html)", jsonWrite);
  const database = ipc.indexOf("persistCompletedRun(dbPath, dataset, run)", htmlWrite);
  assert.ok(jsonWrite > 0 && htmlWrite > jsonWrite && database > htmlWrite);
  assert.match(ipc, /fs\.unlinkSync\(report\.filePath\)/);
  assert.match(ipc, /validateGoldenHtml\(html, run\.results\.length\)/);
});

test("UI reports stage and precise Provider lifecycle counts instead of contradictory batch semantics", () => {
  assert.match(ui, /label="Stage"/);
  assert.match(ui, /Dispatch \/ Thread \/ Accepted \/ Completed/);
  assert.doesNotMatch(ui, /label="Batch \/ Stage"/);
});

test("renderer is self-contained and declares search filters, details, and print CSS", () => {
  for (const marker of ["Skill Ranking", "逐筆 Diff 與分析結果", "原始 Diff Evidence", "Record Negative Checks", "id=\\\"search\\\"", "id=\\\"actor\\\"", "id=\\\"issue\\\"", "id=\\\"group\\\"", "@media print", "全部展開", "全部收合"]) assert.match(module, new RegExp(marker));
  assert.match(module, /default-src 'none'/);
  assert.doesNotMatch(module, /cdn\.jsdelivr|unpkg\.com|google-analytics|fetch\s*\(/i);
});