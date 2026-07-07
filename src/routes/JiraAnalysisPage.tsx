import { useState } from "react";
import type { ReactNode } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { metricIcons } from "../data/mockData";
import { useConnectionContext } from "../state/ConnectionContext";
import type { AppOutletContext } from "../components/AppLayout";

type JiraAnalysisResult = {
  ok: boolean;
  message?: string;
  logs?: string[];
  issue?: Record<string, string | number>;
  summary?: Record<string, string | number>;
  lifecycle?: ReactNode[][];
  participants?: ReactNode[][];
  transitions?: ReactNode[][];
  fields?: ReactNode[][];
  comments?: ReactNode[][];
  attachments?: ReactNode[][];
  links?: ReactNode[][];
  risks?: string[];
  timeline?: ReactNode[][];
};

export function JiraAnalysisPage() {
  const { Activity, Clock, GitBranch, MessageSquare, Paperclip, Users } = metricIcons;
  const { activeConnection } = useConnectionContext();
  const { appendDebugLog } = useOutletContext<AppOutletContext>();
  const [issueKey, setIssueKey] = useState("COPGEN1-138930");
  const [result, setResult] = useState<JiraAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLoad() {
    setError("");
    if (!activeConnection) {
      setError("Please configure an active Jira connection first.");
      return;
    }
    if (activeConnection.status !== "connected") {
      setError("Active connection is not verified. Please test connection first.");
      return;
    }
    setLoading(true);
    try {
      const response = await window.desktopApp?.jiraAnalysis?.load?.({ connection: activeConnection, issueKey }) as JiraAnalysisResult | undefined;
      if (!response) throw new Error("Jira Analysis IPC is not available.");
      setResult(response);
      appendDebugLog("jira", response.logs ?? []);
      if (!response.ok) setError(response.message ?? "Jira Analysis failed.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Jira Analysis failed.";
      setError(message);
      appendDebugLog("jira", [`[ERROR] ${message}`, "[INFO] No database write performed"]);
    } finally {
      setLoading(false);
    }
  }

  function openInJira() {
    if (!activeConnection || !issueKey) return;
    window.open(`${activeConnection.baseUrl.replace(/\/+$/, "")}/browse/${encodeURIComponent(issueKey)}`, "_blank");
  }

  const issue = result?.issue ?? {};
  const summary = result?.summary ?? {};

  return (
    <div className="min-w-0">
      <PageHeader title="Jira 分析" subtitle="Jira Analysis" />

      <SectionCard className="mb-4" title="Active Connection" subtitle="read-only Jira source">
        {activeConnection ? (
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3 text-sm font-semibold">
            {[
              ["Connection", activeConnection.name],
              ["Base URL", activeConnection.baseUrl],
              ["Auth Type", activeConnection.authType === "bearer" ? "Bearer Token / PAT" : "Basic Auth"],
              ["API Version", activeConnection.apiVersion],
              ["Token Source", activeConnection.tokenSource],
              ["Status", activeConnection.status],
              ["Last Tested", activeConnection.lastTestedAt || "-"]
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-lg border border-line bg-slate-50 p-3">
                <div className="text-xs font-black uppercase text-muted">{label}</div>
                <div className="mt-1 break-words font-black text-ink" data-no-clip="true">{value}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            Please configure an active Jira connection first. Go to Connections.
          </div>
        )}
      </SectionCard>

      <div className="mb-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_110px] xl:grid-cols-[minmax(0,1fr)_110px_170px_150px]">
        <input className="field" value={issueKey} onChange={(event) => setIssueKey(event.target.value)} />
        <button className="btn btn-primary" onClick={handleLoad} disabled={loading}><Search size={16} />{loading ? "Loading" : "Load"}</button>
        <button className="btn" onClick={handleLoad} disabled={loading}><RefreshCw size={16} />Refresh from Jira</button>
        <button className="btn" onClick={openInJira} disabled={!activeConnection}><ExternalLink size={16} />Open in Jira</button>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}

      <SectionCard title="Issue Summary" subtitle="real read-only Jira data">
        {result?.ok ? (
          <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <div className="text-sm font-bold text-muted">Issue Key / Jira 編號</div>
              <div className="break-words text-2xl font-black" data-no-clip="true">{issue.key}</div>
              <p className="mt-3 max-w-xl break-words font-semibold">{issue.summary}</p>
              <div className="mt-4 flex flex-wrap gap-3"><StatusBadge>{String(issue.status)}</StatusBadge><StatusBadge tone="red">{String(issue.priority)}</StatusBadge></div>
            </div>
            <div className="space-y-3 text-sm font-semibold"><div><b>Assignee</b><br />{issue.assignee}</div><div><b>Creator</b><br />{issue.creator}</div><div><b>Reporter</b><br />{issue.reporter}</div></div>
            <div className="space-y-3 text-sm font-semibold"><div><b>Created</b><br />{issue.created}</div><div><b>Updated</b><br />{issue.updated}</div><div><b>Labels</b><br />{issue.labels}</div><div><b>Linked Issues</b><br />{issue.linkedIssuesCount}</div></div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-line p-6 text-sm font-semibold text-muted">Load an issue to show read-only Jira analysis.</div>
        )}
      </SectionCard>

      {result?.ok ? (
        <>
          <ResponsiveMetricGrid min={210} className="mt-3">
            <MetricCard label="Total Events" sub="events" value={String(summary.totalEvents)} icon={Activity} />
            <MetricCard label="Participants" sub="users" value={String(summary.participants)} icon={Users} />
            <MetricCard label="Comments" sub="comments" value={String(summary.comments)} icon={MessageSquare} />
            <MetricCard label="Attachments" sub="metadata" value={String(summary.attachments)} icon={Paperclip} />
            <MetricCard label="Status Changes" sub="status" value={String(summary.statusChanges)} icon={GitBranch} />
            <MetricCard label="Lead Time" sub="duration" value={String(summary.leadTime)} icon={Clock} />
          </ResponsiveMetricGrid>

          <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            <SectionCard title="Lifecycle Analysis" subtitle="lifecycle"><DataTable headers={["Stage", "Time", "Duration"]} rows={result.lifecycle ?? []} /></SectionCard>
            <SectionCard title="Participants Contribution" subtitle="participants"><DataTable headers={["Participant", "Events", "Changelog", "Comments", "Attachments", "Status", "First", "Last"]} rows={result.participants ?? []} /></SectionCard>
            <SectionCard title="Status Transition Analysis" subtitle="status transitions"><DataTable headers={["From", "To", "Count", "First", "Last", "Actors"]} rows={result.transitions ?? []} /></SectionCard>
            <SectionCard title="Field Change Hotspots" subtitle="fields"><DataTable headers={["Field", "Change Count", "Percent", "Actors", "Last Changed"]} rows={result.fields ?? []} /></SectionCard>
            <SectionCard title="Comment Summary" subtitle="comments"><DataTable headers={["Metric", "Value"]} rows={result.comments ?? []} /></SectionCard>
            <SectionCard title="Attachment Summary" subtitle="metadata only"><DataTable headers={["File", "By", "MIME Type", "Size", "Created"]} rows={result.attachments ?? []} /></SectionCard>
            <SectionCard title="Linked Issues Analysis" subtitle="linked issues"><DataTable headers={["Link ID", "Type", "Direction", "Issue Key", "Summary", "Status", "Issue Type"]} rows={result.links ?? []} /></SectionCard>
            <SectionCard title="Risk & Anomaly Hints" subtitle="rules"><div className="space-y-2 text-sm font-semibold">{(result.risks ?? []).map((risk) => <div key={risk} className="rounded-lg border border-line bg-slate-50 p-3">{risk}</div>)}</div></SectionCard>
            <SectionCard title="Activity Timeline" subtitle="oldest to newest"><DataTable headers={["Time", "Actor", "Event", "Details"]} rows={result.timeline ?? []} /></SectionCard>
          </div>
        </>
      ) : null}
    </div>
  );
}
