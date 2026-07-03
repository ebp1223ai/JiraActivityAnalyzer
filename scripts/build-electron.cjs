const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const outdir = path.resolve(__dirname, "../dist-electron");
fs.mkdirSync(outdir, { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false,
  external: ["electron"],
  logLevel: "info"
};

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
