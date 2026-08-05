import {
  buildLastUpdatedDateJql,
  validateLastUpdatedDateRange,
  type CandidateDiscoveryStatus,
  type LastUpdatedDiscoveryConfig,
  type UpdatedDiscoveryErrorCode
} from "../shared/candidateDiscovery.js";

export type UpdatedDiscoveryPageResponse = {
  ok: boolean;
  status: number | "-";
  contentType?: string;
  json?: unknown | null;
  message?: string;
  errorType?: string;
  bodyPreview?: string;
};

export type UpdatedDiscoveryCandidate = {
  id: string;
  key: string;
  summary: string;
  status: string;
  assignee: string;
  reporter: string;
  creator: string;
  updated: string;
  created: string;
  issueType: string;
  priority: string;
  project: string;
  matchedReason: "LAST_UPDATED_IN_RANGE";
};

export type UpdatedDiscoveryMetadata = {
  runId: string;
  startDate: string;
  endDate: string;
  mode: "LAST_UPDATED_DATE";
  startedAt: string;
  completedAt: string;
  executedJql: string;
  initialTotal: number | null;
  finalObservedTotal: number | null;
  observedTotals: number[];
  rawFetchedCount: number;
  uniqueIssueCount: number;
  duplicateCount: number;
  pageCount: number;
  lastSuccessfulStartAt: number | null;
  completenessStatus: CandidateDiscoveryStatus;
  consistencyWarnings: string[];
};

export type UpdatedDiscoveryResult = {
  ok: boolean;
  status: CandidateDiscoveryStatus;
  errorCode?: UpdatedDiscoveryErrorCode;
  message: string;
  candidates: UpdatedDiscoveryCandidate[];
  warnings: string[];
  logs: string[];
  metadata: UpdatedDiscoveryMetadata;
};

export type UpdatedDiscoveryProgress = {
  runId: string;
  status: "FETCHING" | "VALIDATING";
  startAt: number;
  pageCount: number;
  rawFetchedCount: number;
  observedTotal: number | null;
};

type SearchPage = (request: { jql: string; startAt: number; maxResults: number; attempt: number }) => Promise<UpdatedDiscoveryPageResponse>;

type RunOptions = {
  runId: string;
  config: LastUpdatedDiscoveryConfig;
  searchPage: SearchPage;
  requestedMaxResults?: number;
  retryCount?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  isCancelled?: () => boolean;
  onProgress?: (progress: UpdatedDiscoveryProgress) => void;
  now?: () => string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  const item = record(value);
  return String(item.displayName ?? item.name ?? item.key ?? item.value ?? "-");
}

function candidateFromIssue(issue: Record<string, unknown>): UpdatedDiscoveryCandidate {
  const fields = record(issue.fields);
  const project = record(fields.project);
  return {
    id: display(issue.id),
    key: display(issue.key),
    summary: display(fields.summary),
    status: display(record(fields.status).name),
    assignee: display(fields.assignee),
    reporter: display(fields.reporter),
    creator: display(fields.creator),
    updated: display(fields.updated),
    created: display(fields.created),
    issueType: display(record(fields.issuetype).name),
    priority: display(record(fields.priority).name),
    project: `${display(project.key)} / ${display(project.name)}`,
    matchedReason: "LAST_UPDATED_IN_RANGE"
  };
}

function identityFor(issue: Record<string, unknown>): string {
  const id = String(issue.id ?? "").trim();
  if (id) return `id:${id}`;
  return `key:${String(issue.key ?? "").trim().toUpperCase()}`;
}

function shouldRetry(response: UpdatedDiscoveryPageResponse): boolean {
  if (typeof response.status === "number") return new Set([408, 429, 500, 502, 503, 504]).has(response.status);
  return response.errorType === "NETWORK_ERROR" || response.errorType === "TIMEOUT";
}

function retryDelay(attempt: number): number {
  return Math.min(4000, 400 * (2 ** Math.max(0, attempt)));
}
function responseFailureCode(response: UpdatedDiscoveryPageResponse): UpdatedDiscoveryErrorCode {
  return response.status === 401 || response.status === 403
    ? "UPDATED_DISCOVERY_AUTH_FAILED"
    : "UPDATED_DISCOVERY_REQUEST_FAILED";
}

