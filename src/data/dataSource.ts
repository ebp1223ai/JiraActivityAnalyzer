import type { JiraConnection } from "../types/connection";

export const globalDataSourceMode = {
  id: "live_jira_api",
  label: "Live Jira API",
  zhLabel: "即時 Jira 查詢",
  readOnly: true,
  databaseWrite: false,
  attachmentDownload: false
} as const;

export function connectionBadgeText(connection?: JiraConnection | null) {
  if (!connection) return "Live Jira API Mode";
  if (connection.status === "not_tested") return "Jira Connection Not Tested";
  if (connection.status === "failed") return "Jira Connection Failed";
  if (connection.apiVersion === "v2") return "Jira Server Connected";
  if (connection.apiVersion === "v3") return "Jira Cloud Connected";
  return "Jira Connected";
}

export function liveJiraSourceMetadata(connection?: JiraConnection | null) {
  return {
    globalDataSourceMode: globalDataSourceMode.id,
    source: {
      type: globalDataSourceMode.id,
      baseUrl: connection?.baseUrl ?? "",
      apiVersion: connection?.apiVersion ?? "",
      authType: connection?.authType ?? "",
      readOnly: true,
      databaseWrite: false,
      attachmentDownload: false,
      token: "[masked]",
      authorization: "[masked]"
    }
  };
}
