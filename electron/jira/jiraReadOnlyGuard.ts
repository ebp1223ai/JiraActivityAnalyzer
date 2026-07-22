export class ReadOnlyViolationError extends Error {
  constructor(method: string, pathName: string) {
    super(`Blocked by read-only guard: ${method.toUpperCase()} ${pathName}`);
    this.name = "ReadOnlyViolationError";
  }
}

type ReadOnlyRoute = { path: RegExp; query: ReadonlySet<string> };

const queryKeys = (...values: string[]) => new Set(values);
const allowedReadOnlyRoutes: ReadOnlyRoute[] = [
  { path: /^\/rest\/api\/[23]\/myself$/, query: queryKeys() },
  { path: /^\/rest\/api\/[23]\/issue\/[^/?#]+$/, query: queryKeys("fields", "expand") },
  { path: /^\/rest\/api\/[23]\/issue\/[^/?#]+\/changelog$/, query: queryKeys("startAt", "maxResults") },
  { path: /^\/rest\/api\/[23]\/issue\/[^/?#]+\/comment$/, query: queryKeys("startAt", "maxResults", "orderBy", "expand") },
  { path: /^\/rest\/api\/[23]\/issue\/[^/?#]+\/worklog$/, query: queryKeys("startAt", "maxResults", "startedAfter", "startedBefore", "expand") },
  { path: /^\/rest\/api\/[23]\/issue\/[^/?#]+\/transitions$/, query: queryKeys("expand") },
  { path: /^\/rest\/api\/[23]\/issue\/[^/?#]+\/remotelink$/, query: queryKeys() },
  { path: /^\/rest\/api\/[23]\/search$/, query: queryKeys("jql", "startAt", "maxResults", "fields", "expand", "validateQuery", "properties") },
  { path: /^\/rest\/api\/[23]\/field$/, query: queryKeys() },
  { path: /^\/rest\/api\/[23]\/attachment\/[^/?#]+$/, query: queryKeys() }
];

const activityStreamQueryKeys = new Set([
  "maxResults",
  "streams",
  "startDate",
  "endDate",
  "os_authType",
  "providers",
  "relativeLinks",
  "local",
  "title",
  "timeout",
  "_"
]);

export function assertReadOnlyRequest(method: string, pathName: string) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") {
    throw new ReadOnlyViolationError(method, pathName);
  }

  if (!pathName.startsWith("/") || pathName.startsWith("//") || /^https?:/i.test(pathName)) {
    throw new ReadOnlyViolationError(method, pathName);
  }

  if (pathName.includes("/content") || pathName.includes("/thumbnail")) {
    throw new ReadOnlyViolationError(method, pathName);
  }

  const url = new URL(pathName, "https://jira.invalid");
  if (url.pathname === "/plugins/servlet/streams") {
    if (url.hash || Array.from(url.searchParams.keys()).some((key) => !activityStreamQueryKeys.has(key))) {
      throw new ReadOnlyViolationError(method, pathName);
    }
    return;
  }

  const route = allowedReadOnlyRoutes.find((candidate) => candidate.path.test(url.pathname));
  const hasDisallowedQuery = !route || url.hash || Array.from(url.searchParams.keys()).some((key) => !route.query.has(key));
  if (!route || hasDisallowedQuery) {
    throw new ReadOnlyViolationError(method, pathName);
  }
}
