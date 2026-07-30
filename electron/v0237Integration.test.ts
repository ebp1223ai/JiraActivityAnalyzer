import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  connectedFixture,
  testAndSaveJiraSettings,
  validateAndSaveDatabaseSelection
} from "./startupIntegration.js";
import { parseEnvText } from "./runtimeConfig.js";
import { createSourceArchiveDatabase } from "./sourceArchiveDatabase.js";

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0237-integration-"));
  try {
    const envPath = path.join(root, ".env");
    const original = [
      "# preserved integration comment / 保留整合測試註解",
      "ENV_FORMAT_VERSION=1",
      "JIRA_BASE_URL=https://old.example.invalid",
      "JIRA_USERNAME=old-user",
      "JIRA_API_TOKEN=old-token",
      "UNKNOWN_KEY=preserved",
      "LOCAL_DATABASE_PATH="
    ].join("\n");
    fs.writeFileSync(envPath, original, "utf8");
    const settings = {
      baseUrl: "https://new.example.invalid/",
      username: "new-user",
      email: "new-user@example.invalid",
      apiToken: "new-fixture-token",
      authMode: "bearer" as const,
      apiVersion: "v2" as const
    };
    const success = await testAndSaveJiraSettings({
      envPath,
      settings,
      check: async () => connectedFixture({ baseUrlNormalized: "https://new.example.invalid" })
    });
    assert.equal(success.saved, true);
    const savedText = fs.readFileSync(envPath, "utf8");
    const saved = parseEnvText(savedText);
    assert.equal(saved.ENV_FORMAT_VERSION, "2");
    assert.equal(saved.JIRA_BASE_URL, "https://new.example.invalid");
    assert.equal(saved.JIRA_API_TOKEN, "new-fixture-token");
    assert.equal(saved.UNKNOWN_KEY, "preserved");
    assert.match(savedText, /# preserved integration comment/);

    const beforeFailure = fs.readFileSync(envPath, "utf8");
    const failed = await testAndSaveJiraSettings({
      envPath,
      settings: { ...settings, apiToken: "failed-token" },
      check: async () => connectedFixture({
        status: "AUTH_FAILED",
        reasonCode: "AUTH_FAILED",
        message: "Authentication failed.",
        lastSuccessAt: "",
        serverIdentity: ""
      })
    });
    assert.equal(failed.saved, false);
    assert.equal(fs.readFileSync(envPath, "utf8"), beforeFailure);

    const databasePath = path.join(root, "資料庫", "archive.sqlite");
    createSourceArchiveDatabase({ targetPath: databasePath, appVersion: "0.2.37" });
    const selected = validateAndSaveDatabaseSelection({ appRoot: root, envPath, selectedPath: databasePath });
    assert.equal(selected.saved, true);
    assert.equal(parseEnvText(fs.readFileSync(envPath, "utf8")).LOCAL_DATABASE_PATH, path.normalize("資料庫\\archive.sqlite"));
    const reloadedPath = path.resolve(root, parseEnvText(fs.readFileSync(envPath, "utf8")).LOCAL_DATABASE_PATH);
    assert.equal(reloadedPath, path.resolve(databasePath));

    const invalidPath = path.join(root, "invalid.sqlite");
    fs.writeFileSync(invalidPath, "invalid", "utf8");
    const beforeInvalidSelection = fs.readFileSync(envPath, "utf8");
    const invalid = validateAndSaveDatabaseSelection({ appRoot: root, envPath, selectedPath: invalidPath });
    assert.equal(invalid.saved, false);
    assert.equal(fs.readFileSync(envPath, "utf8"), beforeInvalidSelection);

    const mainSource = fs.readFileSync(path.join(process.cwd(), "electron", "main.ts"), "utf8");
    const preloadSource = fs.readFileSync(path.join(process.cwd(), "electron", "preload.ts"), "utf8");
    const appSource = fs.readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
    const layoutSource = fs.readFileSync(path.join(process.cwd(), "src", "components", "AppLayout.tsx"), "utf8");
    const statusSource = fs.readFileSync(path.join(process.cwd(), "src", "components", "GlobalRuntimeStatusBar.tsx"), "utf8");
    const connectionsSource = fs.readFileSync(path.join(process.cwd(), "src", "routes", "ConnectionsPage.tsx"), "utf8");
    const dashboardSource = fs.readFileSync(path.join(process.cwd(), "src", "routes", "DashboardPage.tsx"), "utf8");
    assert.match(mainSource, /startBackgroundChecks/);
    assert.match(mainSource, /Promise\.allSettled|startParallel/);
    assert.doesNotMatch(mainSource, /connection:test-and-save/);
    assert.match(mainSource, /database:select-existing/);
    assert.match(mainSource, /database:create-new/);
    assert.match(mainSource, /webContents\.on\("did-finish-load"[\s\S]*startPostRendererStartup/);
    assert.match(mainSource, /startPostRendererStartup[\s\S]*startBackgroundChecks/);
    assert.match(preloadSource, /runtime-state:changed/);
    assert.doesNotMatch(preloadSource, /testAndSave|connection:save|connection:set-active/);
    assert.match(appSource, /RuntimeStatusProvider/);
    assert.match(layoutSource, /GlobalRuntimeStatusBar/);
    assert.match(statusSource, /data-testid="global-runtime-status"/);
    assert.match(dashboardSource, /data-testid="select-existing-database"/);
    assert.match(dashboardSource, /data-testid="create-new-database"/);
    assert.doesNotMatch(connectionsSource, /data-testid="select-existing-database"|data-testid="create-new-database"/);
    assert.doesNotMatch(mainSource, /connection-settings\.json|database-registry\.json/);

    console.log("v0.2.37 Electron IPC, runtime state, safe save, database selection and shared UI integration tests passed.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
