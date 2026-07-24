import fs from "node:fs";
import path from "node:path";
import { appRootDirectories } from "./appRoot.js";

export type ResolvedAppPaths = ReturnType<typeof resolveAppPaths>;

export function resolveLocalDatabasePath(appRoot: string, configuredPath: string) {
  const trimmed = String(configuredPath ?? "").trim();
  if (!trimmed) return "";
  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(appRoot, trimmed);
  return path.normalize(resolved);
}

export function databasePathForEnv(appRoot: string, databasePath: string) {
  const root = path.resolve(appRoot);
  const target = path.resolve(databasePath);
  const relative = path.relative(root, target);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return relative || path.basename(target);
  }
  return target;
}

export function validateDatabaseFilePath(databasePath: string) {
  if (!databasePath) return { ok: false as const, reason: "NOT_CONFIGURED" as const };
  try {
    const stats = fs.statSync(databasePath);
    if (!stats.isFile()) return { ok: false as const, reason: "NOT_A_FILE" as const };
    return { ok: true as const, path: path.resolve(databasePath) };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return { ok: false as const, reason: code === "ENOENT" ? "MISSING" as const : code === "EACCES" ? "PERMISSION_DENIED" as const : "UNKNOWN_ERROR" as const };
  }
}

export function resolveAppPaths(appRoot: string, localDatabasePath = "") {
  const directories = appRootDirectories(appRoot);
  return {
    appRoot: directories.root,
    env: path.join(directories.root, ".env"),
    localDatabase: resolveLocalDatabasePath(directories.root, localDatabasePath),
    logs: directories.logs,
    debugFolders: directories.debugFolders,
    exports: directories.exports,
    temporaryDatabase: path.join(directories.temp, "database")
  };
}
