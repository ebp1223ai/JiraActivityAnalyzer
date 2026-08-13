import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { CODEX_RUNTIME_VERSION } from "../shared/chatGptContract.js";

export type CodexRuntimeManifest = {
  schemaVersion: "jaa-codex-runtime-manifest-v1"; source: "bundled"; runtimeMode: "BUNDLED_ONLY"; version: typeof CODEX_RUNTIME_VERSION;
  packageVersion: string; platform: "win32"; arch: "x64"; relativeExecutablePath: string; sha256: string;
  license: string; licenseSource: string; packageSource: string; systemPathDiscovery: false; externalFallback: false; autoDownload: false;
};
export type ChatGptRuntimeResolution = { executablePath: string; version: typeof CODEX_RUNTIME_VERSION; sha256: string; source: "bundled"; integrity: "verified"; manifestPath: string; manifest: CodexRuntimeManifest };

function sha256File(filePath: string) { const hash = crypto.createHash("sha256"); hash.update(fs.readFileSync(filePath)); return hash.digest("hex"); }
function fail(code: string, detail?: string): never { throw new Error(detail ? `${code}:${detail}` : code); }
function assertRegularContainedFile(candidate: string, root: string) {
  let realRoot: string; let realCandidate: string;
  try { realRoot = fs.realpathSync(root); realCandidate = fs.realpathSync(candidate); } catch { fail("CODEX_BUNDLED_RUNTIME_MISSING"); }
  const relative = path.relative(realRoot, realCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail("CODEX_BUNDLED_RUNTIME_PATH_ESCAPE");
  if (!fs.statSync(realCandidate).isFile()) fail("CODEX_BUNDLED_RUNTIME_MISSING");
  return realCandidate;
}
function readManifest(manifestPath: string): CodexRuntimeManifest {
  let value: unknown; try { value = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { fail("CODEX_BUNDLED_RUNTIME_MISSING", "manifest"); }
  const manifest = value as Partial<CodexRuntimeManifest>;
  if (manifest.schemaVersion !== "jaa-codex-runtime-manifest-v1" || manifest.source !== "bundled" || manifest.runtimeMode !== "BUNDLED_ONLY") fail("CODEX_BUNDLED_RUNTIME_VERSION_MISMATCH", "manifest contract");
  if (manifest.version !== CODEX_RUNTIME_VERSION || manifest.packageVersion !== `${CODEX_RUNTIME_VERSION}-win32-x64`) fail("CODEX_BUNDLED_RUNTIME_VERSION_MISMATCH");
  if (manifest.platform !== "win32" || manifest.arch !== "x64") fail("CODEX_BUNDLED_RUNTIME_VERSION_MISMATCH", "platform");
  if (manifest.systemPathDiscovery !== false || manifest.externalFallback !== false || manifest.autoDownload !== false) fail("CODEX_BUNDLED_RUNTIME_VERSION_MISMATCH", "fallback policy");
  if (typeof manifest.relativeExecutablePath !== "string" || !/^[^/\\]+[/\\][^/\\]+\.exe$/i.test(manifest.relativeExecutablePath)) fail("CODEX_BUNDLED_RUNTIME_VERSION_MISMATCH", "executable path");
  if (typeof manifest.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manifest.sha256)) fail("CODEX_BUNDLED_RUNTIME_VERSION_MISMATCH", "sha256");
  return manifest as CodexRuntimeManifest;
}
export function resolveChatGptRuntime(testRoot?: string): ChatGptRuntimeResolution {
  const root = testRoot ? path.resolve(testRoot) : app.isPackaged ? path.join(process.resourcesPath, "codex-runtime") : path.resolve(app.getAppPath(), "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc");
  const manifestPath = testRoot ? path.join(root, "codex-runtime-manifest.json") : app.isPackaged ? path.join(root, "codex-runtime-manifest.json") : path.resolve(app.getAppPath(), "dist-electron", "codex-runtime-manifest.json");
  const manifest = readManifest(manifestPath);
  const executablePath = assertRegularContainedFile(path.join(root, manifest.relativeExecutablePath), root);
  const sha256 = sha256File(executablePath); if (sha256 !== manifest.sha256) fail("CODEX_BUNDLED_RUNTIME_HASH_MISMATCH");
  return { executablePath, version: CODEX_RUNTIME_VERSION, sha256, source: "bundled", integrity: "verified", manifestPath, manifest };
}
