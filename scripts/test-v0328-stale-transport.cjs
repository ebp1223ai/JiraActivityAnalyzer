const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-artifacts", "stale-transport-identity-scan.json");
const productionRoots = ["electron", "shared", "src", "dist-electron", "dist"];
const compatibility = [
  /^electron[\\/]analysisBridgeRuntimeV0319\.ts$/,
  /^electron[\\/]analysisBridgeRuntimeV0327\.ts$/,
  /^electron[\\/]aiAnalysisInstructionV032[0-2]\.ts$/,
  /^electron[\\/]aiAnalysisRequestPackageV0314\.ts$/,
  /^shared[\\/](aiAnalysisContract|analysisInstructionContract)\.ts$/,
  /^dist-electron[\\/](analysis-bridge-v0328|main)\.cjs$/
];
const hits = [];
for (const relativeRoot of productionRoots) {
  const start = path.join(root, relativeRoot);
  if (!fs.existsSync(start)) continue;
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    const relativePath = path.relative(root, target);
    const bytes = fs.readFileSync(target);
    if (!bytes.toString("utf8").includes("bridge-resumable-v2")) return;
    const allowlisted = compatibility.some((pattern) => pattern.test(relativePath));
    hits.push({ relativePath, allowlisted, owner: allowlisted ? "AnalysisBridgeV0319 compatibility adapter" : "production", purpose: allowlisted ? "v0.3.27 regression and private v2-to-v3 source adaptation; never model-visible" : "unapproved", sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  });
  walk(start);
}
const unapproved = hits.filter((hit) => !hit.allowlisted);
const receipt = { schemaVersion: "jaa-stale-transport-identity-scan-v1", status: unapproved.length ? "FAIL" : "PASS", searchedIdentity: "bridge-resumable-v2", activeIdentity: "bridge-resumable-v3", hits, unapproved, scannedAtUtc: new Date().toISOString() };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));
if (unapproved.length) process.exitCode = 1;
