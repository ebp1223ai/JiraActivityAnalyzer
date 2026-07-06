import { createJiraClient } from "./jiraClient.js";
import { messageForHttpStatus, sanitizeRawJson } from "./safeJson.js";
import type { EndpointStatus, JiraHttpResult, ProbeEndpointResult, ProbeRequest } from "./jiraTypes.js";

function normalizeIssueKey(issueKey: string) {
  return String(issueKey || "").trim().toUpperCase();
}

function endpoint(endpointName: string, status: EndpointStatus, httpCode: number | "-", records: string, usefulLevel: "High" | "Medium" | "Low" | "-", notes: string, meta: Partial<ProbeEndpointResult> = {}): ProbeEndpointResult {
  return {
    method: "GET",
    contentType: "-",
    duration: "-",
    ...meta,
    endpoint: endpointName,
    status,
    httpCode,
    records,
    usefulLevel,
    notes
  };
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Empty / Not available";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(text).join(", ") || "Empty / Not available";
  const record = asRecord(value);
  if (typeof record.displayName === "string") return record.displayName;
  if (typeof record.name === "string") return record.name;
  if (typeof record.value === "string") return record.value;
  if (typeof record.key === "string") return record.key;
  return JSON.stringify(sanitizeRawJson(value)).slice(0, 220);
}

function valueType(value: unknown) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function userName(value: unknown) {
  const record = asRecord(value);
  return text(record.displayName ?? record.name ?? record.key ?? record.accountId);
}

function plainDescription(value: unknown) {
  if (!value) return "Empty / Not available";
  if (typeof value === "string") return value;
  return JSON.stringify(sanitizeRawJson(value), null, 2);
}

function collectUser(users: Map<string, { displayName: string; username: string; email: string; accountId: string; sources: Set<string>; events: number }>, value: unknown, source: string, events = 1) {
  const record = asRecord(value);
  const displayName = text(record.displayName ?? record.name ?? record.key ?? record.accountId);
  if (displayName === "Empty / Not available") return;
  const accountId = text(record.accountId);
  const key = accountId !== "Empty / Not available" ? accountId : displayName;
  const existing = users.get(key) ?? {
    displayName,
    username: text(record.name ?? record.key),
    email: text(record.emailAddress),
    accountId,
    sources: new Set<string>(),
    events: 0
  };
  existing.sources.add(source);
  existing.events += events;
  users.set(key, existing);
}

