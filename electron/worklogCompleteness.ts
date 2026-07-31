import crypto from "node:crypto";
import type { JiraPaginationMetadata } from "./jira/jiraPagination.js";

export type WorklogCompletenessStatus = "complete" | "unsupported" | "permission_restricted" | "incomplete" | "failed";

export type WorklogCompleteness = {
  status: WorklogCompletenessStatus;
  reportedTotal: number | null;
  fetchedCount: number;
  uniqueWorklogCount: number;
  duplicateCount: number;
  paginationComplete: boolean;
  permissionRestricted: boolean;
  unsupported: boolean;
  fetchError: string;
  parseErrorCount: number;
};

export type NormalizedWorklog = {
  worklogId: string;
  issueId: string;
  issueKey: string;
  authorAccountId: string | null;
  authorDisplayName: string | null;
  updateAuthorAccountId: string | null;
  updateAuthorDisplayName: string | null;
  commentRaw: unknown;
  commentText: string;
  startedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  timeSpent: string | null;
  timeSpentSeconds: number | null;
  visibility: unknown;
  selfUrl: string | null;
  rawJson: Record<string, unknown>;
  fetchStatus: "complete";
  parseStatus: "success" | "fallback" | "failed";
  sourceRunId: string;
  contentHash: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function person(value: unknown) {
  const source = record(value);
  return {
    id: text(source.accountId ?? source.key ?? source.name) || null,
    name: text(source.displayName ?? source.name) || null
  };
}

function readable(value: unknown, depth = 0): string {
  if (depth > 32 || value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => readable(item, depth + 1)).filter(Boolean).join("\n");
  const source = record(value);
  if (typeof source.text === "string") return source.text;
  if (source.content !== undefined) return readable(source.content, depth + 1);
  if (source.value !== undefined) return readable(source.value, depth + 1);
  return "";
}

export function classifyWorklogCompleteness(
  metadata: JiraPaginationMetadata,
  httpStatuses: Array<number | "-">,
  parseErrorCount = 0
): WorklogCompleteness {
  const permissionRestricted = httpStatuses.some((status) => status === 401 || status === 403);
  const unsupported = httpStatuses.some((status) => status === 404 || status === 405 || status === 501);
  const status: WorklogCompletenessStatus = permissionRestricted
    ? "permission_restricted"
    : unsupported
      ? "unsupported"
      : metadata.paginationComplete && parseErrorCount === 0
        ? "complete"
        : metadata.errorCode.startsWith("HTTP_") || metadata.errorCode === "NETWORK_ERROR"
          ? "failed"
          : "incomplete";
  return {
    status,
    reportedTotal: metadata.reportedTotal,
    fetchedCount: metadata.rawFetchedCount,
    uniqueWorklogCount: metadata.fetchedCount,
    duplicateCount: metadata.duplicateCount,
    paginationComplete: metadata.paginationComplete,
    permissionRestricted,
    unsupported,
    fetchError: metadata.errorCode || metadata.errorMessage,
    parseErrorCount
  };
}

export function normalizeWorklogs(input: {
  worklogs: Record<string, unknown>[];
  issueId: string;
  issueKey: string;
  sourceRunId: string;
}) {
  let parseErrorCount = 0;
  const records = input.worklogs.flatMap((raw): NormalizedWorklog[] => {
    const worklogId = text(raw.id).trim();
    if (!worklogId) {
      parseErrorCount += 1;
      return [];
    }
    const author = person(raw.author);
    const updateAuthor = person(raw.updateAuthor);
    let commentText = "";
    let parseStatus: NormalizedWorklog["parseStatus"] = "success";
    try {
      commentText = readable(raw.comment);
      if (raw.comment !== undefined && !commentText) parseStatus = "fallback";
    } catch {
      parseErrorCount += 1;
      parseStatus = "failed";
    }
    const hashInput = JSON.stringify({
      worklogId,
      comment: raw.comment ?? null,
      started: raw.started ?? null,
      updated: raw.updated ?? null,
      timeSpentSeconds: raw.timeSpentSeconds ?? null,
      authorId: author.id
    });
    return [{
      worklogId,
      issueId: input.issueId,
      issueKey: input.issueKey,
      authorAccountId: author.id,
      authorDisplayName: author.name,
      updateAuthorAccountId: updateAuthor.id,
      updateAuthorDisplayName: updateAuthor.name,
      commentRaw: raw.comment ?? null,
      commentText,
      startedAt: text(raw.started) || null,
      createdAt: text(raw.created) || null,
      updatedAt: text(raw.updated) || null,
      timeSpent: text(raw.timeSpent) || null,
      timeSpentSeconds: Number.isFinite(Number(raw.timeSpentSeconds)) ? Number(raw.timeSpentSeconds) : null,
      visibility: raw.visibility ?? null,
      selfUrl: text(raw.self) || null,
      rawJson: raw,
      fetchStatus: "complete",
      parseStatus,
      sourceRunId: input.sourceRunId,
      contentHash: crypto.createHash("sha256").update(hashInput, "utf8").digest("hex")
    }];
  });
  return { records, parseErrorCount };
}