export async function runLastUpdatedCandidateDiscovery(options: RunOptions): Promise<UpdatedDiscoveryResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const validation = validateLastUpdatedDateRange(options.config.startDate, options.config.endDate);
  const logs = [
    "[INFO] Last Updated Date Candidate Discovery started",
    "[INFO] Jira Search method: GET only",
    "[INFO] Authorization: [masked]",
    "[INFO] No database write will be performed"
  ];
  const warnings: string[] = [];
  const observedTotals: number[] = [];
  const rawIssues: Record<string, unknown>[] = [];
  let pageCount = 0;
  let lastSuccessfulStartAt: number | null = null;
  let initialTotal: number | null = null;
  let finalObservedTotal: number | null = null;
  let status: CandidateDiscoveryStatus = "FAILED";
  let errorCode: UpdatedDiscoveryErrorCode | undefined;
  let message = "Last Updated Date Candidate Discovery failed.";

  const finish = (): UpdatedDiscoveryResult => {
    const unique = new Map<string, Record<string, unknown>>();
    for (const issue of rawIssues) {
      const identity = identityFor(issue);
      if (identity !== "key:" && !unique.has(identity)) unique.set(identity, issue);
    }
    const candidates = Array.from(unique.values()).map(candidateFromIssue);
    const metadata: UpdatedDiscoveryMetadata = {
      runId: options.runId,
      startDate: options.config.startDate,
      endDate: options.config.endDate,
      mode: "LAST_UPDATED_DATE",
      startedAt,
      completedAt: now(),
      executedJql: validation.ok ? buildLastUpdatedDateJql(options.config.startDate, options.config.endDate) : "",
      initialTotal,
      finalObservedTotal,
      observedTotals,
      rawFetchedCount: rawIssues.length,
      uniqueIssueCount: candidates.length,
      duplicateCount: rawIssues.length - candidates.length,
      pageCount,
      lastSuccessfulStartAt,
      completenessStatus: status,
      consistencyWarnings: warnings
    };
    logs.push(`[INFO] Completeness Status: ${status}`);
    logs.push(`[INFO] Raw fetched=${metadata.rawFetchedCount}, unique=${metadata.uniqueIssueCount}, duplicates=${metadata.duplicateCount}`);
    logs.push("[INFO] No database write performed");
    return { ok: status === "COMPLETED", status, errorCode, message, candidates: status === "COMPLETED" ? candidates : [], warnings, logs, metadata };
  };

  if (!validation.ok) {
    errorCode = validation.code;
    message = validation.message;
    logs.push(`[ERROR] ${errorCode}: ${message}`);
    return finish();
  }

  const jql = buildLastUpdatedDateJql(options.config.startDate, options.config.endDate);
  logs.push(`[INFO] Executed JQL: ${jql}`);
  const requestedMaxResults = Math.max(1, Math.min(1000, Math.trunc(options.requestedMaxResults ?? 100)));
  const retryCount = Math.max(0, Math.min(2, Math.trunc(options.retryCount ?? 2)));
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let requestedStartAt = 0;
  let expectedTotal = 0;

  while (true) {
    if (options.isCancelled?.()) {
      status = "CANCELLED";
      errorCode = "UPDATED_DISCOVERY_CANCELLED";
      message = "Last Updated Date Candidate Discovery was cancelled.";
      logs.push(`[WARN] ${errorCode}`);
      return finish();
    }
    options.onProgress?.({ runId: options.runId, status: "FETCHING", startAt: requestedStartAt, pageCount, rawFetchedCount: rawIssues.length, observedTotal: finalObservedTotal });

    let response: UpdatedDiscoveryPageResponse | null = null;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      response = await options.searchPage({ jql, startAt: requestedStartAt, maxResults: requestedMaxResults, attempt });
      if (response.ok) break;
      logs.push(`[WARN] Search page failed: startAt=${requestedStartAt}, attempt=${attempt + 1}, status=${response.status}`);
      if (!shouldRetry(response) || attempt >= retryCount) break;
      await sleep(retryDelay(attempt));
    }
    if (!response?.ok) {
      status = rawIssues.length > 0 ? "PARTIAL" : "FAILED";
      errorCode = response ? responseFailureCode(response) : "UPDATED_DISCOVERY_REQUEST_FAILED";
      message = `Last Updated Date Candidate Discovery request failed at startAt=${requestedStartAt}.`;
      if (status === "PARTIAL") warnings.push("A page failed after earlier pages had already been fetched; the prior completed candidate set was preserved.");
      logs.push(`[ERROR] ${errorCode}: ${message}`);
      return finish();
    }

    options.onProgress?.({ runId: options.runId, status: "VALIDATING", startAt: requestedStartAt, pageCount, rawFetchedCount: rawIssues.length, observedTotal: finalObservedTotal });
    const json = record(response.json);
    const responseStartAt = Number(json.startAt);
    const responseMaxResults = Number(json.maxResults);
    const responseTotal = Number(json.total);
    const issues = json.issues;
    if (!Number.isInteger(responseStartAt) || responseStartAt < 0 || !Number.isInteger(responseMaxResults) || responseMaxResults < 0 || !Number.isInteger(responseTotal) || responseTotal < 0 || !Array.isArray(issues)) {
      status = rawIssues.length > 0 ? "PARTIAL" : "FAILED";
      errorCode = "UPDATED_DISCOVERY_INVALID_RESPONSE";
      message = `Jira Search returned an invalid pagination response at startAt=${requestedStartAt}.`;
      logs.push(`[ERROR] ${errorCode}: ${message}`);
      return finish();
    }
    if (responseStartAt !== requestedStartAt) {
      status = rawIssues.length > 0 ? "PARTIAL" : "FAILED";
      errorCode = responseStartAt < requestedStartAt ? "UPDATED_DISCOVERY_PAGINATION_STALLED" : "UPDATED_DISCOVERY_INVALID_RESPONSE";
      message = `Jira Search returned startAt=${responseStartAt}; expected ${requestedStartAt}.`;
      logs.push(`[ERROR] ${errorCode}: ${message}`);
      return finish();
    }

    pageCount += 1;
    lastSuccessfulStartAt = responseStartAt;
    observedTotals.push(responseTotal);
    finalObservedTotal = responseTotal;
    if (initialTotal === null) {
      initialTotal = responseTotal;
      expectedTotal = responseTotal;
    } else if (responseTotal !== initialTotal) {
      expectedTotal = Math.max(expectedTotal, responseTotal);
      const warning = `Jira Search total changed from ${initialTotal} to ${responseTotal} during pagination.`;
      if (!warnings.includes(warning)) warnings.push(warning);
      logs.push(`[WARN] UPDATED_DISCOVERY_CONSISTENCY_CHANGED: ${warning}`);
    }

    const pageIssues = issues as Record<string, unknown>[];
    if (pageIssues.some((issue) => !issue || typeof issue !== "object" || Array.isArray(issue) || (!String(issue.id ?? "").trim() && !String(issue.key ?? "").trim()))) {
      status = rawIssues.length > 0 ? "PARTIAL" : "FAILED";
      errorCode = "UPDATED_DISCOVERY_INVALID_RESPONSE";
      message = `Jira Search returned an Issue without a valid ID or Issue Key at startAt=${requestedStartAt}.`;
      logs.push(`[ERROR] ${errorCode}: ${message}`);
      return finish();
    }
    logs.push(`[INFO] Candidate page loaded: startAt=${responseStartAt}, count=${pageIssues.length}, total=${responseTotal}, serverMaxResults=${responseMaxResults}`);
    rawIssues.push(...pageIssues);
    const nextStartAt = responseStartAt + pageIssues.length;

    if (pageIssues.length === 0 && nextStartAt < expectedTotal) {
      status = "PARTIAL";
      errorCode = "UPDATED_DISCOVERY_PAGINATION_STALLED";
      message = `Jira Search returned an empty page before total=${expectedTotal} was reached.`;
      logs.push(`[ERROR] ${errorCode}: ${message}`);
      return finish();
    }
    if (nextStartAt <= requestedStartAt && nextStartAt < expectedTotal) {
      status = "PARTIAL";
      errorCode = "UPDATED_DISCOVERY_PAGINATION_STALLED";
      message = `Pagination cursor did not advance from startAt=${requestedStartAt}.`;
      logs.push(`[ERROR] ${errorCode}: ${message}`);
      return finish();
    }
    if (nextStartAt >= expectedTotal) break;
    requestedStartAt = nextStartAt;
  }

  const uniqueIdentityCount = new Set(rawIssues.map(identityFor)).size;
  if (uniqueIdentityCount !== rawIssues.length) {
    status = "PARTIAL";
    errorCode = "UPDATED_DISCOVERY_PARTIAL";
    message = `Detected ${rawIssues.length - uniqueIdentityCount} duplicate Issue identities across Jira Search pages.`;
    warnings.push(message);
    logs.push(`[ERROR] ${errorCode}: ${message}`);
    return finish();
  }

  if (warnings.length > 0) {
    status = "PARTIAL";
    errorCode = "UPDATED_DISCOVERY_CONSISTENCY_CHANGED";
    message = "Candidate Discovery fetched all observable pages, but Jira totals changed during pagination; the prior completed candidate set was preserved.";
    return finish();
  }
  if (finalObservedTotal !== null && rawIssues.length !== finalObservedTotal) {
    status = "PARTIAL";
    errorCode = "UPDATED_DISCOVERY_TOTAL_MISMATCH";
    message = `Fetched ${rawIssues.length} raw issues but Jira reported total=${finalObservedTotal}.`;
    logs.push(`[ERROR] ${errorCode}: ${message}`);
    return finish();
  }

  status = "COMPLETED";
  message = `Last Updated Date Candidate Discovery completed with ${rawIssues.length} raw issues.`;
  return finish();
}
