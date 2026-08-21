const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "test-artifacts", "v0331");
function moduleApi() {
  fs.mkdirSync(artifacts, { recursive: true });
  const target = path.join(artifacts, "v0331-modules.cjs");
  esbuild.buildSync({ entryPoints: [path.join(root, "electron", "v0331TestExports.ts")], outfile: target, bundle: true, platform: "node", format: "cjs", target: "node20", external: ["electron"], logLevel: "silent" });
  delete require.cache[target]; return require(target);
}
function archiveEntries(archive) { const result = spawnSync("tar", ["-tf", archive], { encoding: "utf8" }); if (result.status !== 0) throw new Error(result.stderr); return result.stdout.split(/\r?\n/).filter(Boolean); }
function archiveBuffer(archive, suffix) { const entry = archiveEntries(archive).find((name) => name.endsWith(suffix)); if (!entry) throw new Error(`Archive entry missing: ${suffix}`); const result = spawnSync("tar", ["-xOf", archive, entry], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }); if (result.status !== 0) throw new Error(result.stderr.toString()); return result.stdout; }
function archiveText(archive, suffix) { return archiveBuffer(archive, suffix).toString("utf8"); }
function debugArchive() { return process.env.JAA_V0330_DEBUG_ARCHIVE || path.join(root, "release", "exports", "debug-folders", "jira-activity-analyzer-debug-folder-20260821_190418.7z"); }
function officialCatalogPath() { return process.env.JAA_V0331_CATALOG || "D:\\ch_kao\\Downloads\\3.31\\Skill_Catalog_v0.3.1.md"; }
function catalogSkillIds() { const text = fs.readFileSync(officialCatalogPath(), "utf8"); return [...new Set([...text.matchAll(/^\|\s*([A-Za-z][A-Za-z0-9_]*\d{3})\s*\|/gm)].map((match) => match[1]))].sort(); }
module.exports = { root, artifacts, moduleApi, archiveEntries, archiveBuffer, archiveText, debugArchive, officialCatalogPath, catalogSkillIds };
