const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const archive = path.join(root, "release", "win-unpacked", "resources", "app.asar");
const outputRoot = path.join(root, "test-artifacts", "packaged-runtime-manifest-v0328");
const bridgePath = path.join(outputRoot, "analysis-bridge-v0328.cjs");
if (!fs.existsSync(archive)) throw new Error(`PACKAGED_ASAR_MISSING:${archive}`);
fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(bridgePath, asar.extractFile(archive, "dist-electron/analysis-bridge-v0328.cjs"));
const result = spawnSync(process.execPath, [path.join(root, "scripts", "test-runtime-manifest-contract-v0328.cjs")], {
  cwd: root,
  env: { ...process.env, JAA_PACKAGED_BRIDGE: bridgePath },
  encoding: "utf8"
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.status !== 0) process.exit(result.status ?? 1);
const receipt = { schemaVersion: "jaa-packaged-runtime-manifest-contract-test-v1", status: "PASS", archive, bridgePath, testedAtUtc: new Date().toISOString() };
fs.writeFileSync(path.join(outputRoot, "packaged-bridge-contract-test.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
