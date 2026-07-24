const issueKeyPattern = /\b[A-Z][A-Z0-9_]*-\d+\b/gi;
const browsePattern = /(?:https?:\/\/[^\s"'<>]+)?\/browse\/([A-Z][A-Z0-9_]*-\d+)\b/gi;

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.toUpperCase())));
}

export function extractJiraIssueKeys(value: unknown) {
  const source = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return unique(source.match(issueKeyPattern) ?? []);
}

export type ActivityIssueKeyResolution = {
  issueKey: string;
  candidateIssueKeys: string[];
  rejectedCandidateIssueKeys: Array<{
    issueKey: string;
    provenance: "title_text" | "summary_text";
    reason: "unstructured_text_is_not_authoritative";
  }>;
  mentionedIssueKeys: string[];
  relatedIssueKeys: string[];
  allIssueKeys: string[];
  source: "browse_href" | "structured_field" | "rest_key" | "unresolved";
  ambiguous: boolean;
};

export function resolveActivityIssueKeys(input: {
  linkHref?: unknown;
  rawHtml?: unknown;
  structuredIssueKey?: unknown;
  restIssueKey?: unknown;
  title?: unknown;
  summary?: unknown;
  relatedIssueKeys?: unknown[];
}): ActivityIssueKeyResolution {
  const linkText = String(input.linkHref ?? "");
  const rawHtml = String(input.rawHtml ?? "");
  const hrefKeys = unique(Array.from(`${linkText} ${rawHtml}`.matchAll(browsePattern), (match) => match[1]));
  const structured = extractJiraIssueKeys(String(input.structuredIssueKey ?? ""));
  const rest = extractJiraIssueKeys(String(input.restIssueKey ?? ""));
  const titleCandidates = extractJiraIssueKeys(input.title);
  const summaryCandidates = extractJiraIssueKeys(input.summary);
  const fallback = unique([...titleCandidates, ...summaryCandidates]);

  let issueKey = "";
  let source: ActivityIssueKeyResolution["source"] = "unresolved";
  if (hrefKeys.length >= 1) { issueKey = hrefKeys[0]; source = "browse_href"; }
  else if (structured.length === 1) { issueKey = structured[0]; source = "structured_field"; }
  else if (rest.length === 1) { issueKey = rest[0]; source = "rest_key"; }

  const relatedIssueKeys = unique([
    ...hrefKeys.slice(1),
    ...(input.relatedIssueKeys ?? []).flatMap(extractJiraIssueKeys)
  ]).filter((key) => key !== issueKey);
  const mentionedIssueKeys: string[] = [];
  const allIssueKeys = unique([issueKey, ...relatedIssueKeys].filter(Boolean));
  const rejectedCandidateIssueKeys = fallback
    .filter((key) => key !== issueKey && !relatedIssueKeys.includes(key))
    .map((key) => ({
      issueKey: key,
      provenance: titleCandidates.includes(key) ? "title_text" as const : "summary_text" as const,
      reason: "unstructured_text_is_not_authoritative" as const
    }));
  return {
    issueKey,
    candidateIssueKeys: fallback,
    rejectedCandidateIssueKeys,
    mentionedIssueKeys,
    relatedIssueKeys,
    allIssueKeys,
    source,
    ambiguous: !issueKey && unique([...hrefKeys, ...structured, ...rest, ...fallback]).length > 1
  };
}
