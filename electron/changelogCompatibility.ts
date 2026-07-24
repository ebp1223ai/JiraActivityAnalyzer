export type ChangelogStatusCode =
  | "CHANGELOG_COMPLETE"
  | "CHANGELOG_INCOMPLETE"
  | "CHANGELOG_TOTAL_UNAVAILABLE"
  | "CHANGELOG_MISSING"
  | "CHANGELOG_INVALID";

export type ChangelogPartialReason = {
  component: "changelog";
  code: Exclude<ChangelogStatusCode, "CHANGELOG_COMPLETE">;
  fetchedCount: number;
  expectedTotal: number | null;
  message: string;
};

export type EmbeddedChangelogResult = {
  histories: Record<string, unknown>[];
  metadata: {
    source: "issue_expand";
    startAt: number | null;
    maxResults: number | null;
    total: number | null;
    reportedTotal: number | null;
    fetchedCount: number;
    duplicateCount: 0;
    pageCount: number;
    paginationComplete: boolean;
    complete: boolean;
    statusCode: ChangelogStatusCode;
    errorCode: string;
  };
  partialReasons: ChangelogPartialReason[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function reason(code: Exclude<ChangelogStatusCode, "CHANGELOG_COMPLETE">, fetchedCount: number, expectedTotal: number | null, message: string): ChangelogPartialReason {
  return { component: "changelog", code, fetchedCount, expectedTotal, message };
}

export function evaluateEmbeddedChangelog(value: unknown): EmbeddedChangelogResult {
  const changelog = record(value);
  if (!changelog) {
    const statusCode = value === undefined || value === null ? "CHANGELOG_MISSING" : "CHANGELOG_INVALID";
    const message = statusCode === "CHANGELOG_MISSING"
      ? "Issue response does not contain expand=changelog data."
      : "Issue response changelog is not an object.";
    return {
      histories: [],
      metadata: { source: "issue_expand", startAt: null, maxResults: null, total: null, reportedTotal: null, fetchedCount: 0, duplicateCount: 0, pageCount: 0, paginationComplete: false, complete: false, statusCode, errorCode: statusCode },
      partialReasons: [reason(statusCode, 0, null, message)]
    };
  }

  if (!Array.isArray(changelog.histories) || changelog.histories.some((item) => !record(item))) {
    return {
      histories: [],
      metadata: { source: "issue_expand", startAt: nonNegativeInteger(changelog.startAt), maxResults: nonNegativeInteger(changelog.maxResults), total: nonNegativeInteger(changelog.total), reportedTotal: nonNegativeInteger(changelog.total), fetchedCount: 0, duplicateCount: 0, pageCount: 1, paginationComplete: false, complete: false, statusCode: "CHANGELOG_INVALID", errorCode: "CHANGELOG_INVALID" },
      partialReasons: [reason("CHANGELOG_INVALID", 0, nonNegativeInteger(changelog.total), "Issue response changelog.histories is not a valid array.")]
    };
  }

  const histories = changelog.histories as Record<string, unknown>[];
  const total = nonNegativeInteger(changelog.total);
  const fetchedCount = histories.length;
  const base = {
    source: "issue_expand" as const,
    startAt: nonNegativeInteger(changelog.startAt),
    maxResults: nonNegativeInteger(changelog.maxResults),
    total,
    reportedTotal: total,
    fetchedCount,
    duplicateCount: 0 as const,
    pageCount: 1
  };

  if (total === null) {
    return {
      histories,
      metadata: { ...base, paginationComplete: false, complete: false, statusCode: "CHANGELOG_TOTAL_UNAVAILABLE", errorCode: "CHANGELOG_TOTAL_UNAVAILABLE" },
      partialReasons: [reason("CHANGELOG_TOTAL_UNAVAILABLE", fetchedCount, null, `Observed ${fetchedCount} changelog histories, but Jira did not provide a valid total.`)]
    };
  }
  if (fetchedCount === total) {
    return {
      histories,
      metadata: { ...base, paginationComplete: true, complete: true, statusCode: "CHANGELOG_COMPLETE", errorCode: "" },
      partialReasons: []
    };
  }
  if (fetchedCount < total) {
    return {
      histories,
      metadata: { ...base, paginationComplete: false, complete: false, statusCode: "CHANGELOG_INCOMPLETE", errorCode: "CHANGELOG_INCOMPLETE" },
      partialReasons: [reason("CHANGELOG_INCOMPLETE", fetchedCount, total, `Observed ${fetchedCount} of ${total} changelog histories from expand=changelog.`)]
    };
  }
  return {
    histories,
    metadata: { ...base, paginationComplete: false, complete: false, statusCode: "CHANGELOG_INVALID", errorCode: "CHANGELOG_INVALID" },
    partialReasons: [reason("CHANGELOG_INVALID", fetchedCount, total, `Observed ${fetchedCount} histories, which exceeds Jira's reported total ${total}.`)]
  };
}
