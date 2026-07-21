const { build } = require("esbuild");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const outfile = path.resolve("test-artifacts/unit/activity-stream-benchmark-test.cjs");
build({ entryPoints: ["electron/activityStreamBenchmark.test.ts"], outfile, bundle: true, platform: "node", format: "cjs", target: "node20" }).then(() => {
  const result = spawnSync(process.execPath, [outfile], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}).catch((error) => { console.error(error); process.exit(1); });
