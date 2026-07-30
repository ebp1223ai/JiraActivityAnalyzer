import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Database, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { DiffCell } from "../components/DiffCell";
import { JiraContent } from "../components/JiraContent";
import { BeforeAfterDiff } from "../components/BeforeAfterDiff";
import { CommentCard } from "../components/CommentCard";
import { ReadableContentCell } from "../components/ReadableContentCell";
import { SectionErrorBoundary } from "../components/SectionErrorBoundary";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { SqliteDataTable, type SqliteTableColumn } from "../components/SqliteDataTable";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import { useSessionState } from "../state/SessionStateContext";
import type { ViewerSection } from "../types/databaseViewer";
import type { UiPreferences } from "../types/uiPreferences";
import { activityEventAfter, activityEventBefore, formatActivityActor, formatActivityEventType, formatActivityEventValue, formatActivitySource } from "../utils/activityEventDisplay";
import { formatDisplayTime } from "../utils/displayTime";
import { queryFromTablePreferences } from "../utils/preferenceQuery";
import { recordTableRequest } from "../diagnostics/tableDiagnostics";

const tabs = ["Overview", "Description", "Changelog", "Comments", "Attachments Metadata", "Issue Links", "Remote Links", "Activity Events", "Raw Evidence"] as const;

const activityEventColumns: SqliteTableColumn[] = [
  { id: "eventTime", label: "Time", kind: "date", required: true, width: 170, minWidth: 150, maxWidth: 240, render: (row) => <span className="whitespace-nowrap">{formatDisplayTime(row.eventTime)}</span> },
  { id: "displayName", queryField: "actor", label: "Actor", kind: "multi", width: 180, render: (row) => formatActivityActor(row) },
  { id: "eventType", queryField: "action", label: "Action", kind: "multi", required: true, width: 140, render: (row) => formatActivityEventType(row.eventType) },
  { id: "fieldName", queryField: "field", label: "Field", kind: "multi", width: 180, render: (row) => formatActivityEventValue(row.fieldName, "Not applicable") },
  { id: "before", label: "Before", kind: "text", width: 320, render: (row) => <ReadableContentCell value={activityEventBefore(row)} missing="No previous value" /> },
  { id: "after", label: "After", kind: "text", width: 320, render: (row) => <ReadableContentCell value={row.commentBody ?? activityEventAfter(row)} formatHint={String(row.commentBodyFormat ?? "")} /> },
  { id: "diff", label: "Diff", kind: "text", width: 400, render: (row) => <DiffCell row={row} /> },
  { id: "sourceProvenance", queryField: "source", label: "Source", kind: "multi", width: 140, render: (row) => formatActivitySource(row.sourceProvenance) }
];

