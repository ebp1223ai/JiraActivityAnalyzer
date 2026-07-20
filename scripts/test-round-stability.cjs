const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const outputDir = path.resolve(__dirname, "../test-artifacts/unit");
fs.mkdirSync(outputDir, { recursive: true });
const outputFile = path.join(outputDir, "activity-stream-round-stability.test.cjs");
esbuild.buildSync({ entryPoints: [path.resolve(__dirname, "../electron/activityStreamRoundStability.test.ts")], outfile: outputFile, bundle: true, platform: "node", format: "cjs", target: "node20", logLevel: "silent" });
execFileSync(process.execPath, [outputFile], { stdio: "inherit" });
