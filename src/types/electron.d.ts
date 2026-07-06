import type { JiraProbeRequest, JiraProbeResult } from "./jiraProbe";

declare global {
  interface Window {
    desktopApp?: {
      platform: string;
      shell: string;
      nodeAccess: boolean;
      jiraProbe?: {
        run: (request: JiraProbeRequest) => Promise<JiraProbeResult>;
      };
      appDebug?: {
        saveTextFile: (payload: { defaultFileName: string; content: string }) => Promise<{ canceled: boolean; filePath?: string }>;
      };
    };
  }
}

export {};
