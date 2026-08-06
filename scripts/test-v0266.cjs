const path = require("node:path");
const { build } = require("esbuild");
const root = path.resolve(__dirname, "..");
const entries = ["v0266ViewerEfficiency.test.ts", "v0266ViewerWorkerStability.test.ts"];

async function run() {
  for (const entry of entries) {
    const outfile = path.join(root, "node_modules", ".cache", entry.replace(/\.test\.ts$/, "-test.cjs"));
    await build({ entryPoints: [path.join(root, "tests", entry)], bundle: true, platform: "node", format: "cjs", external: ["node:sqlite"], outfile });
    delete require.cache[require.resolve(outfile)];
    require(outfile);
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (process.exitCode) break;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