function text(value: unknown, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function sectionState(section: ViewerSection<Record<string, unknown>>, label: string) {
  if (section.status === "ready") return null;
  const danger = section.status === "error" || section.status === "unavailable";
  return <div className={`rounded-md border p-6 text-center text-sm font-bold ${danger ? "border-rose-300 bg-rose-50 text-rose-800" : section.status === "not_collected" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-300 bg-slate-50 text-muted"}`} data-section-status={section.status}>
    {section.message || `${label}: No records`}
  </div>;
}

export function IssueViewerPage() {
  const { state } = useRuntimeStatus();
  const { issueViewer, setIssueViewer } = useSessionState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [preferences, setPreferences] = useState<UiPreferences | null>(null);
  const [payloadFilter, setPayloadFilter] = useState("");
  const [payloadPage, setPayloadPage] = useState(1);
  const loadRequest = useRef(0);
  const result = issueViewer.result;
  const overview = result?.overview ?? {};

  function patch(patchValue: Partial<typeof issueViewer>) {
    setIssueViewer((current) => ({ ...current, ...patchValue }));
  }

  async function load(keyInput = issueViewer.issueKey) {
    const issueKey = keyInput.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)) {
      patch({ issueKey, status: "error", message: "Issue Key 格式無效 / Invalid issue key" });
      return;
    }
    const requestId = ++loadRequest.current;
    const startedAt = performance.now();
    const query = { issueKey: "[masked-key]" };
    recordTableRequest("started", { requestId, tableId: "issueViewerSnapshot", query, startedAt });
    patch({ issueKey, status: "loading", message: "" });
    try {
      const next = await window.desktopApp?.databaseViewer?.getIssue({ issueKey });
      if (requestId !== loadRequest.current) {
        recordTableRequest("stale", { requestId, tableId: "issueViewerSnapshot", query, startedAt });
        return;
      }
      if (!next) {
        recordTableRequest("failed", { requestId, tableId: "issueViewerSnapshot", query, startedAt, error: "IPC unavailable" });
        patch({ status: "error", message: "Issue Viewer IPC unavailable." });
        return;
      }
      recordTableRequest("completed", { requestId, tableId: "issueViewerSnapshot", query, startedAt, resultCount: next.status === "ready" ? 1 : 0 });
      patch({
        result: next,
        status: next.status === "ready" ? "ready" : next.status === "not_found" ? "not-found" : next.status === "query_failed" ? "error" : "unavailable",
        message: next.message
      });
      setSearchParams({ key: issueKey });
    } catch (error) {
      recordTableRequest("failed", { requestId, tableId: "issueViewerSnapshot", query, startedAt, error });
      if (requestId === loadRequest.current) patch({ status: "error", message: error instanceof Error ? error.message : "Issue Viewer query failed." });
    }
  }

  useEffect(() => {
    const routeKey = searchParams.get("key")?.trim().toUpperCase();
    loadRequest.current += 1;
    patch({ result: null, status: "initial", activityEventsResult: null, activityEventsStatus: "idle" });
    if (state.database.canRead && routeKey) void load(routeKey);
  }, [state.database.canRead, state.database.requestId]);

  useEffect(() => {
    void window.desktopApp?.uiPreferences?.get().then((response) => {
      if (!response) return;
      setPreferences(response.preferences);
      patch({ activityEventsQuery: queryFromTablePreferences(issueViewer.activityEventsQuery, response.preferences.issueActivityEvents) });
    });
  }, []);

  useEffect(() => {
    if (issueViewer.activeTab !== "Activity Events" || issueViewer.status !== "ready" || !issueViewer.issueKey) return;
    let current = true;
    let settled = false;
    const requestId = ++loadRequest.current;
    const startedAt = performance.now();
    const query = issueViewer.activityEventsQuery;
    recordTableRequest("started", { requestId, tableId: "issueActivityEvents", query, startedAt });
    patch({ activityEventsStatus: "loading", activityEventsMessage: "" });
    void window.desktopApp?.databaseViewer?.issueEvents({ issueKey: issueViewer.issueKey, query }).then((next) => {
      settled = true;
      if (!current || requestId !== loadRequest.current) {
        recordTableRequest("stale", { requestId, tableId: "issueActivityEvents", query, startedAt });
        return;
      }
      if (!next) {
        recordTableRequest("failed", { requestId, tableId: "issueActivityEvents", query, startedAt, error: "IPC unavailable" });
        patch({ activityEventsStatus: "error", activityEventsMessage: "Issue Activity Events IPC unavailable." });
        return;
      }
      recordTableRequest("completed", { requestId, tableId: "issueActivityEvents", query, startedAt, resultCount: next.rows.length });
      patch({ activityEventsResult: next, activityEventsStatus: "ready", activityEventsMessage: "" });
    }).catch((error: unknown) => {
      settled = true;
      recordTableRequest("failed", { requestId, tableId: "issueActivityEvents", query, startedAt, error });
      if (current && requestId === loadRequest.current) patch({
        activityEventsStatus: "error",
        activityEventsMessage: error instanceof Error ? error.message : "Issue Activity Events query failed."
      });
    });
    return () => {
      current = false;
      if (!settled) recordTableRequest("aborted", { requestId, tableId: "issueActivityEvents", query, startedAt });
    };
  }, [issueViewer.activeTab, issueViewer.status, issueViewer.issueKey, issueViewer.activityEventsQuery, state.database.requestId]);

  const overviewRows = useMemo(() => [
    ["Issue Key", text(overview.issueKey)],
    ["Summary", text(overview.summary)],
    ["Project", text(overview.projectKey)],
    ["Type", text(overview.issue_type)],
    ["Status", text(overview.status)],
    ["Priority", text(overview.priority)],
    ["Assignee", text(overview.assignee)],
    ["Reporter", text(overview.reporter)],
    ["Creator", text(overview.creator)],
    ["Labels", array(overview.labels).map(String).join(", ") || "Unavailable"],
    ["Start / Due Date", `${text(overview.start_date)} / ${text(overview.due_date)}`],
    ["Updated", formatDisplayTime(overview.jira_updated_at)],
    ["Resolution", text(overview.resolution)],
    ["Snapshot Time", formatDisplayTime(overview.snapshot_updated_at)],
    ["Save Outcome", text(overview.saveOutcome)],
    ["Fetch Result", result?.status === "ready" ? "Success" : text(result?.status)],
    ["Coverage Status", Object.keys((overview.coverage ?? {}) as object).length ? "Available" : "Unavailable"]
  ], [overview, result?.status]);

  if (!state.database.canRead) {
    return <div><PageHeader title="Issue 檢視" subtitle="Issue Viewer" connected={false} /><SectionCard><div className="py-14 text-center"><Database className="mx-auto mb-4 text-slate-300" size={42} /><b>Local database unavailable</b><p className="mt-2 text-sm text-muted">{state.database.message}</p></div></SectionCard></div>;
  }

  const section = result && issueViewer.activeTab === "Changelog" ? result.changelog
    : result && issueViewer.activeTab === "Comments" ? result.comments
      : result && issueViewer.activeTab === "Attachments Metadata" ? result.attachments
        : result && issueViewer.activeTab === "Issue Links" ? result.issueLinks
          : result && issueViewer.activeTab === "Remote Links" ? result.remoteLinks
            : null;

  const payloadRecords = section?.status === "ready" ? section.records : [];
  const normalizedPayloadFilter = payloadFilter.trim().toLowerCase();
  const filteredPayloadRecords = normalizedPayloadFilter
    ? payloadRecords.filter((item) => JSON.stringify(item).toLowerCase().includes(normalizedPayloadFilter))
    : payloadRecords;
  const payloadPageCount = Math.max(1, Math.ceil(filteredPayloadRecords.length / 50));
  const visiblePayloadRecords = filteredPayloadRecords.slice((Math.min(payloadPage, payloadPageCount) - 1) * 50, Math.min(payloadPage, payloadPageCount) * 50);
  return (
    <div className="min-w-0">
      <PageHeader title="Issue 檢視" subtitle="Issue Viewer · Local Database Only" connected={false} />
      <SectionCard>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="mb-1 block text-xs font-black text-muted">Issue Key</span>
            <input className="field uppercase" value={issueViewer.issueKey} onChange={(event) => patch({ issueKey: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="PROJECT-123" />
          </label>
          <button className="btn btn-primary" type="button" disabled={issueViewer.status === "loading"} onClick={() => void load()}><Search size={16} />查詢本機資料庫 / Search Local DB</button>
        </div>
        <p className="mt-3 text-xs font-semibold text-muted">只讀 Local SQLite。此 Viewer 不會呼叫 Jira API，也不會修改資料庫。</p>
      </SectionCard>
      {issueViewer.status === "initial" ? <div className="mt-4 rounded-md border border-dashed border-slate-300 p-12 text-center font-bold text-muted">輸入 Issue Key 開始查詢 / Enter an issue key</div> : null}
      {issueViewer.status === "loading" ? <div className="mt-4 p-12 text-center font-bold text-muted">Loading...</div> : null}
      {issueViewer.status === "not-found" ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-8 text-center font-bold text-amber-800">{issueViewer.message}</div> : null}
      {["error", "unavailable"].includes(issueViewer.status) ? <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-5 font-bold text-rose-800"><AlertTriangle className="mr-2 inline" size={18} />{issueViewer.message}</div> : null}
      {issueViewer.status === "ready" && result ? (
        <SectionCard className="mt-4" title={`${result.issueKey} · ${text(overview.summary)}`} subtitle={`Snapshot ${text(overview.snapshot_updated_at)}`}>
          <div className="thin-scroll mb-4 flex overflow-x-auto border-b border-line" role="tablist" aria-label="Issue Viewer sections">
            {tabs.map((item) => <button key={item} role="tab" aria-selected={issueViewer.activeTab === item} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-black ${issueViewer.activeTab === item ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-muted"}`} type="button" onClick={() => patch({ activeTab: item })}>{item}</button>)}
          </div>
          <SectionErrorBoundary context={`issue-viewer:${issueViewer.activeTab}`} resetKey={`${state.database.requestId}:${result.issueKey}:${issueViewer.activeTab}`} safeText={result.description.plainText}>
          <div role="tabpanel" aria-label={issueViewer.activeTab}>
            {issueViewer.activeTab === "Overview" ? <DataTable headers={["Field", "Value"]} rows={overviewRows} /> : null}
            {issueViewer.activeTab === "Description" ? result.description.status === "ready"
              ? <JiraContent className="rounded-md bg-slate-50 p-4" content={result.description.content || result.description.plainText} format={result.description.format} />
              : <div className="rounded-md border border-slate-300 bg-slate-50 p-6 text-center font-bold text-muted">{result.description.message}</div> : null}
            {section ? sectionState(section, issueViewer.activeTab) : null}
            {section?.status === "ready" && ["Changelog", "Comments"].includes(issueViewer.activeTab) ? <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-md border border-line bg-slate-50 p-3"><label className="min-w-[240px] flex-1"><span className="mb-1 block text-xs font-black text-muted">Filter current payload section</span><input className="field" value={payloadFilter} onChange={(event) => { setPayloadFilter(event.target.value); setPayloadPage(1); }} placeholder="Author, field, value, or comment text" /></label><div className="text-xs font-bold text-muted">Filtered {filteredPayloadRecords.length.toLocaleString()} / Total {payloadRecords.length.toLocaleString()} / 50 per page</div></div> : null}            {section?.status === "ready" && issueViewer.activeTab === "Changelog" ? <DataTable headers={["Time", "Actor", "Field", "Before / After", "Source"]} rows={visiblePayloadRecords.map((item) => [formatDisplayTime(item.created), text(item.author), text(item.field), <BeforeAfterDiff before={item.before} after={item.after} />, "jira payload"])} /> : null}
            {section?.status === "ready" && issueViewer.activeTab === "Comments" ? <div className="space-y-3">{visiblePayloadRecords.map((item) => <CommentCard key={text(item.id)} comment={item} />)}</div> : null}
            {section?.status === "ready" && ["Changelog", "Comments"].includes(issueViewer.activeTab) && payloadPageCount > 1 ? <div className="my-3 flex items-center justify-end gap-2"><button className="btn" type="button" disabled={payloadPage <= 1} onClick={() => setPayloadPage((page) => Math.max(1, page - 1))}>Previous</button><span className="text-xs font-bold">Page {Math.min(payloadPage, payloadPageCount)} / {payloadPageCount}</span><button className="btn" type="button" disabled={payloadPage >= payloadPageCount} onClick={() => setPayloadPage((page) => Math.min(payloadPageCount, page + 1))}>Next</button></div> : null}            {section?.status === "ready" && issueViewer.activeTab === "Attachments Metadata" ? <DataTable headers={["Filename", "Size", "Mime Type", "Created", "Author"]} rows={section.records.map((item) => [text(item.filename), text(item.size), text(item.mimeType), text(item.created), text((item.author as Record<string, unknown> | undefined)?.displayName)])} /> : null}
            {section?.status === "ready" && ["Issue Links", "Remote Links"].includes(issueViewer.activeTab) ? <DataTable headers={["Type", "Direction / Object", "Issue / URL"]} rows={section.records.map((item) => [text((item.type as Record<string, unknown> | undefined)?.name ?? item.relationship), text(item.inwardIssue ? "Inward" : item.outwardIssue ? "Outward" : item.title), text((item.inwardIssue as Record<string, unknown> | undefined)?.key ?? (item.outwardIssue as Record<string, unknown> | undefined)?.key ?? item.url)])} /> : null}
            {issueViewer.activeTab === "Activity Events" ? <div className="space-y-3"><div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">All local SQLite activity events for this Issue Key. No Jira request is sent.</div><SqliteDataTable tableId="issueActivityEvents" columns={activityEventColumns} result={issueViewer.activityEventsResult ?? { rows: [], filteredCount: 0, totalCount: 0, page: 1, pageSize: 50, pageCount: 1 }} query={issueViewer.activityEventsQuery} loading={issueViewer.activityEventsStatus === "loading"} error={issueViewer.activityEventsMessage} preferences={preferences?.issueActivityEvents} onPreferencesChange={(value) => void window.desktopApp?.uiPreferences?.update({ section: "issueActivityEvents", value }).then((response) => { if (response) setPreferences(response.preferences); })} onQueryChange={(activityEventsQuery) => patch({ activityEventsQuery })} loadDistinct={async (field, search) => (await window.desktopApp?.databaseViewer?.distinctValues({ source: "issueEvents", subjectId: issueViewer.issueKey, field, search, limit: 100 })) ?? { field, values: [], truncated: false }} /></div> : null}
            {issueViewer.activeTab === "Raw Evidence" ? <div><div className="mb-3 text-xs font-bold text-muted">Schema: {result.rawEvidence.schemaVersion} · Payload Format: {text(result.rawEvidence.payloadFormatVersion)} · Saved: {text(result.rawEvidence.payloadSavedAt)}</div><pre className="thin-scroll max-h-[560px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-950 p-4 text-xs text-slate-100">{result.rawEvidence.preview}</pre>{result.rawEvidence.message ? <p className="mt-2 text-xs font-bold text-amber-700">{result.rawEvidence.message}</p> : null}</div> : null}
          </div>
          </SectionErrorBoundary>
        </SectionCard>
      ) : null}
    </div>
  );
}
