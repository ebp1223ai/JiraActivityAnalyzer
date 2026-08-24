const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "test-artifacts", "v0334");
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
function find(base, suffix) { const queue = [base]; while (queue.length) { const dir = queue.shift(); for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) queue.push(full); else if (full.replaceAll("\\", "/").endsWith(suffix)) return full; } } throw new Error(`missing evidence: ${suffix}`); }
const cases = [
  { folder: "run-151333", archive: "jira-activity-analyzer-debug-folder-20260824_151333.7z", archiveSha256: "cd52bc56b2a42e350617c9d2cf148ac1c2920ef5fb1445e30ee6f047e10adb69", runId: "analysis_1b45da4f-2e4a-463b-b3af-426c1f0f09ce", expectedFailure: "AI_MODEL_DELIVERY_HANDLE_REPLAYED" },
  { folder: "run-153456", archive: "jira-activity-analyzer-debug-folder-20260824_153456.7z", archiveSha256: "4680d4d4ea11c301339feac96b1e8ae0d6a0a5491c0e8132b5dff3aeb5a52090", runId: "analysis_72db2466-7a18-43e1-88ae-4d2f4c55f9be", expectedFailure: "AI_ANALYSIS_INCOMPLETE" }
];
const results = cases.map((item) => {
  const base = path.join(artifacts, item.folder);
  if (!fs.existsSync(base)) return { ...item, status: "NOT_RUN", reason: "Extracted real debug evidence is unavailable.", providerCalled: false, productionSqliteWritten: false };
  const delivery = JSON.parse(fs.readFileSync(find(base, "/progress/model-delivery-receipt.json"), "utf8"));
  const lifecycle = JSON.parse(fs.readFileSync(find(base, "/debug/lifecycle-summary.json"), "utf8"));
  const toolLines = fs.readFileSync(find(base, "/debug/bridge-tool-calls.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const runManifest = JSON.parse(fs.readFileSync(find(base, "/debug/run-manifest.json"), "utf8"));
  assert.equal(runManifest.runId ?? lifecycle.runId, item.runId);
  assert.equal(Number(delivery.deliveredFileCount ?? delivery.fileCount), 4);
  assert.equal(Number(delivery.deliveredRecordCount ?? delivery.recordCount), 17);
  assert.equal(Number(delivery.deliveredBytes ?? delivery.totalBytes), 311276);
  assert.ok(toolLines.some((entry) => entry.toolName === "jaa_finalize_input_delivery" && entry.success === true));
  assert.ok(JSON.stringify({ lifecycle, toolLines }).includes(item.expectedFailure));
  return { ...item, status: "PASS", delivery: { files: 4, records: 17, bytes: 311276 }, observedV0333Failure: item.expectedFailure, v0334ExpectedBehavior: item.expectedFailure === "AI_MODEL_DELIVERY_HANDLE_REPLAYED" ? "post-finalize status is readonly and succeeds" : "finalize atomically enters INPUT_READY; ANALYSIS_STARTED succeeds", providerCalled: false, productionSqliteWritten: false };
});
const report = { schemaVersion: "jaa-v0333-debug-replay-v0334-v1", evidenceType: "REAL_V0.3.33_DEBUG_FOLDER_OFFLINE_REPLAY", generatedAtUtc: new Date().toISOString(), results, providerCalled: false, productionSqliteWritten: false };
fs.mkdirSync(artifacts, { recursive: true }); fs.writeFileSync(path.join(artifacts, "replay-v0333-real-runs.json"), JSON.stringify(report, null, 2) + "\n");
if (results.some((item) => item.status !== "PASS")) process.exitCode = 2;
console.log(JSON.stringify(report, null, 2));
