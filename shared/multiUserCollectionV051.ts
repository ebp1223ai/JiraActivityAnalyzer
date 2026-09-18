export type CollectionUserV051 = { id: string; queryUser: string; displayName: string };
export type CollectionUserStateV051 = CollectionUserV051 & {
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'SKIPPED';
  elapsedMs: number; eventCount: number; error: string;
};
export type CollectionSnapshotV051 = {
  runId: string; running: boolean; users: CollectionUserStateV051[];
  status: 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  discoveredBy: Record<string, string[]>; duplicateDiscoveryCount: number;
};

export function normalizeCollectionUsersV051(input: readonly (string | { accountId?: string; username?: string; displayName?: string })[]): CollectionUserV051[] {
  const users = new Map<string, CollectionUserV051>();
  for (const value of input) {
    const accountId = typeof value === 'string' ? '' : String(value.accountId ?? '').trim();
    const username = (typeof value === 'string' ? value : String(value.username ?? '')).trim().normalize('NFC').toLowerCase();
    const queryUser = accountId || username;
    if (!queryUser) continue;
    const id = accountId ? 'account:' + accountId : 'username:' + username;
    if (!users.has(id)) users.set(id, { id, queryUser, displayName: typeof value === 'string' ? queryUser : value.displayName?.trim() || queryUser });
  }
  return [...users.values()];
}

export function parseCollectionUsersV051(text: string): CollectionUserV051[] {
  return normalizeCollectionUsersV051(text.split(/[\n,;]+/));
}

/** Discovery metadata never replaces the event actor or changes a persisted event ID. */
export function mergeCollectionEventsV051<T extends { eventId: string }>(parts: { userId: string; events: T[]; identity: (event: T) => string }[]) {
  const byIdentity = new Map<string, T>();
  const discoveredBy: Record<string, string[]> = {};
  let duplicateDiscoveryCount = 0;
  for (const part of parts) for (const event of part.events) {
    const key = part.identity(event);
    const existing = byIdentity.get(key);
    const kept = existing ?? event;
    if (existing) duplicateDiscoveryCount++; else byIdentity.set(key, event);
    const users = discoveredBy[kept.eventId] ??= [];
    if (!users.includes(part.userId)) users.push(part.userId);
  }
  return { events: [...byIdentity.values()], discoveredBy, duplicateDiscoveryCount };
}
