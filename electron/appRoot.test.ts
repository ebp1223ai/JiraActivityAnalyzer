import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appRootDirectories, assertPathInsideRoot, createCollisionSafeDirectory, isPathInsideRoot, resolveCanonicalAppRoot, resolveInsideRoot, verifyWritableAppRoot } from "./appRoot.js";
import { applyPortableElectronPaths } from "./electronPortablePaths.js";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0233-app-root-"));

try {
  const packagedRoot = resolveCanonicalAppRoot({
    isPackaged: true,
    execPath: "C:\\Installed\\Jira Activity Analyzer.exe",
    portableExecutableDir: "D:\\Portable\\JiraActivityAnalyzer",
    developmentRoot: "C:\\Source\\ignored",
    testRoot: "C:\\Tests\\ignored"
  });
  assert.equal(packagedRoot, path.resolve("D:\\Portable\\JiraActivityAnalyzer"));
  assert.equal(resolveCanonicalAppRoot({ isPackaged: true, execPath: "C:\\Installed\\Jira Activity Analyzer.exe" }), path.dirname(path.resolve("C:\\Installed\\Jira Activity Analyzer.exe")));

  const developmentRoot = resolveCanonicalAppRoot({ isPackaged: false, execPath: process.execPath, developmentRoot: fixtureRoot });
  assert.equal(developmentRoot, path.resolve(fixtureRoot));
  assert.throws(() => resolveCanonicalAppRoot({ isPackaged: false, execPath: process.execPath }), /must be explicit/);

  const directories = appRootDirectories(developmentRoot);
  for (const derived of Object.values(directories)) assert.equal(isPathInsideRoot(developmentRoot, derived), true, derived);
  assert.equal(isPathInsideRoot(developmentRoot, path.join(developmentRoot, "..", "escape")), false);
  assert.equal(isPathInsideRoot(developmentRoot, `${developmentRoot}-sibling`), false);
  assert.throws(() => resolveInsideRoot(developmentRoot, "..", "escape"), /escapes APP_ROOT/);
  assert.throws(() => resolveInsideRoot(developmentRoot, path.resolve(fixtureRoot, "..", "absolute")), /Absolute path injection/);
  assert.throws(() => assertPathInsideRoot(developmentRoot, `${developmentRoot}-sibling`,), /escapes APP_ROOT/);

  const writable = verifyWritableAppRoot(developmentRoot);
  assert.equal(writable.writable, true);
  assert.equal(writable.fallbackAttempted, false);
  assert.throws(
    () => verifyWritableAppRoot(path.join(fixtureRoot, "unwritable"), {
      mkdirSync: fs.mkdirSync,
      writeFileSync: () => { const error = new Error("denied") as NodeJS.ErrnoException; error.code = "EACCES"; throw error; },
      unlinkSync: () => undefined
    }),
    /will not redirect data to AppData/
  );

  const first = createCollisionSafeDirectory(developmentRoot, directories.debugFolders, "jira-activity-analyzer-debug-folder-20260723_193501");
  const second = createCollisionSafeDirectory(developmentRoot, directories.debugFolders, "jira-activity-analyzer-debug-folder-20260723_193501");
  assert.equal(path.basename(first), "jira-activity-analyzer-debug-folder-20260723_193501");
  assert.equal(path.basename(second), "jira-activity-analyzer-debug-folder-20260723_193501-02");

  const calls: Array<{ type: string; name: string; value: string }> = [];
  const electron = {
    setPath: (name: string, value: string) => calls.push({ type: "setPath", name, value }),
    commandLine: { appendSwitch: (name: string, value = "") => calls.push({ type: "switch", name, value }) }
  };
  const applied = applyPortableElectronPaths(electron, directories);
  assert.deepEqual(calls.map((call) => call.name), ["userData", "sessionData", "temp", "logs", "crashDumps", "disk-cache-dir"]);
  assert.equal(applied.fallbackAttempted, false);
  assert.equal(calls.every((call) => isPathInsideRoot(developmentRoot, call.value)), true);

  console.log("APP_ROOT path resolution, containment, writable preflight, collision, and early Electron path tests passed.");
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
