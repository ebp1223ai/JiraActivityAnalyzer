export const exportTodos = [
  "Dashboard: Save Dashboard Snapshot / Save Raw Metrics Data",
  "Connections: Save Connection Test Result / Save Raw Test Response",
  "Import: Save Preview Result / Save Dry Run Result / Save Raw Search Result",
  "Timeline: Save Timeline Result / Save Raw Activity Events / Save Filter State",
  "Analysis: Save User Analysis Result / Save Raw Aggregation Data",
  "Jira Analysis: Save Analysis Result / Save Raw Data / Save Debug Bundle",
  "Jira Probe: Save Probe Result / Save Raw Data / Save Debug Bundle",
  "Settings: Save Diagnostics Result / Save System Status Snapshot"
] as const;

export type JiraAnalysisExportKind = "analysis-result" | "raw-data" | "debug-bundle";
