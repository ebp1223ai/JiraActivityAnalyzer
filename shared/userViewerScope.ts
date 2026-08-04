export type UserViewerScope =
  | { kind: "all" }
  | { kind: "single-user"; userId: string };

export function normalizeUserViewerScope(value: unknown): UserViewerScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("USER_VIEWER_SCOPE_REQUIRED");
  const source = value as Record<string, unknown>;
  if (source.kind === "all") return { kind: "all" };
  if (source.kind === "single-user") {
    const userId = String(source.userId ?? "").trim();
    if (!userId) throw new Error("STABLE_USER_ID_REQUIRED");
    if (userId.length > 512) throw new Error("STABLE_USER_ID_TOO_LONG");
    return { kind: "single-user", userId };
  }
  throw new Error("INVALID_USER_VIEWER_SCOPE");
}

export function userViewerScopeKey(scope: UserViewerScope) {
  return scope.kind === "all" ? "scope:all" : `scope:user:${scope.userId}`;
}
