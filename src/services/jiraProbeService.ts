import type { JiraProbeDepth, JiraProbeRequest, JiraProbeResult } from "../types/jiraProbe";

const safeIssueKey = (issueKey: string) => issueKey.trim().toUpperCase() || "COPGEN1-126606";

const totalsByDepth: Record<JiraProbeDepth, { histories: number; changes: number; worklogs: number; score: number }> = {
  basic: { histories: 0, changes: 0, worklogs: 0, score: 45 },
  standard: { histories: 128, changes: 286, worklogs: 0, score: 86 },
  deep: { histories: 128, changes: 286, worklogs: 14, score: 92 }
};

export function createMockJiraProbeResult(request: JiraProbeRequest): JiraProbeResult {
  const issueKey = safeIssueKey(request.issueKey);
  const totals = totalsByDepth[request.depth];
  const comments = request.depth === "basic" ? 0 : 32;
  const attachments = request.depth === "basic" ? 0 : 8;
  const links = request.depth === "basic" ? 0 : 5;
  const worklogs = request.depth === "deep" ? totals.worklogs : 0;
  const estimatedActivityEvents = 1 + totals.changes + comments + attachments + links + worklogs;

  return {
    mode: "mock",
    status: "success",
    issueKey,
    depth: request.depth,
    apiVersion: "mock",
    summary: {
      coverageScore: totals.score,
      issueFields: 64,
      changelogHistories: totals.histories,
      changeItems: totals.changes,
      comments,
      attachments,
      issueLinks: links,
      usersDetected: 9,
      estimatedActivityEvents,
      permissionGaps: request.depth === "deep" ? 1 : 0
    },
    endpoints: [
      ["Get Myself", "success", 200, "1", "High", "Token can resolve current user"],
      ["Get Issue", "success", 200, "1", "High", "Basic fields available"],
      ["Changelog", request.depth === "basic" ? "skipped" : "success", request.depth === "basic" ? "-" : 200, request.depth === "basic" ? "0" : "128 histories / 286 items", "High", "Can build field_changed events"],
      ["Comments", request.depth === "basic" ? "skipped" : "success", request.depth === "basic" ? "-" : 200, String(comments), "High", "Can build comment events"],
      ["Attachments", request.depth === "basic" ? "skipped" : "success", request.depth === "basic" ? "-" : 200, String(attachments), "High", "Metadata only, no file download"],
      ["Issue Links", request.depth === "basic" ? "skipped" : "success", request.depth === "basic" ? "-" : 200, String(links), "Medium", "Link creator may require changelog"],
      ["Worklog", request.depth === "deep" ? "forbidden" : "skipped", request.depth === "deep" ? 403 : "-", String(worklogs), "Low", request.depth === "deep" ? "Permission missing or disabled" : "Only requested in Deep mode"]
    ].map(([endpoint, status, httpCode, records, usefulLevel, notes]) => ({ endpoint, status, httpCode, records, usefulLevel, notes })) as JiraProbeResult["endpoints"],
    eventEstimates: [
      { type: "issue_created", count: 1 },
      { type: "field_changed", count: Math.max(totals.changes - 18, 0) },
      { type: "status_changed", count: request.depth === "basic" ? 0 : 18 },
      { type: "assignee_changed", count: request.depth === "basic" ? 0 : 11 },
      { type: "comment_created", count: comments },
      { type: "comment_updated", count: request.depth === "basic" ? 0 : 6 },
      { type: "attachment_added", count: attachments },
      { type: "issue_link_observed", count: links },
      { type: "worklog_added", count: worklogs }
    ],
    preview: {
      issueFields: [
        ["Key", issueKey],
        ["Summary", "Investigate intermittent data sync failures between COPGEN and Jira Cloud"],
        ["Status", "In Progress"],
        ["Priority", "High"],
        ["Assignee", "Alice Chen"],
        ["Reporter", "Charlie Wu"]
      ],
      changelog: [
        ["2026/07/01 15:42", "status", "To Do -> In Progress"],
        ["2026/07/02 09:12", "assignee", "Unassigned -> Alice Chen"],
        ["2026/07/03 11:05", "priority", "Medium -> High"]
      ],
      comments: [
        ["Alice Chen", "2026/07/01 11:03", "Initial investigation notes"],
        ["Bob Lin", "2026/07/01 15:47", "Found intermittent timeout in API call"],
        ["Charlie Wu", "2026/07/02 09:12", "Added retry mechanism"]
      ],
      attachments: [
        ["sync-error-log.txt", "1.2 MB", "metadata only"],
        ["api-timeout-trace.zip", "4.8 MB", "metadata only"],
        ["retry-logic.diff", "78 KB", "metadata only"]
      ],
      links: [
        ["COPGEN1-126580", "blocks", "Data connector refactor"],
        ["COPGEN1-126612", "is blocked by", "API rate limit investigation"],
        ["COPGEN1-126645", "relates to", "Improve error logging"]
      ],
      rawJson: {
        issue: { key: issueKey, fields: { summary: "Mock issue fields", status: "In Progress" } },
        changelog: { total: totals.histories, items: totals.changes },
        comments: { total: comments },
        attachments: { total: attachments, contentDownloaded: false },
        authorization: "[redacted]"
      }
    },
    inspector: {
      overview: [
        ["Issue Key", issueKey],
        ["Issue ID", "126606"],
        ["Project Key", "COPGEN1"],
        ["Project Name", "COPGEN Platform"],
        ["Issue Type", "Bug"],
        ["Summary", "Investigate intermittent data sync failures between COPGEN and Jira Cloud"],
        ["Status", "In Progress"],
        ["Priority", "High"],
        ["Resolution", "Empty / Not available"],
        ["Assignee", "Alice Chen"],
        ["Reporter", "Charlie Wu"],
        ["Creator", "Bob Lin"],
        ["Created", "2026/07/01 10:12"],
        ["Updated", "2026/07/03 15:42"],
        ["Attachment Count", String(attachments)],
        ["Comment Count", String(comments)],
        ["Changelog Count", String(totals.histories)],
        ["Issue Link Count", String(links)]
      ],
      issueFields: [
        ["summary", "Summary", "string", "Investigate intermittent data sync failures", "string", "yes", "no"],
        ["status", "Status", "status", "In Progress", "object", "yes", "no"],
        ["priority", "Priority", "priority", "High", "object", "yes", "no"],
        ["customfield_10001", "Sprint", "array", "Sprint 24", "array", "yes", "yes"],
        ["customfield_12345", "Story Points", "number", "3", "number", "yes", "yes"]
      ],
      description: {
        rendered: "<p>Mock description rendered from sample Jira data.</p>",
        plainText: "Mock description rendered from sample Jira data.",
        raw: "Mock description rendered from sample Jira data."
      },
      changelog: {
        summary: [
          ["Histories Count", String(totals.histories)],
          ["Change Items Count", String(totals.changes)],
          ["Status Changes", request.depth === "basic" ? "0" : "18"],
          ["Assignee Changes", request.depth === "basic" ? "0" : "11"],
          ["Priority Changes", request.depth === "basic" ? "0" : "6"],
          ["Description Changes", request.depth === "basic" ? "0" : "2"],
          ["Custom Field Changes", request.depth === "basic" ? "0" : "37"]
        ],
        rows: [
          ["2026/07/01 15:42", "Bob Lin", "status", "To Do", "In Progress", "10001", "0"],
          ["2026/07/02 09:12", "Alice Chen", "assignee", "Unassigned", "Alice Chen", "10002", "0"],
          ["2026/07/03 11:05", "Charlie Wu", "priority", "Medium", "High", "10003", "0"]
        ],
        partial: false
      },
      comments: {
        summary: [
          ["Comment Count", String(comments)],
          ["Comment Authors Count", comments ? "3" : "0"],
          ["First Comment Time", comments ? "2026/07/01 11:03" : "Empty / Not available"],
          ["Last Comment Time", comments ? "2026/07/02 09:12" : "Empty / Not available"],
          ["Edited Comments Count", comments ? "1" : "0"]
        ],
        rows: [
          ["10010", "Alice Chen", "2026/07/01 11:03", "2026/07/01 11:03", "-", "Initial investigation notes", "public"],
          ["10011", "Bob Lin", "2026/07/01 15:47", "2026/07/01 16:05", "Bob Lin", "Found intermittent timeout in API call", "public"]
        ]
      },
      attachments: {
        summary: [
          ["Attachment Count", String(attachments)],
          ["Image Count", "1"],
          ["Log Count", "1"],
          ["Excel Count", "0"],
          ["Zip Count", "1"],
          ["Total Size", "6.1 MB"],
          ["Uploaders Count", "3"]
        ],
        rows: [
          ["20001", "sync-error-log.txt", "Alice Chen", "2026/07/01", "text/plain", "1.2 MB", "no", "metadata only"],
          ["20002", "api-timeout-trace.zip", "Bob Lin", "2026/07/01", "application/zip", "4.8 MB", "no", "metadata only"]
        ]
      },
      links: {
        summary: [
          ["Link Count", String(links)],
          ["Inward Count", "1"],
          ["Outward Count", "2"],
          ["Link Types", "blocks, relates to"]
        ],
        rows: [
          ["30001", "blocks", "outward", "COPGEN1-126580", "Data connector refactor", "In Progress", "Task"],
          ["30002", "is blocked by", "inward", "COPGEN1-126612", "API rate limit investigation", "To Do", "Bug"]
        ]
      },
      users: [
        ["Alice Chen", "alice.chen", "Not available from API", "mock-account-1", "assignee, comment author", "42"],
        ["Bob Lin", "bob.lin", "Not available from API", "mock-account-2", "creator, changelog author", "31"],
        ["Charlie Wu", "charlie.wu", "Not available from API", "mock-account-3", "reporter", "18"]
      ],
      activityEstimate: [
        ["issue_created", "1", "issue", "High", "One issue payload"],
        ["field_changed", String(totals.changes), "changelog", request.depth === "basic" ? "Low" : "High", "All changelog items"],
        ["status_changed", request.depth === "basic" ? "0" : "18", "changelog", "High", "field == status"],
        ["comment_created", String(comments), "comments", "High", "comment count"],
        ["attachment_added", String(attachments), "attachments", "High", "metadata only"],
        ["issue_link_observed", String(links), "links", "Medium", "link creator may not be recoverable"]
      ],
      rawJson: {
        myself: { displayName: "Mock User" },
        issue: { key: issueKey, fields: { summary: "Mock issue fields", status: "In Progress" } },
        changelog: { total: totals.histories, items: totals.changes },
        comments: { total: comments },
        authorization: "[redacted]"
      },
      manualCompare: [
        ["Summary", "Investigate intermittent data sync failures", "", "Not checked", ""],
        ["Status", "In Progress", "", "Not checked", ""],
        ["Priority", "High", "", "Not checked", ""],
        ["Comments count", String(comments), "", "Not checked", ""],
        ["Attachments count", String(attachments), "", "Not checked", ""]
      ]
    },
    hints: [
      "Token can read issue basic fields.",
      request.depth === "basic" ? "Changelog was skipped in Basic mode." : "Changelog is available; field-level timeline can be generated.",
      request.depth === "basic" ? "Comments were skipped in Basic mode." : "Comments are available; discussion timeline can be generated.",
      "Attachment metadata is available; file content is not downloaded.",
      request.depth === "basic" ? "Issue links were skipped in Basic mode." : "Issue links are available, but link creator may not be fully recoverable.",
      request.depth === "deep" ? "Worklog is unavailable due to permission or not enabled." : "Worklog is only requested in Deep mode."
    ],
    debugLogs: [
      "[INFO] Run Probe started",
      `[INFO] Run ID: mock-${Date.now()}`,
      "[INFO] Mode: Mock probe",
      "[INFO] Jira Probe uses Live Jira API regardless of global data source mode",
      "[INFO] Data Source Mode: Live Jira API",
      "[INFO] Connection Source: Current .env Jira Connection",
      "[INFO] API Version: Jira Server/Data Center v2",
      "[INFO] Auth Type: Bearer Token / PAT",
      "[INFO] Authorization: [masked]",
      "[INFO] Standard read-only probe started",
      "[INFO] Probe Scope: Standard read-only issue analysis",
      `[INFO] Issue Key: ${issueKey}`,
      "[INFO] Mock Mode enabled",
      "[INFO] No Jira request sent",
      "[INFO] No database write performed",
      `[INFO] Rendering safe sample result for ${issueKey}`,
      request.depth === "basic" ? "[INFO] Changelog skipped in Basic mode" : `[INFO] Changelog loaded: ${totals.histories} histories, ${totals.changes} items`,
      request.depth === "basic" ? "[INFO] Comments skipped in Basic mode" : `[INFO] Comments loaded: ${comments}`,
      `[INFO] Attachment metadata parsed: ${attachments}`,
      `[INFO] Issue links parsed: ${links}`,
      request.depth === "deep" ? "[WARN] Worklog unavailable: 403 Forbidden" : "[INFO] Worklog skipped",
      `[INFO] Estimated activity events: ${estimatedActivityEvents}`,
      `[SUCCESS] Probe completed. Coverage Score: ${totals.score}%`
    ],
    rawJsonEnabled: false
  };
}

export async function runJiraProbe(request: JiraProbeRequest): Promise<JiraProbeResult> {
  if (request.useMock) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return createMockJiraProbeResult(request);
  }

  if (!request.connection.apiToken.trim()) {
    throw new Error("API Token is required for Real Probe. Mock result was not used.");
  }

  if (!window.desktopApp?.jiraProbe?.run) {
    throw new Error("Real Probe is only available inside the Electron app. Mock result was not used.");
  }

  return window.desktopApp.jiraProbe.run({
    ...request,
    issueKey: safeIssueKey(request.issueKey),
    connection: {
      ...request.connection,
      baseUrl: request.connection.baseUrl.trim().replace(/\/+$/, "")
    }
  });
}
