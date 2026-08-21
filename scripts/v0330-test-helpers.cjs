const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "test-artifacts", "v0330");
function moduleApi() {
  fs.mkdirSync(artifacts, { recursive: true });
  const target = path.join(artifacts, "v0330-modules.cjs");
  esbuild.buildSync({ entryPoints: [path.join(root, "electron", "v0330TestExports.ts")], outfile: target, bundle: true, platform: "node", format: "cjs", target: "node20", external: ["electron"], logLevel: "silent" });
  delete require.cache[target]; return require(target);
}
function archiveEntries(archive) { const result = spawnSync("tar", ["-tf", archive], { encoding: "utf8" }); if (result.status !== 0) throw new Error(result.stderr); return result.stdout.split(/\r?\n/).filter(Boolean); }
function archiveText(archive, suffix) { const entry = archiveEntries(archive).find((name) => name.endsWith(suffix)); if (!entry) throw new Error(`Archive entry missing: ${suffix}`); const result = spawnSync("tar", ["-xOf", archive, entry], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (result.status !== 0) throw new Error(result.stderr); return result.stdout; }
function debugArchive() { return process.env.JAA_V0329_DEBUG_ARCHIVE || path.join(root, "release", "exports", "debug-folders", "jira-activity-analyzer-debug-folder-20260821_172952.7z"); }
module.exports = { root, artifacts, moduleApi, archiveEntries, archiveText, debugArchive };
