import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const main = fs.readFileSync(path.join(root, "electron", "main.ts"), "utf8");
const rendererMain = fs.readFileSync(path.join(root, "src", "main.tsx"), "utf8");
const boundary = fs.readFileSync(path.join(root, "src", "components", "AppErrorBoundary.tsx"), "utf8");
const rendererDiagnostics = fs.readFileSync(path.join(root, "src", "diagnostics", "rendererDiagnostics.ts"), "utf8");
const analysis = fs.readFileSync(path.join(root, "src", "routes", "AnalysisPage.tsx"), "utf8");
const debugCollector = fs.readFileSync(path.join(root, "electron", "debugFolderCollector.ts"), "utf8");

for (const event of ["render-process-gone", "did-fail-load", "unresponsive", "responsive", "console-message", "uncaughtException", "unhandledRejection"]) {
  assert.equal(main.includes(event), true, `Missing persistent main-process handler: ${event}`);
}
for (const event of ["window.error", "window.unhandledrejection"]) {
  assert.equal(rendererDiagnostics.includes(event), true, `Missing renderer global diagnostic: ${event}`);
}
assert.equal(rendererMain.includes("<AppErrorBoundary>"), true);
assert.equal(boundary.includes("data-testid=\"app-error-boundary\""), true);
assert.equal(boundary.includes("Open logs folder"), true);
assert.equal(analysis.includes("buildTimelineQueueTransition"), true);
assert.equal(analysis.includes("FULL_FETCH_QUEUE_TRANSITION_REQUESTED"), true);
assert.equal(analysis.includes("FULL_FETCH_QUEUE_TRANSITION_COMPLETED"), true);
assert.equal(analysis.includes("FULL_FETCH_QUEUE_TRANSITION_FAILED"), true);
assert.equal(analysis.includes("Issue Preview"), false);
assert.equal(analysis.includes("Direct Jira Evidence"), false);
assert.equal(main.includes("path-audit.json"), true);
assert.equal(main.includes("describeFullFetchFailureEvidence"), true);
assert.equal(debugCollector.includes("failedCount: null"), true);
assert.equal(debugCollector.includes("hasFailedIssuesFile: false"), true);
console.log("Hotfix architecture tests passed: boundary, renderer/main diagnostics, atomic transition events and not_run semantics.");
