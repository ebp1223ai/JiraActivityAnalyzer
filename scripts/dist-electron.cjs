const fs = require("node:fs");
const path = require("node:path");
const { Arch, Platform, build } = require("electron-builder");

const originalRename = fs.promises.rename.bind(fs.promises);

fs.promises.rename = async (from, to) => {
  let lastError;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      return await originalRename(from, to);
    } catch (error) {
      lastError = error;
      if (error?.code !== "EPERM") {
        throw error;
      }
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
  targets: Platform.WINDOWS.createTarget(["nsis", "portable"], Arch.x64)
}).then(() => {
  const projectRoot = path.resolve(__dirname, "..");
  const releaseDir = path.join(projectRoot, "release");
  fs.copyFileSync(path.join(projectRoot, ".env.Version"), path.join(releaseDir, ".env.Version"));
  console.log(`  • copied versioned environment template  file=${path.join("release", ".env.Version")}`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
