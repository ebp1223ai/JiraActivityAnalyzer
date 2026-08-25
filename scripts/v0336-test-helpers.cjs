const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "test-artifacts", "v0336");
function api() {
  fs.mkdirSync(artifacts, { recursive: true });
  const out = path.join(artifacts, "modules.cjs");
  esbuild.buildSync({ entryPoints: [path.join(root, "electron", "v0336TestExports.ts")], outfile: out, bundle: true, platform: "node", format: "cjs", target: "node20", external: ["electron"], logLevel: "silent" });
  delete require.cache[out]; return require(out);
}
module.exports = { root, artifacts, api };