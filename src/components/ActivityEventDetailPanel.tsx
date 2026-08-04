import { useMemo } from "react";
import { activityEventDisplayPolicy } from "../utils/activityEventDisplayPolicy";
import { normalizeActivityChange } from "../utils/normalizedChange";
import { ContentDiffViewer } from "./ContentDiffViewer";
import { SectionErrorBoundary } from "./SectionErrorBoundary";
import { DescriptionDiffCell, isDescriptionDiffRow } from "./DescriptionDiffCell";

export function ActivityEventDetailPanel({ row }: { row: Record<string, unknown> }) {
  const policy = useMemo(() => activityEventDisplayPolicy(row), [row]);
  const change = useMemo(() => normalizeActivityChange(row), [row]);
  if (isDescriptionDiffRow(row)) return <section className="min-w-0 rounded-md border border-blue-200 bg-white p-4" aria-label="Description Diff details"><DescriptionDiffCell row={row} detail /></section>;
  if (policy.kind === "comment") {
    return (
      <section className="min-w-0 rounded-md border border-blue-200 bg-white p-4" aria-label={`${policy.operation} Comment details`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-1 text-xs font-black ${policy.operation === "UPDATE" ? "bg-amber-100 text-amber-900" : policy.operation === "CREATE" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}`}>{policy.operation}</span>
          <strong>Comment</strong>
        </div>
        {policy.metadata.length ? <dl className="mb-4 grid min-w-0 grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">{policy.metadata.map((item) => <div key={item.label} className="min-w-0"><dt className="font-black text-muted">{item.label}</dt><dd className="break-words">{item.value}</dd></div>)}</dl> : null}
        <div className="thin-scroll max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-sm leading-relaxed">{policy.content}</div>
      </section>
    );
  }
  return (
    <SectionErrorBoundary context="activity-event-detail" safeText={`${change.contentDisplay.beforeText ?? ""}\n${change.contentDisplay.afterText ?? ""}`}>
      <section className="thin-scroll min-w-0 max-w-full overflow-auto rounded-md border border-line bg-white p-4" aria-label="Activity event diff details">
        <ContentDiffViewer result={change.contentDisplay} segments={change.diff ?? []} />
      </section>
    </SectionErrorBoundary>
  );
}
