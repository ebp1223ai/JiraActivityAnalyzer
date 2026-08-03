import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatDisplayTime } from "../utils/displayTime";
import { readableContentSummary, readableContentText } from "../utils/richContent";
import { JiraContent } from "./JiraContent";

export function CommentCard({ comment }: { comment: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const body = comment.body ?? "";
  const readableBody = readableContentText(body, String(comment.bodyFormat ?? ""));
  const summary = readableContentSummary(body, String(comment.bodyFormat ?? ""), 320);
  return (
    <article className="overflow-hidden rounded-md border border-line bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-slate-50 px-4 py-3">
        <b className="text-sm text-slate-950">{String(comment.author ?? "Unknown author")}</b>
        <span className="text-xs font-semibold text-muted">{formatDisplayTime(comment.created)}</span>
        {comment.dateModeFallback ? <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">Updated unavailable · using Created</span> : null}
        {comment.edited ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Edited {formatDisplayTime(comment.updated)}</span> : null}
      </header>
      <div className="p-4">
        {expanded ? <JiraContent content={body} formatHint={String(comment.bodyFormat ?? "")} /> : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{summary || "Not available in source data"}</p>}
        {readableBody.length > summary.length ? <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700" type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}{expanded ? "收合全文" : "展開全文"}
        </button> : null}
      </div>
    </article>
  );
}