function buildInspector(params: {
  issueKey: string;
  issueJson: unknown;
  changelogJson: unknown;
  commentsJson: unknown;
  myselfJson: unknown;
  selectedApiVersion: "v3" | "v2";
  eventEstimates: Array<{ type: string; count: number }>;
}) {
  const issue = asRecord(params.issueJson);
  const fields = asRecord(issue.fields);
  const names = asRecord(issue.names);
  const schema = asRecord(issue.schema);
  const renderedFields = asRecord(issue.renderedFields);
  const project = asRecord(fields.project);
  const issueType = asRecord(fields.issuetype);
  const status = asRecord(fields.status);
  const priority = asRecord(fields.priority);
  const resolution = asRecord(fields.resolution);
  const assignee = fields.assignee;
  const reporter = fields.reporter;
  const creator = fields.creator;
  const attachments = Array.isArray(fields.attachment) ? fields.attachment : [];
  const links = Array.isArray(fields.issuelinks) ? fields.issuelinks : [];
  const comments = Array.isArray(asRecord(params.commentsJson).comments) ? asRecord(params.commentsJson).comments as unknown[] : [];
  const changelogValues = Array.isArray(asRecord(params.changelogJson).values)
    ? asRecord(params.changelogJson).values as Array<Record<string, unknown>>
    : Array.isArray(asRecord(params.changelogJson).histories)
      ? asRecord(params.changelogJson).histories as Array<Record<string, unknown>>
      : [];
  const changelogRows: Array<[string, string, string, string, string, string, string]> = [];
  const fieldCounts = new Map<string, number>();
  const users = new Map<string, { displayName: string; username: string; email: string; accountId: string; sources: Set<string>; events: number }>();

  collectUser(users, assignee, "assignee");
  collectUser(users, reporter, "reporter");
  collectUser(users, creator, "creator");

  changelogValues.forEach((history, historyIndex) => {
    const author = history.author;
    collectUser(users, author, "changelog author");
    const items = Array.isArray(history.items) ? history.items as Array<Record<string, unknown>> : [];
    items.forEach((item, itemIndex) => {
      const field = text(item.field);
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
      changelogRows.push([
        text(history.created),
        userName(author),
        field,
        text(item.fromString ?? item.from),
        text(item.toString ?? item.to),
        text(history.id ?? historyIndex),
        String(itemIndex)
      ]);
    });
  });

  const commentRows = comments.map((comment) => {
    const record = asRecord(comment);
    collectUser(users, record.author, "comment author");
    collectUser(users, record.updateAuthor, "comment update author");
    return [
      text(record.id),
      userName(record.author),
      text(record.created),
      text(record.updated),
      userName(record.updateAuthor),
      text(record.body),
      text(record.visibility)
    ] as [string, string, string, string, string, string, string];
  });

  const attachmentRows = attachments.map((attachment) => {
    const record = asRecord(attachment);
    collectUser(users, record.author, "attachment author");
    return [
      text(record.id),
      text(record.filename),
      userName(record.author),
      text(record.created),
      text(record.mimeType),
      record.size ? `${record.size} bytes` : "Empty / Not available",
      record.thumbnail ? "available (not downloaded)" : "Empty / Not available",
      record.content ? "masked readonly metadata" : "Empty / Not available"
    ] as [string, string, string, string, string, string, string, string];
  });

  const linkRows = links.map((link) => {
    const record = asRecord(link);
    const type = asRecord(record.type);
    const outward = asRecord(record.outwardIssue);
    const inward = asRecord(record.inwardIssue);
    const linked = Object.keys(outward).length ? outward : inward;
    const linkedFields = asRecord(linked.fields);
    return [
      text(record.id),
      text(type.name),
      Object.keys(outward).length ? "outward" : "inward",
      text(linked.key),
      text(linkedFields.summary),
      text(asRecord(linkedFields.status).name),
      text(asRecord(linkedFields.issuetype).name)
    ] as [string, string, string, string, string, string, string];
  });

  const issueFields = Object.entries(fields).map(([key, value]) => {
    const schemaRecord = asRecord(schema[key]);
    return [
      key,
      text(names[key] ?? key),
      text(schemaRecord.type ?? schemaRecord.custom),
      text(value),
      valueType(value),
      value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0) ? "no" : "yes",
      key.startsWith("customfield_") ? "yes" : "no"
    ] as [string, string, string, string, string, string, string];
  });

  const statusChanges = fieldCounts.get("status") ?? 0;
  const assigneeChanges = fieldCounts.get("assignee") ?? 0;
  const priorityChanges = fieldCounts.get("priority") ?? 0;
  const descriptionChanges = fieldCounts.get("description") ?? 0;
  const customFieldChanges = Array.from(fieldCounts.entries()).filter(([field]) => field.startsWith("customfield_")).reduce((total, [, count]) => total + count, 0);
  const imageCount = attachmentRows.filter((row) => row[4].startsWith("image/")).length;
  const logCount = attachmentRows.filter((row) => /\.log|text\/plain/i.test(`${row[1]} ${row[4]}`)).length;
  const excelCount = attachmentRows.filter((row) => /excel|spreadsheet|\.xls/i.test(`${row[1]} ${row[4]}`)).length;
  const zipCount = attachmentRows.filter((row) => /zip|\.zip/i.test(`${row[1]} ${row[4]}`)).length;
  const totalSize = attachments.reduce((sum, item) => sum + (Number(asRecord(item).size) || 0), 0);
  const inwardCount = linkRows.filter((row) => row[2] === "inward").length;
  const outwardCount = linkRows.filter((row) => row[2] === "outward").length;
  const editedComments = commentRows.filter((row) => row[2] !== row[3]).length;

  return {
    overview: [
      ["Issue Key", text(issue.key ?? params.issueKey)],
      ["Issue ID", text(issue.id)],
      ["Project Key", text(project.key)],
      ["Project Name", text(project.name)],
      ["Issue Type", text(issueType.name)],
      ["Summary", text(fields.summary)],
      ["Status", text(status.name)],
      ["Priority", text(priority.name)],
      ["Resolution", text(resolution.name)],
      ["Assignee", userName(assignee)],
      ["Reporter", userName(reporter)],
      ["Creator", userName(creator)],
      ["Created", text(fields.created)],
      ["Updated", text(fields.updated)],
      ["Due Date", text(fields.duedate)],
      ["Labels", text(fields.labels)],
      ["Components", text(fields.components)],
      ["Affected Versions", text(fields.versions)],
      ["Fix Versions", text(fields.fixVersions)],
      ["Sprint", text(fields.customfield_10001 ?? fields.sprint)],
      ["Epic Link / Parent", text(fields.parent ?? fields.customfield_10008)],
      ["Story Points", text(fields.customfield_10002 ?? fields.customfield_10016)],
      ["Watchers / Votes", text(`${text(fields.watches)} / ${text(fields.votes)}`)],
      ["Attachment Count", String(attachments.length)],
      ["Comment Count", String(commentRows.length)],
      ["Changelog Count", String(changelogValues.length)],
      ["Issue Link Count", String(linkRows.length)]
    ] as Array<[string, string]>,
    issueFields,
    description: {
      rendered: text(renderedFields.description),
      plainText: plainDescription(fields.description),
      raw: JSON.stringify(sanitizeRawJson(fields.description ?? null), null, 2)
    },
    changelog: {
      summary: [
        ["Histories Count", String(changelogValues.length)],
        ["Change Items Count", String(changelogRows.length)],
        ["Status Changes", String(statusChanges)],
        ["Assignee Changes", String(assigneeChanges)],
        ["Priority Changes", String(priorityChanges)],
        ["Description Changes", String(descriptionChanges)],
        ["Custom Field Changes", String(customFieldChanges)]
      ] as Array<[string, string]>,
      rows: changelogRows,
      partial: false
    },
    comments: {
      summary: [
        ["Comment Count", String(commentRows.length)],
        ["Comment Authors Count", String(new Set(commentRows.map((row) => row[1])).size)],
        ["First Comment Time", commentRows[0]?.[2] ?? "Empty / Not available"],
        ["Last Comment Time", commentRows.at(-1)?.[2] ?? "Empty / Not available"],
        ["Edited Comments Count", String(editedComments)]
      ] as Array<[string, string]>,
      rows: commentRows
    },
    attachments: {
      summary: [
        ["Attachment Count", String(attachmentRows.length)],
        ["Image Count", String(imageCount)],
        ["Log Count", String(logCount)],
        ["Excel Count", String(excelCount)],
        ["Zip Count", String(zipCount)],
        ["Total Size", `${totalSize} bytes`],
        ["Uploaders Count", String(new Set(attachmentRows.map((row) => row[2])).size)]
      ] as Array<[string, string]>,
      rows: attachmentRows
    },
    links: {
      summary: [
        ["Link Count", String(linkRows.length)],
        ["Inward Count", String(inwardCount)],
        ["Outward Count", String(outwardCount)],
        ["Link Types", Array.from(new Set(linkRows.map((row) => row[1]))).join(", ") || "Empty / Not available"]
      ] as Array<[string, string]>,
      rows: linkRows
    },
    users: Array.from(users.values()).map((user) => [
      user.displayName,
      user.username,
      user.email,
      user.accountId,
      Array.from(user.sources).join(", "),
      String(user.events)
    ] as [string, string, string, string, string, string]),
    activityEstimate: params.eventEstimates.map((item) => [
      item.type,
      String(item.count),
      item.type.includes("comment") ? "comments" : item.type.includes("attachment") ? "attachments" : item.type.includes("link") ? "links" : "changelog / issue",
      item.count > 0 ? "High" : "Low",
      item.type === "issue_link_observed" ? "Link creator may not be recoverable unless changelog contains link change event." : "Estimated from read-only API response."
    ] as [string, string, string, string, string]),
    rawJson: sanitizeRawJson({
      myself: params.myselfJson,
      issue: params.issueJson,
      changelog: params.changelogJson,
      comments: params.commentsJson,
      attachments,
      links,
      apiVersion: params.selectedApiVersion
    }) as Record<string, unknown>,
    manualCompare: [
      ["Summary", text(fields.summary), "", "Not checked", ""],
      ["Status", text(status.name), "", "Not checked", ""],
      ["Priority", text(priority.name), "", "Not checked", ""],
      ["Assignee", userName(assignee), "", "Not checked", ""],
      ["Reporter", userName(reporter), "", "Not checked", ""],
      ["Creator", userName(creator), "", "Not checked", ""],
      ["Labels", text(fields.labels), "", "Not checked", ""],
      ["Components", text(fields.components), "", "Not checked", ""],
      ["Fix Versions", text(fields.fixVersions), "", "Not checked", ""],
      ["Changelog count", String(changelogValues.length), "", "Not checked", ""],
      ["Status changes", String(statusChanges), "", "Not checked", ""],
      ["Comments count", String(commentRows.length), "", "Not checked", ""],
      ["Attachments count", String(attachmentRows.length), "", "Not checked", ""],
      ["Linked issues count", String(linkRows.length), "", "Not checked", ""]
    ] as Array<[string, string, string, string, string]>
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
    endpoints.push(endpoint("Get Myself v2", statusFor(v2Myself), v2Myself.status, v2Myself.ok ? "1" : "0", v2Myself.ok ? "High" : "Low", authFailureNote(v2Myself), { urlPath: "/rest/api/2/myself", contentType: v2Myself.contentType }));
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

  endpoints.forEach((item) => {
    if (item.endpoint === "Get Myself v3") {
      item.urlPath = "/rest/api/3/myself";
      item.contentType = v3Myself?.contentType ?? "-";
    }
  });
  debugLogs.push(`[INFO] Selected API Version: ${selectedApiVersion}`);

  const issueExpand = selectedApiVersion === "v2" ? "names,schema,renderedFields,changelog" : "names,schema,renderedFields";
  debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}`);
  const issuePath = `${apiPrefix}/issue/${encodeURIComponent(issueKey)}?fields=*all&expand=${issueExpand}`;
  const issue = await client.get(issuePath);
  appendResponseLog(debugLogs, issue);
  endpoints.push(endpoint("Get Issue", statusFor(issue), issue.status, issue.ok ? "1" : "0", issue.ok ? "High" : "Low", noteFor(issue, "Basic fields loaded"), { urlPath: issuePath, contentType: issue.contentType }));

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
  let commentsResult: JiraHttpResult | null = null;

  if (request.depth !== "basic") {
    if (selectedApiVersion === "v2") {
      debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}?expand=changelog`);
      const histories = Array.isArray(expandedChangelog?.histories) ? expandedChangelog.histories : [];
      changelog = { ok: true, status: 200, contentType: "application/json", json: { values: histories, total: histories.length } };
    } else {
      const changelogPath = `${apiPrefix}/issue/${encodeURIComponent(issueKey)}/changelog?maxResults=100`;
      debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}/changelog`);
      changelog = await client.get(changelogPath);
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
    endpoints.push(endpoint("Changelog", statusFor(changelog), changelog.status, `${changelogTotal} histories / ${changelogItems} items`, changelog.ok ? "High" : "Low", noteFor(changelog, "Field timeline available"), { urlPath: selectedApiVersion === "v2" ? `${apiPrefix}/issue/${issueKey}?expand=changelog` : `${apiPrefix}/issue/${issueKey}/changelog`, contentType: changelog.contentType }));

    debugLogs.push(`[DEBUG] GET ${apiPrefix}/issue/${issueKey}/comment`);
    const commentsPath = `${apiPrefix}/issue/${encodeURIComponent(issueKey)}/comment?maxResults=100`;
    commentsResult = await client.get(commentsPath);
    appendResponseLog(debugLogs, commentsResult);
    commentCount = commentsResult.ok && commentsResult.json && typeof commentsResult.json === "object" && Array.isArray((commentsResult.json as { comments?: unknown[] }).comments) ? (commentsResult.json as { comments: unknown[] }).comments.length : 0;
    endpoints.push(endpoint("Comments", statusFor(commentsResult), commentsResult.status, String(commentCount), commentsResult.ok ? "High" : "Low", noteFor(commentsResult, "Comment timeline available"), { urlPath: commentsPath, contentType: commentsResult.contentType }));
  } else {
    endpoints.push(endpoint("Changelog", "skipped", "-", "0", "High", "Skipped in Basic mode"));
    endpoints.push(endpoint("Comments", "skipped", "-", "0", "High", "Skipped in Basic mode"));
  }

  endpoints.push(endpoint("Attachments", "success", 200, String(attachments.length), "High", "Metadata only, no file download", { urlPath: issuePath, contentType: issue.contentType }));
  endpoints.push(endpoint("Issue Links", "success", 200, String(links.length), "Medium", "Link creator may not be recoverable unless changelog contains link change event.", { urlPath: issuePath, contentType: issue.contentType }));
  endpoints.push(endpoint("Worklog", "skipped", "-", "0", "-", "No worklog request is sent by Jira Probe"));

  const statusChanges = Math.round(changelogItems * 0.08);
  const assigneeChanges = Math.round(changelogItems * 0.04);
  const estimatedActivityEvents = 1 + changelogItems + commentCount + attachments.length + links.length + worklogCount;
  const permissionGaps = endpoints.filter((item) => item.status === "forbidden" || item.status === "failed").length;
  const coverageScore = Math.max(0, Math.min(100, 40 + (changelogItems > 0 ? 25 : 0) + (commentCount > 0 ? 10 : 0) + (attachments.length > 0 ? 5 : 0) + (links.length > 0 ? 5 : 0) - permissionGaps * 10));
  const eventEstimates = [
    { type: "issue_created", count: 1 },
    { type: "field_changed", count: changelogItems },
    { type: "status_changed", count: statusChanges },
    { type: "assignee_changed", count: assigneeChanges },
    { type: "comment_created", count: commentCount },
    { type: "comment_updated", count: 0 },
    { type: "attachment_added", count: attachments.length },
    { type: "issue_link_observed", count: links.length },
    { type: "worklog_added", count: worklogCount }
  ];
  const inspector = buildInspector({
    issueKey,
    issueJson: issue.json,
    changelogJson: changelog?.json ?? null,
    commentsJson: commentsResult?.json ?? null,
    myselfJson: myself.json,
    selectedApiVersion,
    eventEstimates
  });

  debugLogs.push(`[INFO] Issue loaded: ${issueKey}`);
  debugLogs.push(`[INFO] Issue fields parsed: ${Object.keys(fields).length} fields`);
  debugLogs.push(`[INFO] Changelog parsed: ${changelogTotal} histories, ${changelogItems} change items`);
  debugLogs.push(`[INFO] Comments parsed: ${commentCount}`);
  debugLogs.push(`[INFO] Attachments parsed: ${attachments.length}`);
  debugLogs.push(`[INFO] Issue links parsed: ${links.length}`);
  debugLogs.push(`[INFO] Parsed users: ${inspector.users.length}`);
  debugLogs.push(`[INFO] Estimated activity events: ${estimatedActivityEvents}`);
  debugLogs.push("[INFO] No database write performed");
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
    eventEstimates,
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
    inspector,
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
