const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const archive = process.argv[2] || path.join(root, "release", "exports", "debug-folders", "jira-activity-analyzer-debug-folder-20260821_141728.7z");
const outputRoot = path.join(root, "test-artifacts", "replay-v0327-failure");
if (!fs.existsSync(archive)) throw new Error(`REPLAY_EVIDENCE_MISSING:${archive}`);
fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
const extracted = spawnSync("tar.exe", ["-xf", archive, "-C", outputRoot], { encoding: "utf8" });
if (extracted.status !== 0) throw new Error(`REPLAY_ARCHIVE_EXTRACT_FAILED:${extracted.stderr}`);
const files = [];
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) walk(target); else files.push(target);
});
walk(outputRoot);
const textFiles = files.filter((file) => /\.(json|jsonl|log|txt)$/i.test(file));
const bodies = textFiles.map((file) => ({ file, text: fs.readFileSync(file, "utf8") }));
const stale = bodies.filter(({ text }) => text.includes("bridge-resumable-v2"));
const v3 = bodies.filter(({ text }) => text.includes("jaa-model-input-manifest-v3"));
const undefinedError = bodies.filter(({ text }) => text.includes("undefined: undefined"));
const runId = "analysis_64ffcb94-b98d-4bbe-98d3-b6ee341fea77";
const result = {
  schemaVersion: "jaa-v0327-failure-replay-v1",
  classification: "TEST_REPLAY_NOT_PRODUCTION",
  archive,
  expectedRunId: runId,
  runIdentityObserved: bodies.some(({ text }) => text.includes(runId)),
  manifestSchemaV3Observed: v3.length > 0,
  staleTransportV2Observed: stale.length > 0,
  preRunUndefinedObserved: undefinedError.length > 0,
  staleEvidenceFiles: stale.map(({ file }) => path.relative(outputRoot, file)),
  undefinedEvidenceFiles: undefinedError.map(({ file }) => path.relative(outputRoot, file)),
  rootCause: "v0.3.27 Manifest wrapper replaced schemaVersion but inherited transportProtocol from the v2 compatibility manifest; choose-pending success omitted ok:true.",
  v0328ExpectedRoot: "AI_RUNTIME_MANIFEST_PROTOCOL_MISMATCH",
  providerCalled: false,
  sqliteWritten: false,
  status: stale.length && v3.length && undefinedError.length ? "PASS" : "FAIL",
  replayedAtUtc: new Date().toISOString()
};
fs.writeFileSync(path.join(outputRoot, "replay-receipt.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
if (result.status !== "PASS") process.exitCode = 1;
