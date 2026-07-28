const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, execSync } = require("node:child_process");
const { Arch, Platform, build } = require("electron-builder");

const projectRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(projectRoot, "package.json"));
const trackedDirty = execSync("git status --porcelain --untracked-files=no", {
  cwd: projectRoot,
  stdio: ["ignore", "pipe", "inherit"]
}).toString().trim();
if (trackedDirty) {
  console.error("Packaging requires a clean tracked worktree so packagedSourceCommit is exact.");
  process.exit(1);
}

const packagedSourceCommit = execSync("git rev-parse HEAD", {
  cwd: projectRoot,
  stdio: ["ignore", "pipe", "inherit"]
}).toString().trim();
const buildDate = new Date();
const buildTimeParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
}).formatToParts(buildDate);
const buildPart = (type) => buildTimeParts.find((part) => part.type === type)?.value ?? "00";
const buildTime = `${buildPart("year")}/${buildPart("month")}/${buildPart("day")} ${buildPart("hour")}:${buildPart("minute")}:${buildPart("second")}`;
const buildInfo = {
  appVersion: packageJson.version,
  packagedSourceCommit,
  buildTime,
  buildTimeIso: buildDate.toISOString()
};
const buildEnvironment = {
  ...process.env,
  JAA_PACKAGED_SOURCE_COMMIT: packagedSourceCommit,
  JAA_BUILD_TIME: buildTime,
  JAA_BUILD_TIME_ISO: buildInfo.buildTimeIso
};

execFileSync("npm.cmd", ["run", "build"], {
  cwd: projectRoot,
  env: buildEnvironment,
  stdio: "inherit"
});

const originalRename = fs.promises.rename.bind(fs.promises);
fs.promises.rename = async (from, to) => {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await originalRename(from, to);
    } catch (error) {
      lastError = error;
      if (error?.code !== "EPERM") throw error;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }
  if (lastError?.code === "EPERM") {
    await fs.promises.rm(to, { recursive: true, force: true });
    await fs.promises.cp(from, to, { recursive: true });
    await fs.promises.rm(from, { recursive: true, force: true });
    return;
  }
  throw lastError;
};

build({
  targets: Platform.WINDOWS.createTarget(["nsis", "portable"], Arch.x64),
  config: { extraMetadata: { jaaBuildInfo: buildInfo } }
}).then(() => {
  const releaseDir = path.join(projectRoot, "release");
  fs.copyFileSync(path.join(projectRoot, ".env.Version"), path.join(releaseDir, ".env.Version"));
  fs.writeFileSync(path.join(releaseDir, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");
  console.log(`  copied versioned environment template  file=${path.join("release", ".env.Version")}`);
  console.log(`  packaged source commit  commit=${packagedSourceCommit}`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
