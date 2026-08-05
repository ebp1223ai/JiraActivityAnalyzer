export type CandidateDiscoveryMode = "USER_RELATED" | "LAST_UPDATED_DATE";

export type CandidateDiscoveryStatus =
  | "IDLE"
  | "FETCHING"
  | "VALIDATING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";

export type UpdatedDiscoveryErrorCode =
  | "UPDATED_DISCOVERY_INVALID_DATE_RANGE"
  | "UPDATED_DISCOVERY_AUTH_FAILED"
  | "UPDATED_DISCOVERY_REQUEST_FAILED"
  | "UPDATED_DISCOVERY_INVALID_RESPONSE"
  | "UPDATED_DISCOVERY_PAGINATION_STALLED"
  | "UPDATED_DISCOVERY_TOTAL_MISMATCH"
  | "UPDATED_DISCOVERY_CONSISTENCY_CHANGED"
  | "UPDATED_DISCOVERY_CANCELLED"
  | "UPDATED_DISCOVERY_PARTIAL";

export type LastUpdatedDiscoveryConfig = {
  mode: "LAST_UPDATED_DATE";
  startDate: string;
  endDate: string;
};

export type UserRelatedDiscoveryConfig = {
  mode: "USER_RELATED";
  jql: string;
  safetyLimit: number;
  selectedUsers: string[];
  startDate: string;
  endDate: string;
};

export type CandidateDiscoveryConfig = LastUpdatedDiscoveryConfig | UserRelatedDiscoveryConfig;

function parseCalendarDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { year, month, day };
}

function formatUtcDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function nextCalendarDate(value: string): string {
  const parsed = parseCalendarDate(value);
  if (!parsed) return "";
  return formatUtcDate(new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1)));
}

export function validateLastUpdatedDateRange(startDate: string, endDate: string): { ok: true; endExclusive: string } | { ok: false; code: "UPDATED_DISCOVERY_INVALID_DATE_RANGE"; message: string } {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end) {
    return { ok: false, code: "UPDATED_DISCOVERY_INVALID_DATE_RANGE", message: "Start Date and End Date must be valid calendar dates." };
  }
  if (startDate > endDate) {
    return { ok: false, code: "UPDATED_DISCOVERY_INVALID_DATE_RANGE", message: "Start Date must be on or before End Date." };
  }
  return { ok: true, endExclusive: nextCalendarDate(endDate) };
}

export function buildLastUpdatedDateJql(startDate: string, endDate: string): string {
  const validation = validateLastUpdatedDateRange(startDate, endDate);
  if (!validation.ok) throw new Error(validation.message);
  return `updated >= "${startDate}" AND updated < "${validation.endExclusive}" ORDER BY updated ASC, key ASC`;
}

export function candidateDiscoveryModeLabel(mode: CandidateDiscoveryMode): string {
  return mode === "LAST_UPDATED_DATE"
    ? "All Issues by Last Updated Date / 依最後更新日期擷取全部 Issue"
    : "User-related Issues / 使用者相關 Issue";
}
export function canPublishCandidateDiscoveryResult(input: {
  status: CandidateDiscoveryStatus;
  activeRunId: string;
  responseRunId: string;
  activeMode: CandidateDiscoveryMode;
  responseMode: CandidateDiscoveryMode;
}): boolean {
  return input.status === "COMPLETED"
    && Boolean(input.activeRunId)
    && input.activeRunId === input.responseRunId
    && input.activeMode === input.responseMode;
}