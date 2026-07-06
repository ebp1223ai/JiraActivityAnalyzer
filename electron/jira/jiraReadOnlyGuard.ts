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
  /^\/rest\/api\/[23]\/field$/,
  /^\/rest\/api\/[23]\/attachment\/[^/?#]+$/
];

export function assertReadOnlyRequest(method: string, pathName: string) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") {
    throw new ReadOnlyViolationError(method, pathName);
  }

  if (pathName.includes("/content") || pathName.includes("/thumbnail")) {
    throw new ReadOnlyViolationError(method, pathName);
  }

  const allowed = allowedReadOnlyPaths.some((pattern) => pattern.test(pathName));
  if (!allowed) {
    throw new ReadOnlyViolationError(method, pathName);
  }
}
