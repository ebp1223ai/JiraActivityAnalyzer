import { useEffect, useState } from "react";
import type { DescriptionOriginalPreviewPayload } from "../../shared/descriptionComparison";
import type { DescriptionDiffResult } from "../../shared/descriptionDiff";

type Side = "before" | "after";
type PreviewState =
  | { status: "loading" }
  | { status: "ready"; item: DescriptionOriginalPreviewPayload }
  | { status: "error"; code: string };

const cache = new Map<string, PreviewState>();
const listeners = new Map<string, Set<(state: PreviewState) => void>>();
const pending = new Map<string, { databaseIdentity: string; generation: string; eventIds: Set<string> }>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let requestSequence = 0;

function cacheKey(databaseIdentity: string, generation: string, eventId: string) {
  return databaseIdentity + ":" + generation + ":" + eventId;
}

function publish(key: string, state: PreviewState) {
  cache.set(key, state);
  listeners.get(key)?.forEach((listener) => listener(state));
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string);
}

function schedule(databaseIdentity: string, generation: string, eventId: string) {
  const key = cacheKey(databaseIdentity, generation, eventId);
  if (cache.has(key)) return;
  publish(key, { status: "loading" });
  const groupKey = databaseIdentity + ":" + generation;
  const group = pending.get(groupKey) ?? { databaseIdentity, generation, eventIds: new Set<string>() };
  group.eventIds.add(eventId);
  pending.set(groupKey, group);
  if (!flushTimer) flushTimer = setTimeout(() => void flush(), 0);
}

async function flush() {
  flushTimer = null;
  const groups = Array.from(pending.values());
  pending.clear();
  for (const group of groups) {
    const ids = Array.from(group.eventIds);
    for (let offset = 0; offset < ids.length; offset += 100) {
      const eventIds = ids.slice(offset, offset + 100);
      const requestId = "description-preview-" + ++requestSequence;
      try {
        const response = await window.desktopApp?.databaseViewer?.descriptionOriginalPreviews({
          requestId,
          generation: group.generation,
          databaseIdentity: group.databaseIdentity,
          eventIds
        });
        if (!response || response.requestId !== requestId || response.generation !== group.generation || response.databaseIdentity !== group.databaseIdentity) {
          eventIds.forEach((eventId) => publish(cacheKey(group.databaseIdentity, group.generation, eventId), { status: "error", code: "STALE_PREVIEW_RESPONSE" }));
          continue;
        }
        const byId = new Map(response.items.map((item) => [item.activityEventId, item]));
        eventIds.forEach((eventId) => {
          const item = byId.get(eventId);
          const error = response.errors.find((candidate) => candidate.activityEventId === eventId);
          publish(cacheKey(group.databaseIdentity, group.generation, eventId), item
            ? { status: "ready", item }
            : { status: "error", code: error?.code ?? "DESCRIPTION_PREVIEW_UNAVAILABLE" });
        });
      } catch {
        eventIds.forEach((eventId) => publish(cacheKey(group.databaseIdentity, group.generation, eventId), { status: "error", code: "DESCRIPTION_PREVIEW_LOAD_FAILED" }));
      }
    }
  }
}

function sideMessage(availability: string, side: Side) {
  if (availability === "available-empty") return "(Empty value)";
  if (availability === "unavailable") return side === "before" ? "Before unavailable" : "After unavailable";
  return "Source mismatch";
}

export function DescriptionOriginalPreviewCell({
  row,
  side,
  expanded,
  onExpandedChange
}: {
  row: Record<string, unknown>;
  side: Side;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const diff = row.descriptionDiff as DescriptionDiffResult;
  const databaseIdentity = String(row.databaseIdentity ?? "");
  const generation = String(row.previewGeneration ?? "");
  const eventId = String(diff.eventId ?? row.eventId ?? "");
  const key = cacheKey(databaseIdentity, generation, eventId);
  const [state, setState] = useState<PreviewState>(() => cache.get(key) ?? { status: "loading" });

  useEffect(() => {
    const set = listeners.get(key) ?? new Set<(next: PreviewState) => void>();
    set.add(setState);
    listeners.set(key, set);
    setState(cache.get(key) ?? { status: "loading" });
    if (diff.status !== "source-mismatch" && databaseIdentity && generation && eventId) schedule(databaseIdentity, generation, eventId);
    return () => {
      set.delete(setState);
      if (!set.size) listeners.delete(key);
    };
  }, [databaseIdentity, diff.status, eventId, generation, key]);

  if (diff.status === "source-mismatch") return <span className="text-xs font-bold text-rose-700">Source mismatch</span>;
  if (!databaseIdentity || !generation || !eventId) return <span className="text-xs font-bold text-amber-700">Original unavailable</span>;
  if (state.status === "loading") return <span className="text-xs text-muted">Loading original...</span>;
  if (state.status === "error") {
    return <div className="space-y-1 text-xs"><span className="block font-bold text-rose-700">Original preview unavailable</span><button className="font-bold text-blue-700" type="button" onClick={() => { cache.delete(key); schedule(databaseIdentity, generation, eventId); }}>Retry</button></div>;
  }

  const value = state.item[side];
  if (state.item.integrityStatus === "mismatch") return <span className="text-xs font-bold text-rose-700">Integrity mismatch</span>;
  return <div className="min-w-0 space-y-1 text-xs">
    <div className="font-black text-slate-700">{side === "before" ? "Before Original Preview" : "After Original Preview"}</div>
    {value.preview === null
      ? <span className="font-bold text-muted">{sideMessage(value.availability, side)}</span>
      : <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-[11px] leading-5">{value.preview || "(Empty value)"}</pre>}
    <div className="flex flex-wrap items-center gap-2">
      {value.truncated ? <span className="font-bold text-amber-700">Preview truncated</span> : null}
      <button className="font-black text-blue-700" type="button" onClick={() => onExpandedChange(!expanded)}>{expanded ? "Hide Full Original / 隱藏完整原文" : "View Full Original / 查看完整原文"}</button>
    </div>
  </div>;
}
