import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Activity, ClipboardCopy, Eraser, FileJson, Play, ShieldCheck } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { FieldLabel, Toggle } from "../components/FormControls";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { runJiraProbe } from "../services/jiraProbeService";
import type { JiraProbeApiVersion, JiraProbeAuthType, JiraProbeDepth, JiraProbeResult, JiraProbeRunState, JiraProbeStatus } from "../types/jiraProbe";
import type { AppOutletContext } from "../components/AppLayout";

const defaultConnection = {
  name: "Jira Cloud (Production)",
  baseUrl: "https://example.atlassian.net",
  email: "alpha.platform@example.com"
};

const statusTone: Record<JiraProbeStatus, "green" | "blue" | "amber" | "red" | "gray"> = {
  success: "green",
  partial: "amber",
  forbidden: "red",
  failed: "red",
  skipped: "gray"
};

const depthNotes: Record<JiraProbeDepth, string> = {
  basic: "Issue basic fields",
  standard: "Issue + changelog + comments + attachments metadata + links",
  deep: "Standard + worklog + transitions + field metadata + linked issue summary"
};

type PreviewTab = "issueFields" | "changelog" | "comments" | "attachments" | "links" | "rawJson";

export function JiraProbePage() {
  const [baseUrl, setBaseUrl] = useState(defaultConnection.baseUrl);
  const [email, setEmail] = useState(defaultConnection.email);
  const [issueKey, setIssueKey] = useState("COPGEN1-126606");
  const [apiToken, setApiToken] = useState("");
  const [depth, setDepth] = useState<JiraProbeDepth>("standard");
  const [apiVersion, setApiVersion] = useState<JiraProbeApiVersion>("auto");
  const [authType, setAuthType] = useState<JiraProbeAuthType>("basic");
  const [useMock, setUseMock] = useState(true);
  const [showRawJson, setShowRawJson] = useState(false);
  const [activeTab, setActiveTab] = useState<PreviewTab>("issueFields");
  const [runState, setRunState] = useState<JiraProbeRunState>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<JiraProbeResult | null>(null);
  const { appendDebugLog } = useOutletContext<AppOutletContext>();

  const request = useMemo(() => ({
    connection: {
      name: defaultConnection.name,
      baseUrl,
      email,
      apiToken
    },
    issueKey,
    depth,
    useMock,
    apiVersion,
    authType
  }), [apiToken, apiVersion, authType, baseUrl, depth, email, issueKey, useMock]);

  async function handleRunProbe() {
    const startedAt = new Date().toISOString();
    setRunState("loading");
    setError("");
    appendDebugLog("jiraProbe", [
      "[INFO] Run Probe started",
      `[INFO] Run ID: ${startedAt}`,
      `[INFO] Mode: ${useMock ? "Mock Mode" : "Real read-only probe"}`,
      `[INFO] Issue Key: ${issueKey || "(empty)"}`,
      useMock ? "[INFO] No Jira request sent" : "[INFO] Auth: [masked]",
      "[INFO] No database write performed"
    ]);
    try {
      const next = await runJiraProbe(request);
      setResult(next);
      setActiveTab("issueFields");
      setRunState(next.status === "error" ? "error" : "success");
      if (next.message && next.status === "error") {
        setError(next.message);
      }
      appendDebugLog("jiraProbe", next.debugLogs);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Probe failed.";
      setResult(null);
      setError(message);
      setRunState("error");
      appendDebugLog("jiraProbe", [
        `[ERROR] ${message}`,
        "[INFO] Real Probe did not fall back to mock data",
        "[INFO] No database write performed"
      ]);
    } finally {
      setRunState((current) => current === "loading" ? "idle" : current);
    }
  }

  function handleClear() {
    setResult(null);
    setError("");
    setShowRawJson(false);
    setRunState("idle");
  }

  async function handleCopySummary() {
    if (!result || !navigator.clipboard) return;
    await navigator.clipboard.writeText(`Jira Probe ${result.issueKey}: coverage ${result.summary.coverageScore}%, estimated events ${result.summary.estimatedActivityEvents}`);
  }

  const previewRows = result ? {
    issueFields: result.preview.issueFields,
    changelog: result.preview.changelog,
    comments: result.preview.comments,
    attachments: result.preview.attachments,
    links: result.preview.links
  } : null;

  return (
    <div className="min-w-0">
      <PageHeader title={"Jira \u6e2c\u8a66"} subtitle="Jira Probe" />

      <SectionCard>
        <div className="grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[1.05fr_1.25fr_0.9fr]">
          <div className="rounded-lg border border-line bg-slate-50 p-4">
            <div className="mb-3 flex items-start gap-3">
              <ShieldCheck className="shrink-0 text-green-600" />
              <div className="min-w-0">
                <div className="font-black text-ink" data-no-clip="true">Connection / Jira connection</div>
                <div className="mt-2 text-sm font-semibold leading-relaxed text-muted">
                  <div data-no-clip="true">{defaultConnection.name}</div>
                  <div>Base URL: {baseUrl}</div>
                  <div>Email: {email}</div>
                  <div>Token: [masked]</div>
                </div>
              </div>
            </div>
            <StatusBadge>Connected</StatusBadge>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <FieldLabel label="Jira Base URL" sub="required for Real Probe" />
              <input className="field" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://your-domain.atlassian.net" />
            </div>
            <div>
              <FieldLabel label="Email / Username" sub="required for Real Probe" />
              <input className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
            </div>
            <div>
              <FieldLabel label="Issue Key or ID" sub="Jira issue key or ID" />
              <input className="field" value={issueKey} onChange={(event) => setIssueKey(event.target.value)} placeholder="COPGEN1-126606 or 138930" />
            </div>
            <div>
              <FieldLabel label="API Token" sub="password field" />
              <input className="field" type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="Token is never saved or logged" />
            </div>
            <div>
              <FieldLabel label="API Version" sub="API version" />
              <select className="field" value={apiVersion} onChange={(event) => setApiVersion(event.target.value as JiraProbeApiVersion)}>
                <option value="auto">Auto Detect</option>
                <option value="v3">Jira Cloud v3</option>
                <option value="v2">Jira Server/Data Center v2</option>
              </select>
            </div>
            <div>
              <FieldLabel label="Auth Type" sub="auth type" />
              <select className="field" value={authType} onChange={(event) => setAuthType(event.target.value as JiraProbeAuthType)}>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token / Personal Access Token</option>
              </select>
            </div>
            <div>
              <FieldLabel label="Probe Depth" sub="probe depth" />
              <select className="field" value={depth} onChange={(event) => setDepth(event.target.value as JiraProbeDepth)}>
                <option value="basic">Basic</option>
                <option value="standard">Standard</option>
                <option value="deep">Deep</option>
              </select>
            </div>
            <div className="flex items-end justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm font-bold">
              <span>Mock Mode<br /><span className="text-xs font-semibold text-muted">safe sample data</span></span>
              <button type="button" data-allow-truncate="true" onClick={() => setUseMock((value) => !value)} aria-label="Toggle mock mode">
                <Toggle on={useMock} />
              </button>
            </div>
          </div>

          <div className={`rounded-lg border p-4 text-sm font-semibold leading-relaxed ${useMock ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <div className="mb-2 font-black" data-no-clip="true">
              {useMock ? "\u76ee\u524d\u70ba\u6a21\u64ec\u6e2c\u8a66\u6a21\u5f0f" : "\u76ee\u524d\u70ba\u771f\u5be6 read-only Jira Probe"}
            </div>
            {useMock ? (
              <>
                <div>{"\u76ee\u524d\u70ba\u6a21\u64ec\u6e2c\u8a66\u6a21\u5f0f\uff0c\u4e0d\u6703\u9023\u7dda Jira\uff0c\u4e0d\u6703\u4f7f\u7528 Token\uff0c\u4e0d\u6703\u5beb\u5165\u8cc7\u6599\u5eab\u3002"}</div>
                <div className="mt-2 text-xs">Mock mode uses safe sample data. No Jira request will be sent.</div>
              </>
            ) : (
              <>
                <div>{"\u76ee\u524d\u70ba\u771f\u5be6 read-only Jira Probe\uff0c\u6703\u4f7f\u7528 Jira Base URL\u3001Email\u3001API Token \u8207 Issue Key \u547c\u53eb Jira GET API\uff0c\u4f46\u4e0d\u6703\u5beb\u5165 Jira\uff0c\u4e5f\u4e0d\u6703\u5beb\u5165\u6b63\u5f0f\u8cc7\u6599\u5eab\u3002"}</div>
                <div className="mt-2 text-xs">Real Probe is implemented for read-only GET requests only. It never falls back to mock data.</div>
              </>
            )}
            <div className="mt-3 border-t border-current/20 pt-3 font-black" data-no-clip="true">Depth description</div>
            <div>{depthNotes[depth]}</div>
            <div className="mt-3">Only GET requests are used. Attachments are metadata only; no file content is downloaded.</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn btn-primary" data-no-clip="true" onClick={handleRunProbe} disabled={runState === "loading"}>
            <Play size={16} />{runState === "loading" ? "Running Probe..." : "Run Probe / \u57f7\u884c\u6e2c\u8a66"}
          </button>
          <button className="btn" data-no-clip="true" onClick={handleClear}>
            <Eraser size={16} />Clear Result / {"\u6e05\u9664\u7d50\u679c"}
          </button>
          <button className="btn" data-no-clip="true" onClick={handleCopySummary} disabled={!result}>
            <ClipboardCopy size={16} />Copy Summary / {"\u8907\u88fd\u6458\u8981"}
          </button>
          <button className="btn" data-no-clip="true" disabled title="UI only; no file write in this prototype">
            <FileJson size={16} />Export Probe JSON
          </button>
        </div>

        {runState !== "idle" ? (
          <div className={`mt-4 rounded-lg border p-3 text-sm font-bold ${runState === "success" ? "border-green-200 bg-green-50 text-green-700" : runState === "loading" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            State: {runState}
            {error ? <span className="ml-2">{error}</span> : null}
          </div>
        ) : null}
      </SectionCard>

      {result ? (
        <>
          <ResponsiveMetricGrid min={200} className="mt-4">
            <MetricCard label="Coverage Score" sub="coverage" value={`${result.summary.coverageScore}%`} icon={ShieldCheck} tone="bg-green-50 text-green-600" />
            <MetricCard label="Issue Fields" sub="fields" value={String(result.summary.issueFields)} icon={Activity} />
            <MetricCard label="Changelog Histories" sub="histories" value={String(result.summary.changelogHistories)} icon={Activity} tone="bg-violet-50 text-violet-600" />
            <MetricCard label="Change Items" sub="field changes" value={String(result.summary.changeItems)} icon={Activity} tone="bg-cyan-50 text-cyan-600" />
            <MetricCard label="Comments" sub="comments" value={String(result.summary.comments)} icon={Activity} tone="bg-amber-50 text-amber-600" />
            <MetricCard label="Attachments" sub="metadata" value={String(result.summary.attachments)} icon={Activity} tone="bg-blue-50 text-blue-600" />
            <MetricCard label="Issue Links" sub="linked issues" value={String(result.summary.issueLinks)} icon={Activity} tone="bg-teal-50 text-teal-600" />
            <MetricCard label="Estimated Events" sub="estimated activity" value={String(result.summary.estimatedActivityEvents)} icon={Activity} tone="bg-rose-50 text-rose-600" />
            <MetricCard label="Permission Gaps" sub="permission gaps" value={String(result.summary.permissionGaps)} icon={Activity} tone="bg-red-50 text-red-600" />
          </ResponsiveMetricGrid>

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard title="Endpoint Coverage" subtitle="Endpoint result">
              <DataTable
                headers={["Endpoint", "Status", "HTTP Code", "Records", "Useful Level", "Notes"]}
                rows={result.endpoints.map((item) => [
                  item.endpoint,
                  <StatusBadge tone={statusTone[item.status]}>{item.status}</StatusBadge>,
                  String(item.httpCode),
                  item.records,
                  item.usefulLevel,
                  item.notes
                ])}
              />
            </SectionCard>

            <SectionCard title="Estimated Activity Events" subtitle="event estimate">
              <div className="space-y-3">
                {result.eventEstimates.map((item) => (
                  <div key={item.type} className="min-w-0">
                    <div className="mb-1 flex justify-between gap-3 text-sm font-bold">
                      <span>{item.type}</span>
                      <span data-no-clip="true">{item.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, item.count / Math.max(1, result.summary.estimatedActivityEvents) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard title="Data Preview" subtitle="preview">
              <div className="mb-3 flex flex-wrap gap-2">
                {(["issueFields", "changelog", "comments", "attachments", "links", "rawJson"] as PreviewTab[]).map((tab) => (
                  <button key={tab} className={`btn px-3 py-2 ${activeTab === tab ? "btn-primary" : ""}`} data-no-clip="true" onClick={() => setActiveTab(tab)}>
                    {tab}
                  </button>
                ))}
              </div>
              {activeTab === "rawJson" ? (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm font-bold">
                    <span>Show Raw JSON / {"\u986f\u793a\u539f\u59cb JSON"}</span>
                    <button type="button" data-allow-truncate="true" onClick={() => setShowRawJson((value) => !value)} aria-label="Toggle raw JSON">
                      <Toggle on={showRawJson} />
                    </button>
                  </div>
                  {showRawJson ? (
                    <pre className="thin-scroll max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                      {JSON.stringify(result.preview.rawJson, null, 2)}
                    </pre>
                  ) : (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-700">
                      Raw JSON is hidden by default. Token and Authorization data are redacted.
                    </div>
                  )}
                </div>
              ) : previewRows ? (
                <DataTable headers={activeTab === "issueFields" ? ["Field", "Value"] : ["A", "B", "C"]} rows={previewRows[activeTab]} />
              ) : null}
            </SectionCard>

            <SectionCard title="Permission & Limitation Hints" subtitle="read-only limits">
              <div className="space-y-3 text-sm font-semibold leading-relaxed text-ink">
                {result.hints.map((hint) => (
                  <div key={hint} className="rounded-lg border border-line bg-slate-50 p-3">{hint}</div>
                ))}
              </div>
            </SectionCard>
          </div>

          <SectionCard className="mt-4" title="Probe Debug Summary" subtitle="token-safe log">
            <div className="thin-scroll max-h-64 overflow-auto rounded-lg border border-line bg-slate-50 p-4 font-mono text-xs leading-relaxed">
              {result.debugLogs.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          </SectionCard>
        </>
      ) : (
        <SectionCard className="mt-4" title="Probe Result" subtitle="not yet run">
          <div className="rounded-lg border border-dashed border-line p-6 text-sm font-semibold text-muted">
            Enter an Issue Key, keep Mock Mode on for a safe sample, then run the probe. No result is written to the database.
          </div>
        </SectionCard>
      )}
    </div>
  );
}
