import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveFullFetchStagingRoot } from "./fullFetchStagingPath.js";

function executableDir() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.env.PORTABLE_EXECUTABLE_FILE) return path.dirname(process.env.PORTABLE_EXECUTABLE_FILE);
  return path.dirname(process.execPath);
}

export function getAppRuntimeDir() {
  if (process.env.ELECTRON_UI_SMOKE === "1") {
    return path.resolve(process.cwd(), "test-artifacts", `electron-ui-runtime-${process.pid}`);
  }
  if (app.isPackaged) return executableDir();
  return process.cwd();
}

export function getAppDataDir() {
  return path.join(getAppRuntimeDir(), "data");
}

export function getDataDir() {
  return getAppDataDir();
}

export function getActivityStreamBaselinesDir() {
  return path.join(getDataDir(), "activity-stream-baselines");
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

export function getAppLogsDir() {
  return path.join(getLogsDir(), "app");
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

export function getFullFetchStagingDir() {
  return resolveFullFetchStagingRoot({
    override: process.env.JAA_FULL_FETCH_STAGING_ROOT,
    uiSmoke: process.env.ELECTRON_UI_SMOKE === "1",
    processId: process.pid,
    platform: process.platform,
    localAppData: process.env.LOCALAPPDATA,
    temporaryDir: os.tmpdir(),
    userDataDir: app.getPath("userData")
  });
}

export function getLegacyFullFetchStagingDir() {
  return path.join(getAppRuntimeDir(), "full-fetch-staging");
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
