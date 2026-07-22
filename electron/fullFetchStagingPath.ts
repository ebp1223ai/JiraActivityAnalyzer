import path from "node:path";

export type FullFetchStagingPathInput = {
  override?: string;
  uiSmoke?: boolean;
  processId?: number;
  platform?: NodeJS.Platform;
  localAppData?: string;
  temporaryDir: string;
  userDataDir: string;
};

export function resolveFullFetchStagingRoot(input: FullFetchStagingPathInput) {
  if (input.override) return path.resolve(input.override);
  if (input.uiSmoke) return path.join(input.temporaryDir, "JiraActivityAnalyzer", "ui-smoke", String(input.processId ?? process.pid), "full-fetch-staging");
  if ((input.platform ?? process.platform) === "win32" && input.localAppData) {
    return path.join(input.localAppData, "JiraActivityAnalyzer", "full-fetch-staging");
  }
  return path.join(input.userDataDir, "full-fetch-staging");
}
