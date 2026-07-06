import { createJiraClient } from "./jiraClient.js";
import { messageForHttpStatus, sanitizeRawJson } from "./safeJson.js";
import type { EndpointStatus, JiraHttpResult, ProbeEndpointResult, ProbeRequest } from "./jiraTypes.js";

function normalizeIssueKey(issueKey: string) {
  return String(issueKey || "").trim().toUpperCase();
}

function endpoint(endpointName: string, status: EndpointStatus, httpCode: number | "-", records: string, usefulLevel: "High" | "Medium" | "Low" | "-", notes: string): ProbeEndpointResult {
  return { endpoint: endpointName, status, httpCode, records, usefulLevel, notes };
}

function statusFor(result: JiraHttpResult): EndpointStatus {
  if (result.ok) return "success";
  if (result.status === 403) return "forbidden";
  return "failed";
}

function noteFor(result: JiraHttpResult, successNote: string) {
  return result.ok ? successNote : result.message ?? messageForHttpStatus(result.status);
}

function appendResponseLog(debugLogs: string[], result: JiraHttpResult) {
  debugLogs.push(`[DEBUG] Response status: ${result.status}`);
  debugLogs.push(`[DEBUG] Content-Type: ${result.contentType || "unknown"}`);
  if (result.errorType === "NON_JSON_RESPONSE") {
    debugLogs.push("[ERROR] Expected JSON but received HTML");
    debugLogs.push("[ERROR] Possible causes: Jira login page, SSO redirect, proxy response, wrong REST API path, authentication failure");
  } else if (result.errorType === "READ_ONLY_VIOLATION") {
    debugLogs.push("[ERROR] Blocked by read-only guard");
  } else if (result.message && !result.ok) {
    debugLogs.push(`[ERROR] ${result.message}`);
  }
  if (result.bodyPreview) {
    debugLogs.push(`[DEBUG] Body preview: ${result.bodyPreview}`);
  }
}

function emptySummary(permissionGaps = 1) {
  return {
    coverageScore: 0,
    issueFields: 0,
    changelogHistories: 0,
    changeItems: 0,
    comments: 0,
    attachments: 0,
    issueLinks: 0,
    usersDetected: 0,
    estimatedActivityEvents: 0,
    permissionGaps
  };
}

function emptyEvents() {
  return [
    { type: "issue_created", count: 0 },
    { type: "field_changed", count: 0 },
    { type: "status_changed", count: 0 },
    { type: "assignee_changed", count: 0 },
    { type: "comment_created", count: 0 },
    { type: "comment_updated", count: 0 },
    { type: "attachment_added", count: 0 },
    { type: "issue_link_observed", count: 0 },
    { type: "worklog_added", count: 0 }
  ];
}

function statusText(result: JiraHttpResult | null) {
  if (!result) return "-";
  return String(result.status);
}

function contentTypeText(...results: Array<JiraHttpResult | null>) {
  return results.map((result) => result?.contentType).filter(Boolean).join(" / ") || "-";
}

function authFailureNote(result: JiraHttpResult) {
  if (result.status === 401 && result.errorType === "NON_JSON_RESPONSE") return "Unauthorized or HTML login page";
  if (result.status === 401) return "Unauthorized";
  if (result.errorType === "NON_JSON_RESPONSE") return "HTML login page or SSO/proxy response";
  return noteFor(result, "Authenticated");
}

function recommendedNextAction() {
  return [
    "Try Bearer Token / Personal Access Token if this is Jira Server/Data Center.",
    "Confirm the token is generated from the same Jira account.",
    "Confirm VPN/internal network access.",
    "Confirm SSO does not require browser login."
  ];
}

function buildAuthDiagnostics(baseUrl: string, authType: "basic" | "bearer", selectedApiVersion: "v3" | "v2" | null, v3Myself: JiraHttpResult | null, v2Myself: JiraHttpResult | null) {
  return {
    baseUrl,
    apiVersionTried: [v3Myself ? "v3" : "", v2Myself ? "v2" : ""].filter(Boolean),
    authType: authType === "bearer" ? "Bearer Token / Personal Access Token" : "Basic Auth",
    v3MyselfStatus: statusText(v3Myself),
    v2MyselfStatus: statusText(v2Myself),
    contentType: contentTypeText(v3Myself, v2Myself),
    selectedApiVersion,
    recommendedNextAction: selectedApiVersion ? ["Authentication passed. Continue issue probing with the selected API version."] : recommendedNextAction()
  };
}

