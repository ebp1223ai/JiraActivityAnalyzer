const path = require("node:path");
const { build } = require("esbuild");

const root = path.resolve(__dirname, "..");
const outfile = path.join(root, "node_modules", ".cache", "v0245-table-ux-readable-viewer-test.cjs");

build({
  entryPoints: [path.join(root, "electron", "v0245TableUxReadableViewer.test.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["node:sqlite"],
  outfile
})
  .then(() => require(outfile))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

