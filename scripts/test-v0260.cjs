const path = require("node:path");
const { build } = require("esbuild");
const root = path.resolve(__dirname, "..");
const outfile = path.join(root, "node_modules", ".cache", "v0260-description-originals-test.cjs");
build({ entryPoints: [path.join(root, "tests", "v0260DescriptionOriginals.test.ts")], bundle: true, platform: "node", format: "cjs", external: ["node:sqlite"], outfile })
  .then(() => require(outfile)).catch((error) => { console.error(error); process.exitCode = 1; });
