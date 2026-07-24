import fs from "node:fs";
import path from "node:path";

export type AppRootResolutionInput = {
  isPackaged: boolean;
  execPath: string;
  portableExecutableDir?: string;
  portableExecutableFile?: string;
  developmentRoot?: string;
  testRoot?: string;
};

export type AppRootDirectories = {
  root: string;
  appData: string;
  cache: string;
  crashDumps: string;
  fullFetchStaging: string;
  logs: string;
  sessionData: string;
  temp: string;
  exports: string;
  debugFolders: string;
  fullFetchResults: string;
  sourceArchives: string;
};

type WritableFileSystem = Pick<typeof fs, "mkdirSync" | "writeFileSync" | "unlinkSync">;

let configuredAppRoot = "";

function nonEmpty(value: string | undefined) {
  return String(value ?? "").trim();
}

export function resolveCanonicalAppRoot(input: AppRootResolutionInput) {
  if (input.isPackaged) {
    const portableDir = nonEmpty(input.portableExecutableDir);
    if (portableDir) return path.resolve(portableDir);
    const portableFile = nonEmpty(input.portableExecutableFile);
    if (portableFile) return path.dirname(path.resolve(portableFile));
    return path.dirname(path.resolve(input.execPath));
  }

  const developmentRoot = nonEmpty(input.testRoot) || nonEmpty(input.developmentRoot);
  if (!developmentRoot) throw new Error("Development/test APP_ROOT must be explicit.");
  return path.resolve(developmentRoot);
}

export function configureAppRoot(root: string) {
  configuredAppRoot = path.resolve(root);
  return configuredAppRoot;
}

export function getConfiguredAppRoot() {
  if (!configuredAppRoot) throw new Error("APP_ROOT has not been configured.");
  return configuredAppRoot;
}

export function isPathInsideRoot(root: string, target: string) {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function assertPathInsideRoot(root: string, target: string) {
  if (!isPathInsideRoot(root, target)) {
    throw new Error(`Path escapes APP_ROOT. root=${path.resolve(root)} target=${path.resolve(target)} fallbackAttempted=false`);
  }
  return path.resolve(target);
}

export function resolveInsideRoot(root: string, ...segments: string[]) {
  for (const segment of segments) {
    if (path.isAbsolute(segment) || /^[A-Za-z]:[\\/]/.test(segment)) {
      throw new Error(`Absolute path injection rejected: ${segment}`);
    }
  }
  return assertPathInsideRoot(root, path.resolve(root, ...segments));
}

export function appRootDirectories(root: string): AppRootDirectories {
  const normalizedRoot = path.resolve(root);
  const exports = resolveInsideRoot(normalizedRoot, "exports");
  return {
    root: normalizedRoot,
    appData: resolveInsideRoot(normalizedRoot, "app-data"),
    cache: resolveInsideRoot(normalizedRoot, "cache"),
    crashDumps: resolveInsideRoot(normalizedRoot, "crash-dumps"),
    fullFetchStaging: resolveInsideRoot(normalizedRoot, "full-fetch-staging"),
    logs: resolveInsideRoot(normalizedRoot, "logs"),
    sessionData: resolveInsideRoot(normalizedRoot, "session-data"),
    temp: resolveInsideRoot(normalizedRoot, "temp"),
    exports,
    debugFolders: resolveInsideRoot(exports, "debug-folders"),
    fullFetchResults: resolveInsideRoot(exports, "full-fetch-results"),
    sourceArchives: resolveInsideRoot(exports, "source-archives")
  };
}

export function verifyWritableAppRoot(root: string, fileSystem: WritableFileSystem = fs) {
  const normalizedRoot = path.resolve(root);
  fileSystem.mkdirSync(normalizedRoot, { recursive: true });
  const probePath = resolveInsideRoot(normalizedRoot, `.jaa-write-preflight-${process.pid}-${Date.now()}`);
  try {
    fileSystem.writeFileSync(probePath, "write-preflight", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    throw new Error([
      "Unable to write application data.",
      "",
      "Required root:",
      normalizedRoot,
      "",
      "The application will not redirect data to AppData or another location.",
      "Move the application to a writable folder and try again.",
      "",
      `fallbackAttempted=false; cause=${error instanceof Error ? error.message : String(error)}`
    ].join("\n"));
  } finally {
    try { fileSystem.unlinkSync(probePath); } catch { /* The original write error is authoritative. */ }
  }
  return { root: normalizedRoot, writable: true, fallbackAttempted: false };
}

export function createCollisionSafeDirectory(root: string, parent: string, baseName: string, fileSystem: Pick<typeof fs, "mkdirSync"> = fs) {
  const normalizedParent = assertPathInsideRoot(root, parent);
  fileSystem.mkdirSync(normalizedParent, { recursive: true });
  for (let sequence = 1; sequence <= 999; sequence += 1) {
    const suffix = sequence === 1 ? "" : `-${String(sequence).padStart(2, "0")}`;
    const candidate = resolveInsideRoot(normalizedParent, `${baseName}${suffix}`);
    try {
      fileSystem.mkdirSync(candidate);
      return candidate;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Unable to create a unique output directory under APP_ROOT: ${normalizedParent}`);
}
