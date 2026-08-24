import fs from "node:fs";
import path from "node:path";
import { appRootDirectories, assertPathInsideRoot, configureAppRoot, getConfiguredAppRoot, resolveInsideRoot, verifyWritableAppRoot } from "./appRoot.js";

export function initializeAppRoot(root: string) {
  const configured = configureAppRoot(root);
  verifyWritableAppRoot(configured);
  const directories = appRootDirectories(configured);
  for (const directory of Object.values(directories)) ensureDir(directory);
  return directories;
}

export function getAppRuntimeDir() {
  return getConfiguredAppRoot();
}

export function getBundledAnalysisRulesDir() {
  return process.defaultApp ? path.resolve(process.cwd(), "rules", "v0.3.33") : path.join(process.resourcesPath, "bundled-rules", "v0.3.33");
}

export function getAppDataDir() {
  return appRootDirectories(getConfiguredAppRoot()).appData;
}

export function getDataDir() {
  return getAppDataDir();
}

export function getCacheDir() {
  return appRootDirectories(getConfiguredAppRoot()).cache;
}

export function getSessionDataDir() {
  return appRootDirectories(getConfiguredAppRoot()).sessionData;
}

export function getTempDir() {
  return appRootDirectories(getConfiguredAppRoot()).temp;
}

export function getCrashDumpsDir() {
  return appRootDirectories(getConfiguredAppRoot()).crashDumps;
}

export function getActivityStreamBaselinesDir() {
  return resolveInsideRoot(getDataDir(), "activity-stream-baselines");
}

export function getDefaultEnvPath() {
  return resolveInsideRoot(getAppRuntimeDir(), ".env");
}

export function getEnvPath() {
  return getDefaultEnvPath();
}

export function getLogsDir() {
  return appRootDirectories(getConfiguredAppRoot()).logs;
}

export function getFullFetchLogsDir() {
  return resolveInsideRoot(getLogsDir(), "full-fetch");
}

export function getCrashLogsDir() {
  return resolveInsideRoot(getLogsDir(), "crash");
}

export function getAppLogsDir() {
  return resolveInsideRoot(getLogsDir(), "app");
}

export function getExportsDir() {
  return appRootDirectories(getConfiguredAppRoot()).exports;
}

export function getDebugFoldersDir() {
  return appRootDirectories(getConfiguredAppRoot()).debugFolders;
}

export function getFullFetchResultsDir() {
  return appRootDirectories(getConfiguredAppRoot()).fullFetchResults;
}

export function getSourceArchivesDir() {
  return appRootDirectories(getConfiguredAppRoot()).sourceArchives;
}

export function getProbeResultsDir() {
  return resolveInsideRoot(getExportsDir(), "probe-results");
}

export function getRawDataDir() {
  return resolveInsideRoot(getExportsDir(), "raw-data");
}

export function getFullFetchRawRunsDir() {
  return getRawDataDir();
}

export function getFullFetchStagingDir() {
  return appRootDirectories(getConfiguredAppRoot()).fullFetchStaging;
}

export function getLegacyFullFetchStagingDir() {
  return getFullFetchStagingDir();
}

export function getBackupsDir() {
  return resolveInsideRoot(getAppRuntimeDir(), "backups");
}

export function getDatabaseDir() {
  return resolveInsideRoot(getAppDataDir(), "database");
}

export function getConfigDir() {
  return resolveInsideRoot(getAppDataDir(), "config");
}

export function getConfigPath() {
  return resolveInsideRoot(getConfigDir(), "app-config.json");
}

export function getConnectionsPath() {
  return resolveInsideRoot(getConfigDir(), "connections.json");
}

export function ensureDir(dirPath: string) {
  const safePath = assertPathInsideRoot(getConfiguredAppRoot(), dirPath);
  fs.mkdirSync(safePath, { recursive: true });
  return safePath;
}

export function assertAppPath(target: string) {
  return assertPathInsideRoot(getConfiguredAppRoot(), path.resolve(target));
}
