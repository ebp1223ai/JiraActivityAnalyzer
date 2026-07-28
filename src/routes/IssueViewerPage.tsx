import { useEffect, useMemo, useState } from "react";
import { Database, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";

const tabs = ["Overview", "Description", "Changelog", "Comments", "Attachments Metadata", "Links", "Activity Events", "Snapshot / Raw Evidence"] as const;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "Unavailable") {
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function nested(source: Record<string, unknown>, ...keys: string[]) {
  let value: unknown = source;
  for (const key of keys) value = record(value)[key];
  return value;
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function jsonPreview(value: unknown) {
  const serialized = JSON.stringify(value, null, 2);
  return serialized.length > 24000 ? `${serialized.slice(0, 24000)}\n… Local evidence preview truncated in UI.` : serialized;
}

export function IssueViewerPage() {
  const { state } = useRuntimeStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get("key") ?? "");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<"initial" | "loading" | "ready" | "not-found" | "error">("initial");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");

  async function load(keyInput = input) {
    const key = keyInput.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(key)) {
      setStatus("error");
      setMessage("Issue Key 格式無效 / Invalid issue key");
      return;
    }
    setStatus("loading");
    setMessage("");
    try {
      const next = await window.desktopApp?.databaseViewer?.getIssue({ issueKey: key });
      setResult(next ?? null);
      setStatus(next?.found ? "ready" : "not-found");
      setSearchParams({ key });
      setInput(key);
    } catch (reason) {
      setStatus("error");
      setMessage(reason instanceof Error ? reason.message : String(reason));
    }
  }

  useEffect(() => {
    const key = searchParams.get("key");
    if (state.database.canRead && key) void load(key);
  }, [state.database.canRead, state.database.requestId]);

  const issue = record(result?.issue);
  const snapshot = record(issue.snapshot);
  const raw = record(result?.rawEvidence);
  const rawIssue = record(raw.issue);
  const fields = record(rawIssue.fields);
  const events = array(result?.events).map(record);
  const changelog = array(raw.changelog ?? raw.histories ?? nested(raw, "issue", "changelog", "histories")).map(record);
  const comments = array(raw.comments ?? nested(fields, "comment", "comments")).map(record);
  const attachments = array(raw.attachments ?? fields.attachment).map(record);
  const links = array(raw.issueLinks ?? fields.issuelinks).map(record);
  const overviewRows = useMemo(() => [
    ["Issue Key", text(issue.issueKey)],
    ["Summary", text(issue.summary)],
    ["Project", text(issue.projectKey)],
    ["Type", text(issue.issue_type)],
    ["Status", text(issue.status)],
    ["Priority", text(issue.priority)],
    ["Assignee", text(issue.assignee)],
    ["Reporter", text(issue.reporter)],
    ["Creator", text(issue.creator)],
    ["Labels", array(issue.labels).map(String).join(", ") || "Unavailable"],
    ["Start / Due Date", `${text(issue.start_date)} / ${text(issue.due_date)}`],
    ["Created", text(nested(snapshot, "fields", "created"))],
    ["Updated", text(issue.jira_updated_at)],
    ["Resolution", text(issue.resolution)],
    ["Snapshot Time", text(issue.snapshot_updated_at)],
    ["Save Outcome", text(issue.saveOutcome)],
    ["Fetch Result", "Success"],
    ["Coverage", Object.keys(record(issue.coverage)).length ? "Available" : "Unavailable"]
  ], [issue]);

  if (!state.database.canRead) {
    return <div><PageHeader title="Issue 檢視" subtitle="Issue Viewer" connected={false} /><SectionCard><div className="py-14 text-center"><Database className="mx-auto mb-4 text-slate-300" size={42} /><b>Local database unavailable</b><p className="mt-2 text-sm text-muted">{state.database.message}</p></div></SectionCard></div>;
  }

  return (
    <div className="min-w-0">
      <PageHeader title="Issue 檢視" subtitle="Issue Viewer" connected={false} />
      <SectionCard>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="mb-1 block text-xs font-black text-muted">Issue Key</span>
            <input className="field uppercase" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="PROJECT-123" />
          </label>
          <button className="btn btn-primary" type="button" disabled={status === "loading"} onClick={() => void load()}><Search size={16} />查詢本機資料庫 / Search Local DB</button>
        </div>
        <p className="mt-3 text-xs font-semibold text-muted">此頁只讀 Local SQLite，不會向 Jira 發送請求。Issue Key 會自動 trim 並轉成大寫。</p>
      </SectionCard>
      {status === "initial" ? <div className="mt-4 rounded-md border border-dashed border-slate-300 p-12 text-center font-bold text-muted">輸入 Issue Key 開始查詢 / Enter an issue key</div> : null}
      {status === "loading" ? <div className="mt-4 p-12 text-center font-bold text-muted">Loading...</div> : null}
      {status === "not-found" ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-8 text-center font-bold text-amber-800">本機資料庫找不到此 Issue / Issue not found in local database</div> : null}
      {status === "error" ? <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-4 font-bold text-rose-700">{message}</div> : null}
      {status === "ready" ? (
        <SectionCard className="mt-4" title={`${text(issue.issueKey)} · ${text(issue.summary)}`} subtitle={`Snapshot ${text(issue.snapshot_updated_at)}`}>
          <div className="thin-scroll mb-4 flex overflow-x-auto border-b border-line">
            {tabs.map((item) => <button key={item} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-black ${tab === item ? "border-blue-600 text-blue-700" : "border-transparent text-muted"}`} type="button" onClick={() => setTab(item)}>{item}</button>)}
          </div>
          {tab === "Overview" ? <DataTable headers={["Field", "Value"]} rows={overviewRows} /> : null}
          {tab === "Description" ? <div className="whitespace-pre-wrap break-words rounded-md bg-slate-50 p-4 text-sm leading-relaxed">{text(fields.description, "No description stored.")}</div> : null}
          {tab === "Changelog" ? <DataTable headers={["Time", "Author", "Items"]} rows={changelog.map((item) => [text(item.created), text(nested(item, "author", "displayName")), jsonPreview(item.items ?? item)])} /> : null}
          {tab === "Comments" ? <DataTable headers={["Created", "Author", "Body"]} rows={comments.map((item) => [text(item.created), text(nested(item, "author", "displayName")), text(item.body)])} /> : null}
          {tab === "Attachments Metadata" ? <DataTable headers={["Filename", "Size", "Mime Type", "Created", "Author"]} rows={attachments.map((item) => [text(item.filename), text(item.size), text(item.mimeType), text(item.created), text(nested(item, "author", "displayName"))])} /> : null}
          {tab === "Links" ? <pre className="thin-scroll max-h-[520px] overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">{jsonPreview(links)}</pre> : null}
          {tab === "Activity Events" ? <DataTable headers={["Time", "Type", "Actor ID", "Actor", "Field", "From", "To"]} rows={events.map((item) => [text(item.eventTime), text(item.eventType), text(item.actorAccountId), text(item.actorDisplayName), text(item.fieldName), text(item.fromValueJson), text(item.toValueJson)])} /> : null}
          {tab === "Snapshot / Raw Evidence" ? <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2"><div><h3 className="mb-2 font-black">Snapshot</h3><pre className="thin-scroll max-h-[560px] overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">{jsonPreview(snapshot)}</pre></div><div><h3 className="mb-2 font-black">Raw Evidence Summary</h3><pre className="thin-scroll max-h-[560px] overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">{jsonPreview(raw)}</pre></div></div> : null}
        </SectionCard>
      ) : null}
    </div>
  );
}