function createErrorResult(request: ProbeRequest, selectedApiVersion: "v3" | "v2" | null, message: string, endpoints: ProbeEndpointResult[], debugLogs: string[], rawJson: Record<string, unknown> = {}, options?: {
  localizedMessage?: { zh: string; en: string };
  authDiagnostics?: {
    baseUrl: string;
    apiVersionTried: string[];
    authType: string;
    v3MyselfStatus: string;
    v2MyselfStatus: string;
    contentType: string;
    selectedApiVersion: "v3" | "v2" | null;
    recommendedNextAction: string[];
  };
}) {
  return {
    mode: "api",
    status: "error",
    issueKey: normalizeIssueKey(request.issueKey),
    depth: request.depth,
    apiVersion: selectedApiVersion,
    message,
    localizedMessage: options?.localizedMessage,
    authDiagnostics: options?.authDiagnostics,
    summary: emptySummary(endpoints.filter((item) => item.status === "failed" || item.status === "forbidden").length || 1),
    endpoints,
    eventEstimates: emptyEvents(),
    preview: {
      issueFields: [["Error", message]],
      changelog: [],
      comments: [],
      attachments: [],
      links: [],
      rawJson: sanitizeRawJson(rawJson) as Record<string, unknown>
    },
    hints: [
      message,
      "Real Probe did not fall back to mock data.",
      "No database write performed.",
      "Check Base URL, API version, auth type, token, VPN/proxy, and issue access."
    ],
    debugLogs,
    rawJsonEnabled: false
  };
}

function requiredFieldError(request: ProbeRequest, debugLogs: string[]) {
  const missing = [
    !request.connection.baseUrl.trim() ? "Jira Base URL" : "",
    request.authType === "basic" && !request.connection.email.trim() ? "Email / Username" : "",
    !request.connection.apiToken.trim() ? "API Token / PAT" : "",
    !normalizeIssueKey(request.issueKey) ? "Issue Key or ID" : ""
  ].filter(Boolean).join(", ");
  const message = `Missing required Real Probe fields: ${missing}. Mock result was not used.`;
  debugLogs.push(`[ERROR] ${message}`);
  return createErrorResult(request, null, message, [
    endpoint("Get Myself", "skipped", "-", "0", "-", "Skipped because required fields are missing"),
    endpoint("Get Issue", "skipped", "-", "0", "-", "Skipped because required fields are missing"),
    endpoint("Changelog", "skipped", "-", "0", "-", "Skipped because required fields are missing"),
    endpoint("Comments", "skipped", "-", "0", "-", "Skipped because required fields are missing"),
    endpoint("Attachments", "skipped", "-", "0", "-", "Skipped because required fields are missing"),
    endpoint("Issue Links", "skipped", "-", "0", "-", "Skipped because required fields are missing")
  ], debugLogs);
}

