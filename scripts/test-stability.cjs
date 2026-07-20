const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const outputDir = path.resolve(__dirname, "../test-artifacts/unit");
const outputFile = path.join(outputDir, "activity-stream-stability.test.cjs");
fs.mkdirSync(outputDir, { recursive: true });
esbuild.buildSync({ entryPoints: [path.resolve(__dirname, "../electron/activityStreamStability.test.ts")], outfile: outputFile, bundle: true, platform: "node", format: "cjs", target: "node20" });
const result = spawnSync(process.execPath, [outputFile], { stdio: "inherit" });
process.exit(result.status ?? 1);
