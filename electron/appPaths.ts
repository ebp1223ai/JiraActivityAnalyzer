import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

function executableDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.env.PORTABLE_EXECUTABLE_FILE) return path.dirname(process.env.PORTABLE_EXECUTABLE_FILE);
  return path.dirname(process.execPath);
}

export function getAppRuntimeDir() {
  if (app.isPackaged) return executableDir();
  return process.cwd();
}

export function getAppDataDir() {
  return path.join(getAppRuntimeDir(), "data");
}

export function getEnvPath() {
  return path.join(getAppRuntimeDir(), ".env");
}

export function getLogsDir() {
  return path.join(getAppRuntimeDir(), "logs");
}

export function getExportsDir() {
  return path.join(getAppRuntimeDir(), "exports");
}

export function getProbeResultsDir() {
  return path.join(getAppRuntimeDir(), "probe-results");
}

export function getBackupsDir() {
  return path.join(getAppRuntimeDir(), "backups");
}

export function getDatabaseDir() {
  return getAppDataDir();
}

export function getConfigDir() {
  return path.join(getAppRuntimeDir(), "config");
}

export function getConnectionsPath() {
  return path.join(getConfigDir(), "connections.json");
}

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}
