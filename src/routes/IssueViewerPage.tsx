import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { JiraContent } from "../components/JiraContent";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { SqliteDataTable, type SqliteTableColumn } from "../components/SqliteDataTable";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import { useSessionState } from "../state/SessionStateContext";
import type { ViewerSection } from "../types/databaseViewer";
import type { UiPreferences } from "../types/uiPreferences";

const tabs = ["Overview", "Description", "Changelog", "Comments", "Attachments Metadata", "Issue Links", "Remote Links", "Activity Stream", "Activity Events", "Raw Evidence"] as const;

const activityStreamColumns: SqliteTableColumn[] = [
  { id: "eventTime", label: "Time / 時間", kind: "date", width: 176 },
  { id: "displayName", label: "User / 使用者", kind: "text", width: 150 },
  { id: "eventType", label: "Activity Type / 活動類型", kind: "multi", width: 170 },
  { id: "fieldName", label: "Field / 欄位", kind: "multi", width: 140 },
  { id: "before", label: "Before / 變更前", kind: "text", width: 200 },
  { id: "after", label: "After / 變更後", kind: "text", width: 200 },
  { id: "summary", label: "Title / Summary", kind: "text", width: 240 },
  { id: "sourceProvenance", label: "Source / 來源", kind: "multi", width: 180 }
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
    patch({ issueKey, status: "loading", message: "" });
    const next = await window.desktopApp?.databaseViewer?.getIssue({ issueKey });
    if (!next) {
      patch({ status: "error", message: "Issue Viewer IPC unavailable." });
      return;
    }
    patch({
      result: next,
      status: next.status === "ready" ? "ready" : next.status === "not_found" ? "not-found" : next.status === "query_failed" ? "error" : "unavailable",
      message: next.message
    });
    setSearchParams({ key: issueKey });
  }

  useEffect(() => {
    const routeKey = searchParams.get("key")?.trim().toUpperCase();
    if (state.database.canRead && routeKey && routeKey !== issueViewer.issueKey) void load(routeKey);
  }, [state.database.canRead, state.database.requestId]);

  useEffect(() => {
    void window.desktopApp?.uiPreferences?.get().then((response) => {
      if (response) setPreferences(response.preferences);
    });
  }, []);

  useEffect(() => {
    if (issueViewer.activeTab !== "Activity Stream" || issueViewer.status !== "ready" || !issueViewer.issueKey) return;
    let current = true;
    patch({ activityStreamStatus: "loading", activityStreamMessage: "" });
    void window.desktopApp?.databaseViewer?.issueActivityStream({
      issueKey: issueViewer.issueKey,
      query: issueViewer.activityStreamQuery
    }).then((next) => {
      if (!current) return;
      if (!next) {
        patch({ activityStreamStatus: "error", activityStreamMessage: "Issue Activity Stream IPC unavailable." });
        return;
      }
      patch({ activityStreamResult: next, activityStreamStatus: "ready", activityStreamMessage: "" });
    }).catch((error: unknown) => {
      if (current) patch({
        activityStreamStatus: "error",
        activityStreamMessage: error instanceof Error ? error.message : "Issue Activity Stream query failed."
      });
    });
    return () => { current = false; };
  }, [issueViewer.activeTab, issueViewer.status, issueViewer.issueKey, issueViewer.activityStreamQuery, state.database.requestId]);

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
    ["Updated", text(overview.jira_updated_at)],
    ["Resolution", text(overview.resolution)],
    ["Snapshot Time", text(overview.snapshot_updated_at)],
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
            : result && issueViewer.activeTab === "Activity Events" ? result.activityEvents : null;

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
          <div role="tabpanel" aria-label={issueViewer.activeTab}>
            {issueViewer.activeTab === "Overview" ? <DataTable headers={["Field", "Value"]} rows={overviewRows} /> : null}
            {issueViewer.activeTab === "Description" ? result.description.status === "ready"
              ? <JiraContent className="rounded-md bg-slate-50 p-4" content={result.description.content || result.description.plainText} format={result.description.format} />
              : <div className="rounded-md border border-slate-300 bg-slate-50 p-6 text-center font-bold text-muted">{result.description.message}</div> : null}
            {issueViewer.activeTab === "Activity Stream" ? (
              <div className="space-y-3">
                <div className={`rounded-md border p-3 text-sm font-semibold ${
                  issueViewer.activityStreamResult?.sourceStatus === "source_unidentifiable"
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-blue-200 bg-blue-50 text-blue-900"
                }`}>
                  {issueViewer.activityStreamResult?.sourceStatus === "source_unidentifiable"
                    ? "無法從本機資料辨識可靠的 Jira Activity Stream 來源。其他 activity events 不會被誤列為 Activity Stream。"
                    : "此分頁只讀取本機 SQLite 中具有可靠 Activity Stream provenance 的紀錄，不會呼叫 Jira API。"}
                </div>
                {issueViewer.activityStreamResult ? <SqliteDataTable
                  columns={activityStreamColumns}
                  result={issueViewer.activityStreamResult}
                  query={issueViewer.activityStreamQuery}
                  loading={issueViewer.activityStreamStatus === "loading"}
                  error={issueViewer.activityStreamMessage}
                  preferences={preferences?.issueActivityStream}
                  onPreferencesChange={(value) => void window.desktopApp?.uiPreferences?.update({
                    section: "issueActivityStream",
                    value
                  }).then((response) => {
                    if (response) setPreferences(response.preferences);
                  })}
                  onQueryChange={(activityStreamQuery) => patch({ activityStreamQuery })}
                  loadDistinct={async (field, search) => {
                    const response = await window.desktopApp?.databaseViewer?.distinctValues({
                      source: "issueActivityStream",
                      subjectId: issueViewer.issueKey,
                      field,
                      search,
                      limit: 100
                    });
                    return response ?? { field, values: [], truncated: false };
                  }}
                /> : <div className="p-10 text-center font-bold text-muted">Loading local Activity Stream...</div>}
              </div>
            ) : null}
            {section ? sectionState(section, issueViewer.activeTab) : null}
            {section?.status === "ready" && issueViewer.activeTab === "Changelog" ? <DataTable headers={["Created", "Author", "Field", "Before", "After", "Change"]} rows={section.records.map((item) => [text(item.created), text(item.author), text(item.field), <span className="block max-w-[260px] break-words text-rose-700">{text(item.before, "—")}</span>, <span className="block max-w-[260px] break-words text-emerald-700">{text(item.after, "—")}</span>, text(item.changeKind)])} /> : null}
            {section?.status === "ready" && issueViewer.activeTab === "Comments" ? <div className="space-y-3">{section.records.map((item) => <article key={text(item.id)} className="rounded-md border border-line bg-white p-4"><header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><b>{text(item.author)}</b><span className="text-muted">{text(item.created)}</span>{item.edited ? <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800">Edited · {text(item.updated)}</span> : null}</header><JiraContent content={text(item.body, "")} format={(item.bodyFormat === "html" || item.bodyFormat === "wiki") ? item.bodyFormat : "plain"} /></article>)}</div> : null}
            {section?.status === "ready" && issueViewer.activeTab === "Attachments Metadata" ? <DataTable headers={["Filename", "Size", "Mime Type", "Created", "Author"]} rows={section.records.map((item) => [text(item.filename), text(item.size), text(item.mimeType), text(item.created), text((item.author as Record<string, unknown> | undefined)?.displayName)])} /> : null}
            {section?.status === "ready" && ["Issue Links", "Remote Links"].includes(issueViewer.activeTab) ? <DataTable headers={["Type", "Direction / Object", "Issue / URL"]} rows={section.records.map((item) => [text((item.type as Record<string, unknown> | undefined)?.name ?? item.relationship), text(item.inwardIssue ? "Inward" : item.outwardIssue ? "Outward" : item.title), text((item.inwardIssue as Record<string, unknown> | undefined)?.key ?? (item.outwardIssue as Record<string, unknown> | undefined)?.key ?? item.url)])} /> : null}
            {section?.status === "ready" && issueViewer.activeTab === "Activity Events" ? <DataTable headers={["Time", "Type", "Actor ID", "Actor", "Field", "From", "To"]} rows={section.records.map((item) => [text(item.eventTime), text(item.eventType), text(item.actorAccountId), text(item.actorDisplayName), text(item.fieldName), text(item.fromValueJson), text(item.toValueJson)])} /> : null}
            {issueViewer.activeTab === "Raw Evidence" ? <div><div className="mb-3 text-xs font-bold text-muted">Schema: {result.rawEvidence.schemaVersion} · Payload Format: {text(result.rawEvidence.payloadFormatVersion)} · Saved: {text(result.rawEvidence.payloadSavedAt)}</div><pre className="thin-scroll max-h-[560px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-950 p-4 text-xs text-slate-100">{result.rawEvidence.preview}</pre>{result.rawEvidence.message ? <p className="mt-2 text-xs font-bold text-amber-700">{result.rawEvidence.message}</p> : null}</div> : null}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
