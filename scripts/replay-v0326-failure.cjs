const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const source = process.argv[2] || process.env.JAA_V0326_DEBUG_FOLDER;
if (!source || !fs.existsSync(source)) {
  console.error("V0326_REPLAY_SOURCE_MISSING: pass the read-only jira-activity-analyzer-debug-folder-20260821_120609 directory or extracted archive path");
  process.exitCode = 2;
  return;
}
if (!fs.statSync(source).isDirectory()) {
  console.error("V0326_REPLAY_REQUIRES_EXTRACTED_READ_ONLY_FOLDER: archives are not modified or extracted by this harness");
  process.exitCode = 2;
  return;
}

const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile() && /\.(json|jsonl|txt|md)$/i.test(entry.name) && fs.statSync(absolute).size <= 128 * 1024 * 1024) files.push(absolute);
  }
}
walk(path.resolve(source));

const observations = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (/jaa_get_input_manifest/.test(text) || /AI_BRIDGE_CONTRACT_MISMATCH/.test(text) || /AI_MODEL_INPUT_DELIVERY_INCOMPLETE/.test(text) || /undefined:\s*undefined/.test(text)) {
    observations.push({ relativePath: path.relative(source, file).replace(/\\/g, "/"), sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), hasManifestCall: /jaa_get_input_manifest/.test(text), hasBridgeMismatch: /AI_BRIDGE_CONTRACT_MISMATCH/.test(text), hasDerivedDeliveryError: /AI_MODEL_INPUT_DELIVERY_INCOMPLETE/.test(text), hasUndefinedError: /undefined:\s*undefined/.test(text) });
  }
}

const synthetic = spawnSync(process.execPath, [path.join(__dirname, "test-v0327.cjs")], {
  cwd: path.resolve(__dirname, ".."),
  encoding: "utf8",
  windowsHide: true
});

const result = {
  schemaVersion: "jaa-v0326-failure-replay-v1",
  mode: "TEST_REPLAY_NOT_PRODUCTION",
  providerCalled: false,
  productionSqliteWritten: false,
  sourceFolder: path.resolve(source),
  sourceFileCount: files.length,
  observations,
  oldContract: { manifestRequiredModelRunId: true, knownObservedArguments: ["20260821_120417_905_analysis_5856089a-c381-44a2-aff4-4916d38b9985", "5856089a-c381-44a2-aff4-4916d38b9985"], authority: "analysis_5856089a-c381-44a2-aff4-4916d38b9985" },
  newContract: { manifestArguments: {}, modelVisibleIdentityFields: [], deliveryHandleRequiredAfterManifest: true, syntheticBridgeExitCode: synthetic.status, syntheticBridgePassed: synthetic.status === 0, providerCalled: false },
  generatedAtUtc: new Date().toISOString()
};
console.log(JSON.stringify(result, null, 2));
if (!observations.some((entry) => entry.hasBridgeMismatch)) process.exitCode = 3;
else if (synthetic.status !== 0) { console.error(synthetic.stderr || synthetic.stdout); process.exitCode = 4; }
