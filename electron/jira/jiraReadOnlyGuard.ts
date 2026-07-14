export class ReadOnlyViolationError extends Error {
  constructor(method: string, pathName: string) {
    super(`Blocked by read-only guard: ${method.toUpperCase()} ${pathName}`);
    this.name = "ReadOnlyViolationError";
  }
}

const allowedReadOnlyPaths = [
  /^\/rest\/api\/[23]\/myself$/,
  /^\/rest\/api\/[23]\/issue\/[^/?#]+(?:\?.*)?$/,
  /^\/rest\/api\/[23]\/issue\/[^/?#]+\/comment(?:\?.*)?$/,
  /^\/rest\/api\/[23]\/issue\/[^/?#]+\/worklog(?:\?.*)?$/,
  /^\/rest\/api\/[23]\/issue\/[^/?#]+\/transitions(?:\?.*)?$/,
  /^\/rest\/api\/[23]\/search(?:\?.*)?$/,
  /^\/rest\/api\/[23]\/field$/,
  /^\/rest\/api\/[23]\/attachment\/[^/?#]+$/
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
  "timeout"
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

  const allowed = allowedReadOnlyPaths.some((pattern) => pattern.test(pathName));
  if (!allowed) {
    throw new ReadOnlyViolationError(method, pathName);
  }
}
