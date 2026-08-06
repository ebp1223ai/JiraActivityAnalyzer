export type UserViewerScope =
  | { kind: "all" }
  | { kind: "selected-users"; userIds: string[] };

export function normalizeSelectedUserIds(value: unknown) {
  if (!Array.isArray(value)) throw new Error("SELECTED_USER_IDS_REQUIRED");
  const userIds = Array.from(new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)));
  if (!userIds.length) throw new Error("SELECTED_USERS_REQUIRED");
  if (userIds.length > 10_000) throw new Error("SELECTED_USERS_LIMIT_EXCEEDED");
  if (userIds.some((userId) => userId.length > 512)) throw new Error("STABLE_USER_ID_TOO_LONG");
  return userIds;
}

export function normalizeUserViewerScope(value: unknown): UserViewerScope {
  if (typeof value === "string") {
    const userId = value.trim();
    if (!userId) throw new Error("STABLE_USER_ID_REQUIRED");
    if (userId.length > 512) throw new Error("STABLE_USER_ID_TOO_LONG");
    return { kind: "selected-users", userIds: [userId] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("USER_VIEWER_SCOPE_REQUIRED");
  const source = value as Record<string, unknown>;
  if (source.kind === "all") return { kind: "all" };
  if (source.kind === "selected-users") return { kind: "selected-users", userIds: normalizeSelectedUserIds(source.userIds) };
  if (source.kind === "single-user") {
    const userId = String(source.userId ?? "").trim();
    if (!userId) throw new Error("STABLE_USER_ID_REQUIRED");
    if (userId.length > 512) throw new Error("STABLE_USER_ID_TOO_LONG");
    return { kind: "selected-users", userIds: [userId] };
  }
  throw new Error("INVALID_USER_VIEWER_SCOPE");
}

export function userViewerScopeKey(scope: UserViewerScope) {
  return scope.kind === "all" ? "scope:all" : `scope:users:${[...scope.userIds].sort().join("|")}`;
}