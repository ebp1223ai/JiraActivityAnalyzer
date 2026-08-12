import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const ui = fs.readFileSync(path.join(root, "src", "ai-analysis", "AiAnalysisReconstructedPage.tsx"), "utf8");
const ipc = fs.readFileSync(path.join(root, "electron", "aiAnalysisIpc.ts"), "utf8");
const preload = fs.readFileSync(path.join(root, "electron", "preload.ts"), "utf8");

test("AI Analysis exposes exactly the required three tabs", () => {
  const tabBlock = ui.match(/const tabItems:[\s\S]*?\];/)?.[0] ?? "";
  assert.match(tabBlock, /AI 連線與診斷/);
  assert.match(tabBlock, /分析工作區/);
  assert.match(tabBlock, /Activity Events 分析結果/);
  assert.equal((tabBlock.match(/number: "0[123]"/g) ?? []).length, 3);
});

test("UI preserves full paths and removes direct OpenAI API and JSON download actions", () => {
  assert.match(ui, /RULES FOLDER/);
  assert.match(ui, /PENDING DATASET FULL PATH/);
  assert.match(ui, /ANALYZED DATASET FULL PATH/);
  assert.match(ui, /PLANNED OUTPUT JSON FULL PATH/);
  assert.doesNotMatch(ui, /OpenAI API|OpenAI Base URL|OPENAI_API_KEY/);
  assert.doesNotMatch(ui, /下載已分析 JSON/);
  assert.doesNotMatch(ui, /ANALYSIS DETAIL/);
});

test("main-process dialogs and typed bridge own pending and analyzed paths", () => {
  assert.match(ipc, /ai-analysis:choose-pending/);
  assert.match(ipc, /ai-analysis:choose-analyzed/);
  assert.match(ipc, /fs\.realpathSync\.native/);
  assert.match(preload, /chooseAnalyzed/);
  assert.match(preload, /verifyPending/);
  assert.match(preload, /selectRun/);
});

test("failed or cancelled runs cannot be presented as completed output", () => {
  assert.match(ipc, /document\.run\.status !== "completed"/);
  assert.match(ipc, /run\.status = value\.code === "RUN_CANCELLED" \? "cancelled" : "failed"/);
  assert.match(ipc, /fs\.unlinkSync\(exported\.filePath\)/);
});
