import path from "node:path";
import { databasePathForEnv } from "./appPathResolver.js";
import { checkJiraConnection, type JiraConnectionCheckInput } from "./jiraConnectionCheck.js";
import { atomicPatchEnv } from "./runtimeConfig.js";
import { checkDatabaseCompatibility } from "./sourceArchiveDatabase.js";
import type { JiraRuntimeState } from "./runtimeStatus.js";

export async function testAndSaveJiraSettings(input: {
  envPath: string;
  settings: JiraConnectionCheckInput;
  check?: typeof checkJiraConnection;
  patch?: typeof atomicPatchEnv;
}) {
  const checked = await (input.check ?? checkJiraConnection)(input.settings);
  if (checked.status !== "CONNECTED") return { saved: false, checked };
  (input.patch ?? atomicPatchEnv)(input.envPath, {
    ENV_FORMAT_VERSION: "2",
    JIRA_BASE_URL: checked.baseUrlNormalized,
    JIRA_USERNAME: input.settings.username,
    JIRA_EMAIL: input.settings.email,
    JIRA_API_TOKEN: input.settings.apiToken,
    JIRA_API_VERSION: input.settings.apiVersion.replace(/^v/, ""),
    JIRA_AUTH_MODE: input.settings.authMode
  });
  return { saved: true, checked };
}

export function validateAndSaveDatabaseSelection(input: {
  appRoot: string;
  envPath: string;
  selectedPath: string;
  currentJiraIdentity?: string;
  check?: typeof checkDatabaseCompatibility;
  patch?: typeof atomicPatchEnv;
}) {
  const selectedPath = path.resolve(input.selectedPath);
  const validation = (input.check ?? checkDatabaseCompatibility)(selectedPath, input.currentJiraIdentity ?? "");
  if (!["READY", "READY_READ_ONLY", "JIRA_INSTANCE_MISMATCH"].includes(validation.status)) {
    return { saved: false, validation };
  }
  (input.patch ?? atomicPatchEnv)(input.envPath, {
    ENV_FORMAT_VERSION: "2",
    LOCAL_DATABASE_PATH: databasePathForEnv(input.appRoot, selectedPath)
  });
  return { saved: true, validation };
}

export function connectedFixture(overrides: Partial<Omit<JiraRuntimeState, "requestId">> = {}): Omit<JiraRuntimeState, "requestId"> {
  return {
    status: "CONNECTED",
    reasonCode: "CONNECTED",
    message: "Connected.",
    checkedAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    latencyMs: 1,
    baseUrlNormalized: "https://jira.example.invalid",
    accountDisplayName: "Fixture User",
    username: "fixture-user",
    serverIdentity: "jira:fixture",
    ...overrides
  };
}
