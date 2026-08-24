const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const outdir = path.resolve(__dirname, "../dist-electron");
fs.mkdirSync(outdir, { recursive: true });
const bridgeResourceDir = path.join(outdir, "jaa-analysis-bridge");
fs.rmSync(bridgeResourceDir, { recursive: true, force: true });
fs.mkdirSync(bridgeResourceDir, { recursive: true });
for (const fileName of fs.readdirSync(outdir)) {
  if (/^analysis-bridge-v[0-9]+[.]cjs$/.test(fileName)) fs.rmSync(path.join(outdir, fileName), { force: true });
}
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
const buildTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
}).formatToParts(new Date());
const buildPart = (type) => buildTimeParts.find((part) => part.type === type)?.value ?? "00";
const buildTime = process.env.JAA_BUILD_TIME
  || `${buildPart("year")}/${buildPart("month")}/${buildPart("day")} ${buildPart("hour")}:${buildPart("minute")}:${buildPart("second")}`;
const gitValue = (command) => {
  try {
    return execSync(command, { cwd: path.resolve(__dirname, ".."), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
};

const sourceBranch = process.env.JAA_BUILD_BRANCH
  || gitValue("git branch --show-current")
  || gitValue("git name-rev --name-only HEAD").replace(/^remotes\//, "").replace(/~\d+$/, "")
  || "detached";
const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false,
  external: ["electron"],
  define: {
    __MAIN_APP_VERSION__: JSON.stringify(packageJson.version),
    __MAIN_BUILD_TIME__: JSON.stringify(buildTime),
    __MAIN_GIT_COMMIT__: JSON.stringify(process.env.JAA_PACKAGED_SOURCE_COMMIT || gitValue("git rev-parse HEAD")),
    __MAIN_GIT_BRANCH__: JSON.stringify(sourceBranch)
  },
  logLevel: "info"
};
const frozenBridgeIdentitySource = path.resolve(__dirname, "frozen-bridge-v0331/aiArtifactIdentityV0328.ts");
const frozenBridgeSourceDirectory = path.join(outdir, ".frozen-bridge-v0331-source");
const bridgeOutput = path.join(bridgeResourceDir, "analysis-bridge-v0331.cjs");
fs.rmSync(frozenBridgeSourceDirectory, { recursive: true, force: true });
fs.mkdirSync(frozenBridgeSourceDirectory, { recursive: true });
fs.cpSync(path.resolve(__dirname, "../electron"), path.join(frozenBridgeSourceDirectory, "electron"), { recursive: true });
fs.cpSync(path.resolve(__dirname, "../shared"), path.join(frozenBridgeSourceDirectory, "shared"), { recursive: true });
fs.copyFileSync(frozenBridgeIdentitySource, path.join(frozenBridgeSourceDirectory, "electron", "aiArtifactIdentityV0328.ts"));
try {
  esbuild.buildSync({
    ...common,
    absWorkingDir: frozenBridgeSourceDirectory,
    entryPoints: ["electron/analysisBridgeRuntimeV0328.ts"],
    outfile: bridgeOutput
  });
} finally {
  fs.rmSync(frozenBridgeSourceDirectory, { recursive: true, force: true });
}
const bridgeSha256 = require("node:crypto").createHash("sha256").update(fs.readFileSync(bridgeOutput)).digest("hex");
const bridgeBytes = fs.statSync(bridgeOutput).size;
if (bridgeBytes !== 173352 || bridgeSha256 !== "42f5034b75efbfa37af4876edf53d84d5ebedf29bf520323dd392462467567e2") {
  throw new Error(`Frozen Bridge v0.3.31 mismatch: bytes=${bridgeBytes} sha256=${bridgeSha256}`);
}
fs.writeFileSync(path.join(bridgeResourceDir, "analysis-bridge-manifest-v0331.json"), JSON.stringify({
  schemaVersion: "jaa-packaged-analysis-bridge-manifest-v1", bridgeIdentity: "0.3.31-bridge-v13", artifactFileName: "analysis-bridge-v0331.cjs",
  artifactBytes: bridgeBytes, artifactSha256: bridgeSha256, runtimeContractRegistry: "jaa-runtime-contract-registry-v1",
  transport: "bridge-resumable-v4", segmentSchema: "jaa-model-input-segment-v3", segmentPlanner: "jaa-protected-token-safe-segment-planner-v1", boundaryReceipt: "jaa-segment-boundary-safety-receipt-v1", decisionContract: "jaa-ai-analysis-decisions-v5", localOnly: true, externalFallback: false
}, null, 2) + "\n", "utf8");
console.log(`  analysis bridge manifest  identity=0.3.31-bridge-v13 bytes=${bridgeBytes} sha256=${bridgeSha256}`);
common.define.__JAA_ANALYSIS_BRIDGE_BYTES__ = JSON.stringify(bridgeBytes);
common.define.__JAA_ANALYSIS_BRIDGE_SHA256__ = JSON.stringify(bridgeSha256);

esbuild.buildSync({
  ...common,
  entryPoints: [path.resolve(__dirname, "../electron/main.ts")],
  outfile: path.join(outdir, "main.cjs")
});

esbuild.buildSync({
  ...common,
  entryPoints: [path.resolve(__dirname, "../electron/preload.ts")],
  outfile: path.join(outdir, "preload.cjs")
});

esbuild.buildSync({
  ...common,
  entryPoints: [path.resolve(__dirname, "../electron/databaseViewerWorker.ts")],
  outfile: path.join(outdir, "database-viewer-worker.cjs")
});


esbuild.buildSync({
  ...common,
  entryPoints: [path.resolve(__dirname, "../electron/pendingAnalysisExportWorker.ts")],
  outfile: path.join(outdir, "pending-analysis-export-worker.cjs")
});
