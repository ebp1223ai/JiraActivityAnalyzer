const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const outdir = path.resolve(__dirname, "../dist-electron");
fs.mkdirSync(outdir, { recursive: true });
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
const buildTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
}).formatToParts(new Date());
const buildPart = (type) => buildTimeParts.find((part) => part.type === type)?.value ?? "00";
const buildTime = process.env.JAA_BUILD_TIME
  || `${buildPart("year")}/${buildPart("month")}/${buildPart("day")} ${buildPart("hour")}:${buildPart("minute")}:${buildPart("second")}`;
const gitValue = (command) => {
  try {
    return execSync(command, { cwd: path.resolve(__dirname, ".."), stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
};

const sourceBranch = process.env.JAA_BUILD_BRANCH
  || gitValue("git branch --show-current")
  || gitValue("git name-rev --name-only HEAD").replace(/^remotes\//, "").replace(/~\d+$/, "")
  || "detached";
const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: false,
  external: ["electron"],
  define: {
    __MAIN_APP_VERSION__: JSON.stringify(packageJson.version),
    __MAIN_BUILD_TIME__: JSON.stringify(buildTime),
    __MAIN_GIT_COMMIT__: JSON.stringify(process.env.JAA_PACKAGED_SOURCE_COMMIT || gitValue("git rev-parse HEAD")),
    __MAIN_GIT_BRANCH__: JSON.stringify(sourceBranch)
  },
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
