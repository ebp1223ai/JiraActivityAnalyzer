import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const ipc = fs.readFileSync(path.join(root, "electron", "aiAnalysisIpc.ts"), "utf8");
const service = fs.readFileSync(path.join(root, "electron", "chatGptService.ts"), "utf8");
const ui = fs.readFileSync(path.join(root, "src", "ai-analysis", "AiAnalysisReconstructedPage.tsx"), "utf8");

test("capacity warnings are warn-only and require one explicit confirmation", () => {
  assert.doesNotMatch(ipc, /throw new AiAnalysisError\("ANALYSIS_INPUT_CONTEXT_TOO_LARGE"/);
  assert.match(ipc, /waiting_capacity_confirmation/); assert.match(ui, /capacityConfirmation: true/);
  assert.match(ui, /仍然執行單次分析/); assert.match(ui, /完整估算明細/); assert.match(ui, /Capacity source/);
});
test("main boundary has atomic guard and only one ChatGPT runAnalysis call", () => {
  const branch = ipc.match(/else if \(payload\.mode === "CHATGPT"\) \{([\s\S]*?)\n      \} else \{/)?.[1] ?? "";
  assert.equal((branch.match(/chatgpt\.runAnalysis\(/g) ?? []).length, 1); assert.match(branch, /dispatchGuard\.begin/);
  assert.doesNotMatch(branch, /retryCount\s*\+=|repair|fallback request/i);
});
test("request thread and turn counters follow real boundaries", () => {
  const branch = ipc.match(/else if \(payload\.mode === "CHATGPT"\) \{([\s\S]*?)\n      \} else \{/)?.[1] ?? "";
  assert.ok(branch.indexOf("run.progress.requestCount += 1") < branch.indexOf("await chatgpt.runAnalysis"));
  assert.match(service, /emitRun\(\{ type: "started"/); assert.match(ipc, /providerEvent\.type === "started"/);
  assert.match(ipc, /run\.progress\.threadCount = 1/); assert.match(ipc, /run\.progress\.turnCount = 1/);
});
test("failed staging and formal output gate precede persistence", () => {
  assert.match(ipc, /createFailedStaging/); assert.match(ipc, /persistFailedRunEvidence/); assert.match(ipc, /evaluateFormalPersistenceGate/);
  assert.ok(ipc.indexOf("if (!run.validationGate.passed)") < ipc.indexOf("JSON.stringify(analyzedDocument(run)"));
  assert.ok(ipc.indexOf("JSON.stringify(analyzedDocument(run)") < ipc.indexOf("persistCompletedRun(dbPath, dataset, run)"));
});
test("provider capability lookup is exact and has no fixed capacity fallback", () => {
  assert.match(service, /modelProvider\/capabilities\/read/); assert.match(service, /provider_model_metadata/);
  assert.doesNotMatch(service, /capacityTokens:\s*200_?000/);
});
