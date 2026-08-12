import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { CODEX_RUNTIME_VERSION } from "../shared/chatGptContract.js";

export type ChatGptRuntimeResolution = { executablePath: string; version: typeof CODEX_RUNTIME_VERSION; sha256: string };

function sha256File(filePath: string) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function assertRegularContainedFile(candidate: string, root: string) {
  const realRoot = fs.realpathSync(root);
  const realCandidate = fs.realpathSync(candidate);
  const relative = path.relative(realRoot, realCandidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("CODEX_RUNTIME_PATH_ESCAPE");
  if (!fs.statSync(realCandidate).isFile()) throw new Error("CODEX_RUNTIME_NOT_REGULAR_FILE");
  return realCandidate;
}

export function resolveChatGptRuntime(overridePath?: string): ChatGptRuntimeResolution {
  const root = overridePath
    ? path.dirname(path.resolve(overridePath))
    : app.isPackaged
      ? path.join(process.resourcesPath, "codex-runtime")
      : path.resolve(app.getAppPath(), "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc");
  const candidate = overridePath ? path.resolve(overridePath) : path.join(root, "bin", "codex.exe");
  if (!fs.existsSync(candidate)) throw new Error("CODEX_RUNTIME_NOT_FOUND");
  const executablePath = assertRegularContainedFile(candidate, root);
  return { executablePath, version: CODEX_RUNTIME_VERSION, sha256: sha256File(executablePath) };
}
