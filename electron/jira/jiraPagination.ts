import type { JiraHttpResult } from "./jiraTypes.js";
import { jiraFailureCode } from "./jiraErrorCode.js";

export type JiraPaginationPage = {
  pageNumber: number;
  startAt: number;
  requestedMaxResults: number;
  returnedCount: number;
  reportedTotal: number | null;
  status: number | "-";
  contentType: string;
  attempts: number;
  fetchedAt: string;
  errorCode: string;
};

export type JiraPaginationMetadata = {
  reportedTotal: number | null;
  fetchedCount: number;
  rawFetchedCount: number;
  pageCount: number;
  pageSize: number;
  paginationComplete: boolean;
  duplicateCount: number;
  errorCode: string;
  errorMessage: string;
  pages: JiraPaginationPage[];
};

export type JiraPaginationResult<T> = { items: T[]; metadata: JiraPaginationMetadata };
export type JiraPageFetch = (startAt: number, maxResults: number) => Promise<{ result: JiraHttpResult; attempts: number }>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function fetchJiraPages<T extends Record<string, unknown>>(options: {
  fetchPage: JiraPageFetch;
  itemFields: string[];
  pageSize?: number;
  maxPages?: number;
  idOf?: (item: T) => string;
  now?: () => string;
}): Promise<JiraPaginationResult<T>> {
  const pageSize = Math.max(1, Math.min(1000, Math.trunc(options.pageSize ?? 100)));
  const maxPages = Math.max(1, Math.min(10000, Math.trunc(options.maxPages ?? 1000)));
  const now = options.now ?? (() => new Date().toISOString());
  const idOf = options.idOf ?? ((item: T) => String(item.id ?? "").trim());
  const items: T[] = [];
  const seen = new Set<string>();
  const pages: JiraPaginationPage[] = [];
  let startAt = 0;
  let reportedTotal: number | null = null;
  let duplicateCount = 0;
  let rawFetchedCount = 0;
  let errorCode = "";
  let errorMessage = "";

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const fetched = await options.fetchPage(startAt, pageSize);
    const response = fetched.result;
    const body = record(response.json);
    const field = options.itemFields.find((key) => Array.isArray(body[key]));
    const pageItems = field ? body[field] as T[] : [];
    const totalValue = Number(body.total);
    const validTotal = Number.isInteger(totalValue) && totalValue >= 0;
    const page: JiraPaginationPage = {
      pageNumber,
      startAt,
      requestedMaxResults: pageSize,
      returnedCount: pageItems.length,
      reportedTotal: validTotal ? totalValue : null,
      status: response.status,
      contentType: response.contentType,
      attempts: fetched.attempts,
      fetchedAt: now(),
      errorCode: response.ok ? "" : jiraFailureCode(response)
    };
    pages.push(page);

    if (!response.ok) {
      errorCode = jiraFailureCode(response);
      errorMessage = response.message || `Jira page request failed with ${response.status}.`;
      break;
    }
    if (!field || !validTotal) {
      errorCode = "INVALID_RESPONSE";
      errorMessage = "Jira pagination payload did not contain an item array and a valid total.";
      break;
    }
    if (reportedTotal === null) reportedTotal = totalValue;
    else if (reportedTotal !== totalValue) {
      errorCode = "PAGINATION_TOTAL_CHANGED";
      errorMessage = `Jira pagination total changed from ${reportedTotal} to ${totalValue}.`;
      break;
    }

    for (let index = 0; index < pageItems.length; index += 1) {
      const item = pageItems[index];
      rawFetchedCount += 1;
      const identity = idOf(item);
      if (!identity) {
        errorCode = "INVALID_RESPONSE";
        errorMessage = `Jira pagination item ${index + 1} on page ${pageNumber} has no stable identity.`;
        break;
      }
      if (seen.has(identity)) { duplicateCount += 1; continue; }
      seen.add(identity);
      items.push(item);
    }
    if (errorCode) break;

    const nextStartAt = startAt + pageItems.length;
    if (items.length === reportedTotal && duplicateCount === 0) break;
    if (pageItems.length === 0 || nextStartAt <= startAt || rawFetchedCount >= reportedTotal) {
      errorCode = duplicateCount > 0 ? "PAGINATION_DUPLICATE_RECORDS" : "PAGINATION_INCOMPLETE";
      errorMessage = duplicateCount > 0
        ? `Jira pagination returned ${duplicateCount} duplicate record(s).`
        : `Jira pagination stopped at ${items.length} of ${reportedTotal} record(s).`;
      break;
    }
    startAt = nextStartAt;
  }

  if (!errorCode && reportedTotal !== null && (items.length !== reportedTotal || duplicateCount !== 0)) {
    errorCode = duplicateCount > 0 ? "PAGINATION_DUPLICATE_RECORDS" : "PAGINATION_INCOMPLETE";
    errorMessage = `Jira pagination fetched ${items.length} of ${reportedTotal} unique record(s).`;
  }
  if (!errorCode && pages.length >= maxPages && reportedTotal !== null && items.length < reportedTotal) {
    errorCode = "PAGINATION_PAGE_LIMIT";
    errorMessage = `Jira pagination exceeded the ${maxPages} page safety limit.`;
  }

  const paginationComplete = reportedTotal !== null && items.length === reportedTotal && duplicateCount === 0 && !errorCode;
  return {
    items,
    metadata: {
      reportedTotal,
      fetchedCount: items.length,
      rawFetchedCount,
      pageCount: pages.length,
      pageSize,
      paginationComplete,
      duplicateCount,
      errorCode,
      errorMessage,
      pages
    }
  };
}
