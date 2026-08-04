export const ISSUE_VIEWER_TABS = ["Overview", "Description", "Changelog", "Comments", "Issue Links", "Activity Events", "Raw Evidence"] as const;

export type IssueViewerTab = typeof ISSUE_VIEWER_TABS[number];

export function normalizeIssueViewerTab(value: unknown): IssueViewerTab {
  const tab = String(value ?? "");
  return ISSUE_VIEWER_TABS.includes(tab as IssueViewerTab) ? tab as IssueViewerTab : "Overview";
}
