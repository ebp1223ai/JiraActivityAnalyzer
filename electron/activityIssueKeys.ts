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
  mentionedIssueKeys: string[];
  relatedIssueKeys: string[];
  allIssueKeys: string[];
  source: "browse_href" | "structured_field" | "rest_key" | "unique_fallback" | "unresolved";
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
  const fallback = unique([
    ...extractJiraIssueKeys(input.title),
    ...extractJiraIssueKeys(input.summary)
  ]);

  let issueKey = "";
  let source: ActivityIssueKeyResolution["source"] = "unresolved";
  if (hrefKeys.length === 1) { issueKey = hrefKeys[0]; source = "browse_href"; }
  else if (structured.length === 1) { issueKey = structured[0]; source = "structured_field"; }
  else if (rest.length === 1) { issueKey = rest[0]; source = "rest_key"; }
  else if (hrefKeys.length === 0 && structured.length === 0 && rest.length === 0 && fallback.length === 1) { issueKey = fallback[0]; source = "unique_fallback"; }

  const relatedIssueKeys = unique((input.relatedIssueKeys ?? []).flatMap(extractJiraIssueKeys)).filter((key) => key !== issueKey);
  const mentionedIssueKeys = fallback.filter((key) => key !== issueKey && !relatedIssueKeys.includes(key));
  const allIssueKeys = unique([issueKey, ...mentionedIssueKeys, ...relatedIssueKeys].filter(Boolean));
  return {
    issueKey,
    mentionedIssueKeys,
    relatedIssueKeys,
    allIssueKeys,
    source,
    ambiguous: !issueKey && unique([...hrefKeys, ...structured, ...rest, ...fallback]).length > 1
  };
}
