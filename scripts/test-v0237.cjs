const path = require("node:path");
const { build } = require("esbuild");

const root = path.resolve(__dirname, "..");
const outfile = path.join(root, "node_modules", ".cache", "v0237-startup-database-test.cjs");

build({
  entryPoints: [path.join(root, "electron", "v0237StartupDatabase.test.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile
})
  .then(() => require(outfile))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
