import type { AppRootDirectories } from "./appRoot.js";

export type ElectronPathController = {
  setPath: (name: "userData" | "sessionData" | "temp" | "logs" | "crashDumps", value: string) => void;
  commandLine: { appendSwitch: (name: string, value?: string) => void };
};

export function applyPortableElectronPaths(app: ElectronPathController, directories: AppRootDirectories) {
  const applied = [
    ["userData", directories.appData],
    ["sessionData", directories.sessionData],
    ["temp", directories.temp],
    ["logs", directories.logs],
    ["crashDumps", directories.crashDumps]
  ] as const;

  for (const [name, value] of applied) app.setPath(name, value);
  app.commandLine.appendSwitch("disk-cache-dir", directories.cache);

  return {
    applied: Object.fromEntries(applied),
    cacheSwitch: directories.cache,
    fallbackAttempted: false
  };
}
