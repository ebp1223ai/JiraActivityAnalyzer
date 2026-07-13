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

export function getDataDir() {
  return getAppDataDir();
}

export function getDefaultEnvPath() {
  return path.join(getAppRuntimeDir(), ".env");
}

export function getEnvPath() {
  return getDefaultEnvPath();
}

export function getLogsDir() {
  return path.join(getAppRuntimeDir(), "logs");
}

export function getFullFetchLogsDir() {
  return path.join(getLogsDir(), "full-fetch");
}

export function getCrashLogsDir() {
  return path.join(getLogsDir(), "crash");
}

export function getExportsDir() {
  return path.join(getAppRuntimeDir(), "exports");
}

export function getProbeResultsDir() {
  return path.join(getAppRuntimeDir(), "probe-results");
}

export function getRawDataDir() {
  return path.join(getExportsDir(), "raw-data");
}

export function getFullFetchRawRunsDir() {
  return getRawDataDir();
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

export function getConfigPath() {
  return path.join(getConfigDir(), "app-config.json");
}

export function getConnectionsPath() {
  return path.join(getConfigDir(), "connections.json");
}

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}
