import { canonicalizeRichContent } from "./richContent";

export type ContentDisplayMode = "diff" | "latest_content" | "empty" | "parse_failed" | "not_applicable";
export type ContentSource = "changelog" | "current_issue_field" | "comments_api" | "worklogs_api" | "activity_stream" | "none";

export type ContentDisplayResult = {
  mode: ContentDisplayMode;
  beforeText: string | null;
  afterText: string | null;
  displayText: string | null;
  beforeAvailable: boolean;
  afterAvailable: boolean;
  beforeComplete: boolean;
  afterComplete: boolean;
  source: ContentSource;
  sourceId: string | null;
  parseStatus: "success" | "fallback" | "failed";
  completenessReason: string | null;
};

function hasOwn(source: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function storedValue(row: Record<string, unknown>, primary: string, fallback: string) {
  const present = hasOwn(row, primary) || hasOwn(row, fallback);
  const value = hasOwn(row, primary) ? row[primary] : row[fallback];
  if (typeof value !== "string") return { present, value };
  const trimmed = value.trim();
  if (!trimmed) return { present, value: "" };
  try {
    return { present, value: JSON.parse(trimmed) };
  } catch {
    return { present, value };
  }
}

function source(value: unknown): ContentSource {
  const candidate = String(value ?? "").toLowerCase();
  if (candidate.includes("comment")) return "comments_api";
  if (candidate.includes("worklog")) return "worklogs_api";
  if (candidate.includes("activity")) return "activity_stream";
  if (candidate.includes("snapshot") || candidate.includes("current")) return "current_issue_field";
  if (candidate.includes("changelog")) return "changelog";
  return "none";
}

export function contentDisplayFromActivityRow(row: Record<string, unknown>): ContentDisplayResult {
  const persistedMode = String(row.contentDisplayMode ?? row.displayMode ?? "");
  const persistedDisplay = row.displayText === undefined || row.displayText === null ? null : String(row.displayText);
  if (["diff", "latest_content", "empty", "parse_failed", "not_applicable"].includes(persistedMode)) {
    return {
      mode: persistedMode as ContentDisplayMode,
      beforeText: row.beforeText === undefined || row.beforeText === null ? null : String(row.beforeText),
      afterText: row.afterText === undefined || row.afterText === null ? null : String(row.afterText),
      displayText: persistedDisplay,
      beforeAvailable: row.beforeAvailable === true || row.beforeComplete === true,
      afterAvailable: row.afterAvailable === true || row.afterComplete === true,
      beforeComplete: row.beforeComplete === true || Number(row.beforeComplete) === 1,
      afterComplete: row.afterComplete === true || Number(row.afterComplete) === 1,
      source: source(row.contentSource ?? row.sourceProvenance),
      sourceId: String(row.sourceCommentId ?? row.sourceWorklogId ?? row.sourceRecordId ?? "") || null,
      parseStatus: row.parseStatus === "failed" || row.parseStatus === "fallback" ? row.parseStatus : "success",
      completenessReason: String(row.completenessReason ?? "") || null
    };
  }

  const before = storedValue(row, "before", "fromValueJson");
  const after = storedValue(row, "after", "toValueJson");
  const latestValue = row.commentBody ?? row.worklogComment ?? row.currentContent;
  const beforeContent = canonicalizeRichContent(before.value);
  const afterContent = canonicalizeRichContent(after.value);
  const latestContent = canonicalizeRichContent(latestValue);
  const beforeComplete = before.present && before.value !== null && before.value !== undefined && !beforeContent.parseFailed;
  const afterComplete = after.present && after.value !== null && after.value !== undefined && !afterContent.parseFailed;
  if (beforeComplete && afterComplete) {
    return {
      mode: "diff",
      beforeText: beforeContent.canonicalVisibleText,
      afterText: afterContent.canonicalVisibleText,
      displayText: null,
      beforeAvailable: true,
      afterAvailable: true,
      beforeComplete: true,
      afterComplete: true,
      source: source(row.sourceProvenance),
      sourceId: String(row.sourceRecordId ?? "") || null,
      parseStatus: "success",
      completenessReason: null
    };
  }
  const latest = afterComplete ? afterContent : latestValue !== undefined && !latestContent.parseFailed ? latestContent : null;
  if (latest) {
    return {
      mode: "latest_content",
      beforeText: null,
      afterText: null,
      displayText: latest.displayText,
      beforeAvailable: before.present,
      afterAvailable: true,
      beforeComplete,
      afterComplete: true,
      source: afterComplete ? source(row.sourceProvenance) : source(row.contentSource ?? row.sourceProvenance),
      sourceId: String(row.sourceCommentId ?? row.sourceWorklogId ?? row.sourceRecordId ?? "") || null,
      parseStatus: afterComplete ? "success" : "fallback",
      completenessReason: "Complete Before/After pair unavailable."
    };
  }
  const parseFailed = beforeContent.parseFailed || afterContent.parseFailed || latestContent.parseFailed;
  return {
    mode: parseFailed ? "parse_failed" : "empty",
    beforeText: null,
    afterText: null,
    displayText: null,
    beforeAvailable: before.present,
    afterAvailable: after.present,
    beforeComplete: false,
    afterComplete: false,
    source: "none",
    sourceId: null,
    parseStatus: parseFailed ? "failed" : "success",
    completenessReason: parseFailed ? "Safe content parsing failed." : "No trustworthy content is available."
  };
}
