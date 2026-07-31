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

export type ContentValue = {
  present: boolean;
  text: string | null;
  complete: boolean;
  parseFailed?: boolean;
  source: ContentSource;
  sourceId?: string | null;
};

export type ExactCurrentRecord = {
  id: string;
  text: string | null;
  complete: boolean;
  parseFailed?: boolean;
};

const emptyResult = (reason: string | null): ContentDisplayResult => ({
  mode: "empty",
  beforeText: null,
  afterText: null,
  displayText: null,
  beforeAvailable: false,
  afterAvailable: false,
  beforeComplete: false,
  afterComplete: false,
  source: "none",
  sourceId: null,
  parseStatus: "success",
  completenessReason: reason
});

function usable(value: ContentValue | null | undefined) {
  return Boolean(value?.present && value.complete && !value.parseFailed && value.text !== null);
}

export function decideContentDisplay(input: {
  before?: ContentValue | null;
  after?: ContentValue | null;
  latest?: ContentValue | null;
  notApplicable?: boolean;
}): ContentDisplayResult {
  if (input.notApplicable) return { ...emptyResult("Content is not applicable."), mode: "not_applicable" };
  const before = input.before ?? null;
  const after = input.after ?? null;
  if (usable(before) && usable(after)) {
    return {
      mode: "diff",
      beforeText: before!.text,
      afterText: after!.text,
      displayText: null,
      beforeAvailable: true,
      afterAvailable: true,
      beforeComplete: true,
      afterComplete: true,
      source: after!.source,
      sourceId: after!.sourceId ?? null,
      parseStatus: "success",
      completenessReason: null
    };
  }

  const latest = usable(after) ? after : usable(input.latest) ? input.latest! : null;
  if (latest) {
    if (latest.text === "") {
      return {
        ...emptyResult("The authoritative source confirms empty content."),
        afterAvailable: true,
        afterComplete: true,
        source: latest.source,
        sourceId: latest.sourceId ?? null
      };
    }
    return {
      mode: "latest_content",
      beforeText: null,
      afterText: null,
      displayText: latest.text,
      beforeAvailable: Boolean(before?.present),
      afterAvailable: true,
      beforeComplete: Boolean(before?.complete && !before.parseFailed),
      afterComplete: true,
      source: latest.source,
      sourceId: latest.sourceId ?? null,
      parseStatus: latest === after ? "success" : "fallback",
      completenessReason: usable(before) ? null : "A complete Before/After pair is unavailable; displaying the trusted latest content."
    };
  }

  const parseFailed = Boolean(before?.parseFailed || after?.parseFailed || input.latest?.parseFailed);
  if (parseFailed) {
    return {
      ...emptyResult("No trustworthy content remained after safe parsing."),
      mode: "parse_failed",
      beforeAvailable: Boolean(before?.present),
      afterAvailable: Boolean(after?.present || input.latest?.present),
      parseStatus: "failed"
    };
  }
  return emptyResult("No trustworthy content is available.");
}

function exactRecord(records: ExactCurrentRecord[], sourceId: string | null | undefined) {
  if (!sourceId) return null;
  return records.find((record) => record.id === sourceId) ?? null;
}

function fromExactRecord(record: ExactCurrentRecord | null, source: ContentSource): ContentValue | null {
  return record ? {
    present: true,
    text: record.text,
    complete: record.complete,
    parseFailed: record.parseFailed,
    source,
    sourceId: record.id
  } : null;
}

export function decideDescriptionContent(input: {
  before?: ContentValue | null;
  after?: ContentValue | null;
  currentDescription?: ContentValue | null;
  renderedDescription?: ContentValue | null;
}) {
  const latest = usable(input.after) ? input.after
    : usable(input.currentDescription) ? input.currentDescription
      : input.renderedDescription;
  return decideContentDisplay({ before: input.before, after: input.after, latest });
}

export function decideCommentContent(input: {
  commentId?: string | null;
  before?: ContentValue | null;
  after?: ContentValue | null;
  comments: ExactCurrentRecord[];
  verifiedEventContent?: ContentValue | null;
}) {
  const exact = fromExactRecord(exactRecord(input.comments, input.commentId), "comments_api");
  return decideContentDisplay({
    before: input.before,
    after: input.after,
    latest: usable(exact) ? exact : input.verifiedEventContent
  });
}

export function decideWorklogContent(input: {
  worklogId?: string | null;
  before?: ContentValue | null;
  after?: ContentValue | null;
  worklogs: ExactCurrentRecord[];
  deleted?: boolean;
}) {
  if (input.deleted && !usable(input.after)) return emptyResult("Deleted worklog content is unavailable.");
  return decideContentDisplay({
    before: input.before,
    after: input.after,
    latest: fromExactRecord(exactRecord(input.worklogs, input.worklogId), "worklogs_api")
  });
}