export async function runApiProbe(request: ProbeRequest) {
  const baseUrl = request.connection.baseUrl.trim().replace(/\/+$/, "");
  const issueKey = normalizeIssueKey(request.issueKey);
  const email = request.connection.email.trim();
  const apiToken = request.connection.apiToken;
  const authType = request.authType ?? "basic";
  const endpoints: ProbeEndpointResult[] = [];
  const runId = new Date().toISOString();
  const debugLogs = [
    "[INFO] Run Probe started",
    `[INFO] Run ID: ${runId}`,
    `[INFO] Selected connection: ${request.connection.name || "Custom Jira"}`,
    "[INFO] Mode: Real read-only probe",
    `[INFO] Base URL: ${baseUrl || "(empty)"}`,
    `[INFO] Issue Key or ID: ${issueKey || "(empty)"}`,
    `[INFO] Auth Type: ${authType === "bearer" ? "Bearer Token / Personal Access Token" : "Basic Auth"}`,
    "[INFO] Authorization: [masked]",
    "[INFO] Token: [masked]",
    "[INFO] API Token: [masked]",
    `[INFO] API Version: ${request.apiVersion ?? "auto"}`,
    "[INFO] No database write performed"
  ];

  if (!baseUrl || !apiToken || !issueKey || (authType === "basic" && !email)) {
    return requiredFieldError(request, debugLogs);
  }

  const client = createJiraClient({ baseUrl, email, apiToken, authType });
  let selectedApiVersion: "v3" | "v2" | null = null;
  let apiPrefix = "";
  let myself: JiraHttpResult | null = null;
  let v3Myself: JiraHttpResult | null = null;
  let v2Myself: JiraHttpResult | null = null;

  if ((request.apiVersion ?? "auto") === "auto" || request.apiVersion === "v3") {
    debugLogs.push("[DEBUG] Trying /rest/api/3/myself");
    v3Myself = await client.get("/rest/api/3/myself");
    appendResponseLog(debugLogs, v3Myself);
    if (v3Myself.ok) {
      selectedApiVersion = "v3";
      apiPrefix = "/rest/api/3";
      myself = v3Myself;
    } else {
      debugLogs.push("[WARN] v3 authentication failed");
    }
  }

  if (!selectedApiVersion && ((request.apiVersion ?? "auto") === "auto" || request.apiVersion === "v2")) {
    debugLogs.push("[DEBUG] Trying /rest/api/2/myself");
    v2Myself = await client.get("/rest/api/2/myself");
    appendResponseLog(debugLogs, v2Myself);
    if (v2Myself.ok) {
      selectedApiVersion = "v2";
      apiPrefix = "/rest/api/2";
      myself = v2Myself;
    } else {
      debugLogs.push("[WARN] v2 authentication failed");
    }
  }

  if (v3Myself) {
    endpoints.push(endpoint("Get Myself v3", statusFor(v3Myself), v3Myself.status, v3Myself.ok ? "1" : "0", v3Myself.ok ? "High" : "Low", authFailureNote(v3Myself)));
  }
  if (v2Myself) {
    endpoints.push(endpoint("Get Myself v2", statusFor(v2Myself), v2Myself.status, v2Myself.ok ? "1" : "0", v2Myself.ok ? "High" : "Low", authFailureNote(v2Myself)));
  }

  if (!selectedApiVersion || !myself) {
    const message = "Authentication failed before issue probing. Both Jira API v3 and v2 /myself checks failed. Please check Base URL, Auth Type, Username, Token, VPN, or SSO.";
    const localizedMessage = {
      zh: "認證失敗。\nJira 在 /myself 回傳 401 Unauthorized HTML 頁面。\n這通常代表 Basic Auth 不被接受、Token 無效、SSO 攔截、或 Auth Type 選錯。",
      en: "Authentication failed.\nJira returned 401 Unauthorized HTML response for /myself.\nThis usually means Basic Auth is not accepted, token is invalid, SSO intercepted the request, or the wrong auth type is selected."
    };
    debugLogs.push("[ERROR] Authentication failed. No API version selected.");
    debugLogs.push("[INFO] Issue probe skipped because authentication failed.");
    debugLogs.push("[INFO] No database write performed");
    endpoints.push(endpoint("Get Issue", "skipped", "-", "0", "-", "Skipped because authentication failed"));
    endpoints.push(endpoint("Changelog", "skipped", "-", "0", "-", "Skipped because authentication failed"));
    endpoints.push(endpoint("Comments", "skipped", "-", "0", "-", "Skipped because authentication failed"));
    endpoints.push(endpoint("Attachments", "skipped", "-", "0", "-", "Skipped because authentication failed"));
    endpoints.push(endpoint("Issue Links", "skipped", "-", "0", "-", "Skipped because authentication failed"));
    return createErrorResult(request, null, message, endpoints, debugLogs, { v3Myself, v2Myself }, {
      localizedMessage,
      authDiagnostics: {
        ...buildAuthDiagnostics(baseUrl, authType, null, v3Myself, v2Myself)
      }
    });
  }

  debugLogs.push(`[INFO] Selected API Version: ${selectedApiVersion}`);

  const issueExpand = selectedApiVersion === "v2" ? "names,schema,renderedFields,changelog" : "names,schema,renderedFields";
  debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}`);
  const issue = await client.get(`${apiPrefix}/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=${issueExpand}`);
  appendResponseLog(debugLogs, issue);
  endpoints.push(endpoint("Get Issue", statusFor(issue), issue.status, issue.ok ? "1" : "0", issue.ok ? "High" : "Low", noteFor(issue, "Basic fields available")));

  if (!issue.ok) {
    endpoints.push(endpoint("Changelog", "skipped", "-", "0", "-", "Skipped because issue failed"));
    endpoints.push(endpoint("Comments", "skipped", "-", "0", "-", "Skipped because issue failed"));
    endpoints.push(endpoint("Attachments", "skipped", "-", "0", "-", "Skipped because issue failed"));
    endpoints.push(endpoint("Issue Links", "skipped", "-", "0", "-", "Skipped because issue failed"));
    endpoints.push(endpoint("Worklog", "skipped", "-", "0", "-", "No worklog request is sent by Jira Probe"));
    return createErrorResult(request, selectedApiVersion, issue.message ?? "Issue lookup failed.", endpoints, debugLogs, { myself: myself.json, issue }, {
      authDiagnostics: buildAuthDiagnostics(baseUrl, authType, selectedApiVersion, v3Myself, v2Myself)
    });
  }

  const fields = issue.json && typeof issue.json === "object" ? (issue.json as { fields?: Record<string, unknown> }).fields ?? {} : {};
  const expandedChangelog = issue.json && typeof issue.json === "object" ? (issue.json as { changelog?: { histories?: Array<{ items?: unknown[] }> } }).changelog : undefined;
  const attachments = Array.isArray(fields.attachment) ? fields.attachment : [];
  const links = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
  let changelogTotal = 0;
  let changelogItems = 0;
  let commentCount = 0;
  const worklogCount = 0;
  let changelog: JiraHttpResult | null = null;

  if (request.depth !== "basic") {
    if (selectedApiVersion === "v2") {
      debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}?expand=changelog`);
      const histories = Array.isArray(expandedChangelog?.histories) ? expandedChangelog.histories : [];
      changelog = { ok: true, status: 200, contentType: "application/json", json: { values: histories, total: histories.length } };
    } else {
      debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}/changelog`);
      changelog = await client.get(`${apiPrefix}/issue/${encodeURIComponent(issueKey)}/changelog?maxResults=100`);
      appendResponseLog(debugLogs, changelog);
    }
    const values = changelog.ok && changelog.json && typeof changelog.json === "object"
      ? Array.isArray((changelog.json as { values?: unknown[] }).values)
        ? (changelog.json as { values: Array<{ items?: unknown[] }> }).values
        : Array.isArray((changelog.json as { histories?: unknown[] }).histories)
          ? (changelog.json as { histories: Array<{ items?: unknown[] }> }).histories
          : []
      : [];
    changelogTotal = values.length;
    changelogItems = values.reduce((total, history) => total + (Array.isArray(history.items) ? history.items.length : 0), 0);
    endpoints.push(endpoint("Changelog", statusFor(changelog), changelog.status, `${changelogTotal} histories / ${changelogItems} items`, changelog.ok ? "High" : "Low", noteFor(changelog, "Can build field_changed events")));

    debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}/comment`);
    const comments = await client.get(`${apiPrefix}/issue/${encodeURIComponent(issueKey)}/comment?maxResults=100`);
    appendResponseLog(debugLogs, comments);
    commentCount = comments.ok && comments.json && typeof comments.json === "object" && Array.isArray((comments.json as { comments?: unknown[] }).comments) ? (comments.json as { comments: unknown[] }).comments.length : 0;
    endpoints.push(endpoint("Comments", statusFor(comments), comments.status, String(commentCount), comments.ok ? "High" : "Low", noteFor(comments, "Can build comment events")));
  } else {
    endpoints.push(endpoint("Changelog", "skipped", "-", "0", "High", "Skipped in Basic mode"));
    endpoints.push(endpoint("Comments", "skipped", "-", "0", "High", "Skipped in Basic mode"));
  }

  endpoints.push(endpoint("Attachments", "success", 200, String(attachments.length), "High", "Metadata only, no file download"));
  endpoints.push(endpoint("Issue Links", "success", 200, String(links.length), "Medium", "Link creator may require changelog"));
  endpoints.push(endpoint("Worklog", "skipped", "-", "0", "-", "No worklog request is sent by Jira Probe"));

  const statusChanges = Math.round(changelogItems * 0.08);
  const assigneeChanges = Math.round(changelogItems * 0.04);
  const estimatedActivityEvents = 1 + changelogItems + commentCount + attachments.length + links.length + worklogCount;
  const permissionGaps = endpoints.filter((item) => item.status === "forbidden" || item.status === "failed").length;
  const coverageScore = Math.max(0, Math.min(100, 40 + (changelogItems > 0 ? 25 : 0) + (commentCount > 0 ? 10 : 0) + (attachments.length > 0 ? 5 : 0) + (links.length > 0 ? 5 : 0) - permissionGaps * 10));

  debugLogs.push(`[SUCCESS] Real Probe completed. Coverage Score: ${coverageScore}%`);

  return {
    mode: "api",
    status: permissionGaps > 0 ? "error" : "success",
    issueKey,
    depth: request.depth,
    apiVersion: selectedApiVersion,
    message: permissionGaps > 0 ? "Real Probe completed with endpoint errors. Mock data was not used." : "Real Probe completed with read-only Jira data.",
    authDiagnostics: buildAuthDiagnostics(baseUrl, authType, selectedApiVersion, v3Myself, v2Myself),
    summary: {
      coverageScore,
      issueFields: Object.keys(fields).length,
      changelogHistories: changelogTotal,
      changeItems: changelogItems,
      comments: commentCount,
      attachments: attachments.length,
      issueLinks: links.length,
      usersDetected: 0,
      estimatedActivityEvents,
      permissionGaps
    },
    endpoints,
    eventEstimates: [
      { type: "issue_created", count: 1 },
      { type: "field_changed", count: changelogItems },
      { type: "status_changed", count: statusChanges },
      { type: "assignee_changed", count: assigneeChanges },
      { type: "comment_created", count: commentCount },
      { type: "comment_updated", count: 0 },
      { type: "attachment_added", count: attachments.length },
      { type: "issue_link_observed", count: links.length },
      { type: "worklog_added", count: worklogCount }
    ],
    preview: {
      issueFields: [
        ["Key", issueKey],
        ["Summary", String(fields.summary ?? "-")],
        ["Status", String(((fields.status as { name?: string } | undefined)?.name) ?? "-")],
        ["Priority", String(((fields.priority as { name?: string } | undefined)?.name) ?? "-")],
        ["Assignee", String(((fields.assignee as { displayName?: string } | undefined)?.displayName) ?? "-")],
        ["Reporter", String(((fields.reporter as { displayName?: string } | undefined)?.displayName) ?? "-")]
      ],
      changelog: [],
      comments: [],
      attachments: attachments.slice(0, 5).map((item) => {
        const file = item as { filename?: string; size?: number; mimeType?: string };
        return [file.filename ?? "-", file.size ? `${file.size} bytes` : "-", file.mimeType ?? "metadata only"];
      }),
      links: links.slice(0, 5).map((item) => {
        const link = item as { type?: { name?: string }; outwardIssue?: { key?: string; fields?: { summary?: string } }; inwardIssue?: { key?: string; fields?: { summary?: string } } };
        const linked = link.outwardIssue ?? link.inwardIssue;
        return [linked?.key ?? "-", link.type?.name ?? "link", linked?.fields?.summary ?? "-"];
      }),
      rawJson: sanitizeRawJson({ myself: myself.json, issue: issue.json, changelog: changelog?.json ?? null }) as Record<string, unknown>
    },
    hints: [
      "Real Probe used only read-only GET requests.",
      permissionGaps > 0 ? "Some endpoints failed; the result is not mock data." : "Required endpoints returned readable Jira data.",
      "No Jira write was performed.",
      "No database write was performed.",
      "Attachment metadata is inspected only; file content is not downloaded."
    ],
    debugLogs,
    rawJsonEnabled: false
  };
}
