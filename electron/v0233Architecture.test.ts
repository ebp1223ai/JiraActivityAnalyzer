import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(process.cwd());
const mainSource = fs.readFileSync(path.join(repositoryRoot, "electron", "main.ts"), "utf8");
const preloadSource = fs.readFileSync(path.join(repositoryRoot, "electron", "preload.ts"), "utf8");
const analysisSource = fs.readFileSync(path.join(repositoryRoot, "src", "routes", "AnalysisPage.tsx"), "utf8");

const appRootInitialization = mainSource.indexOf("initializeAppRoot(resolvedAppRoot)");
const firstIpcRegistration = mainSource.indexOf("ipcMain.handle(");
const electronReady = mainSource.indexOf("app.whenReady()");
assert.ok(appRootInitialization >= 0, "APP_ROOT must be initialized");
assert.ok(firstIpcRegistration > appRootInitialization, "APP_ROOT must be initialized before IPC services");
assert.ok(electronReady > appRootInitialization, "APP_ROOT must be initialized before Electron ready");
assert.ok(mainSource.includes("applyPortableElectronPaths(app, appDirectories)"), "Electron paths must be redirected at startup");

const debugHandlerStart = mainSource.indexOf('ipcMain.handle("debug-log:save-bundle"');
const debugHandlerEnd = mainSource.indexOf('ipcMain.handle("debug-log:open-folder"', debugHandlerStart);
const debugHandler = mainSource.slice(debugHandlerStart, debugHandlerEnd);
assert.ok(debugHandler.includes("getDebugFoldersDir()"));
assert.ok(debugHandler.includes("createCollisionSafeDirectory("));
assert.equal(debugHandler.includes("showOpenDialog"), false, "one-click Debug Folder must not open a directory picker");
assert.equal(debugHandler.includes("showSaveDialog"), false, "one-click Debug Folder must not open a save dialog");

assert.equal(mainSource.includes('"user-analysis:preview-full-fetch-issue"'), false);
assert.equal(preloadSource.includes("previewFullFetchIssue"), false);
assert.ok(analysisSource.includes('data-testid="full-fetch-concise-summary"'));
assert.ok(analysisSource.includes('data-testid="full-fetch-evidence-counts"'));
assert.ok(analysisSource.includes("Detailed issue snapshots and evidence remain persisted by the main process."));
assert.equal(analysisSource.includes("Fetch Limit"), false);
assert.equal(analysisSource.includes("Full Fetch Batch Size"), false);
assert.equal(analysisSource.includes("jira-evidence-table"), false);
assert.equal(analysisSource.includes("current-issue-snapshots"), false);
assert.equal(analysisSource.includes("fetchReportPageSize"), false);
assert.equal(analysisSource.includes("expandedFetchReportIssues"), false);

console.log("v0.2.33 startup, Debug Folder, and result UI architecture tests passed.");
