const path = require("node:path");
const { build } = require("esbuild");
async function run() { const root = path.resolve(__dirname, ".."); const outfile = path.join(root, "node_modules", ".cache", "v0326-test.cjs"); await build({ entryPoints: [path.join(root, "tests", "v0326ArtifactIdentityEvidenceQuote.test.ts")], bundle: true, platform: "node", format: "cjs", target: "node22", outfile, external: ["electron", "node:sqlite"] }); delete require.cache[require.resolve(outfile)]; await require(outfile); }
run().catch((error) => { console.error(error); process.exitCode = 1; });