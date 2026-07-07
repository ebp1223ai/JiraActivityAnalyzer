import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Activity, ClipboardCopy, Download, Eraser, FileJson, Play, RefreshCcw, ShieldCheck } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { FieldLabel, Toggle } from "../components/FormControls";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { buildInfo } from "../buildInfo";
import { globalDataSourceMode } from "../data/dataSource";
import { runJiraProbe } from "../services/jiraProbeService";
import { useConnectionContext } from "../state/ConnectionContext";
import type { JiraProbeApiVersion, JiraProbeAuthType, JiraProbeResult, JiraProbeRunState, JiraProbeStatus } from "../types/jiraProbe";
import type { AppOutletContext } from "../components/AppLayout";

declare const __BUILD_TIME__: string;

const defaultConnection = {
  name: "Jira Server/Data Center",
  baseUrl: "https://jira.example.com:8443",
  email: ""
};

const statusTone: Record<JiraProbeStatus, "green" | "blue" | "amber" | "red" | "gray"> = {
  success: "green",
  partial: "amber",
  forbidden: "red",
  failed: "red",
  skipped: "gray"
};

const authTypeNotes: Record<JiraProbeAuthType, string> = {
  basic: "For Jira Cloud or Jira instances that allow username + token/password.",
  bearer: "Recommended for Jira Server/Data Center Personal Access Token."
};

type PreviewTab = "overview" | "issueFields" | "description" | "changelog" | "comments" | "attachments" | "links" | "users" | "activityEstimate" | "rawJson" | "manualCompare";

const inspectorTabs: Array<{ key: PreviewTab; label: string }> = [
  { key: "overview", label: "Overview / 概覽" },
  { key: "issueFields", label: "Issue Fields / Issue 欄位" },
  { key: "description", label: "Description / 描述" },
  { key: "changelog", label: "Changelog / 變更紀錄" },
  { key: "comments", label: "Comments / 留言" },
  { key: "attachments", label: "Attachments / 附件" },
  { key: "links", label: "Links / 關聯 Issue" },
  { key: "users", label: "Users / 使用者" },
  { key: "activityEstimate", label: "Activity Event Estimate / 活動事件估算" },
  { key: "rawJson", label: "Raw JSON / 原始 JSON" },
  { key: "manualCompare", label: "Manual Compare / 手動比對" }
];

export function JiraProbePage() {
  const [baseUrl, setBaseUrl] = useState(defaultConnection.baseUrl);
  const [email, setEmail] = useState(defaultConnection.email);
  const [issueKey, setIssueKey] = useState("COPGEN1-138930");
  const [apiToken, setApiToken] = useState("");
  const [apiVersion, setApiVersion] = useState<JiraProbeApiVersion>("v2");
  const [authType, setAuthType] = useState<JiraProbeAuthType>("bearer");
  const [useMock, setUseMock] = useState(false);
  const [useActiveConnection, setUseActiveConnection] = useState(true);
  const [envStatus, setEnvStatus] = useState("Env not loaded");
  const [actionNotice, setActionNotice] = useState("");
  const [showRawJson, setShowRawJson] = useState(false);
  const [activeTab, setActiveTab] = useState<PreviewTab>("overview");
  const [inspectorSearch, setInspectorSearch] = useState("");
  const [inspectorFilter, setInspectorFilter] = useState("all");
  const [runState, setRunState] = useState<JiraProbeRunState>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<JiraProbeResult | null>(null);
  const { appendDebugLog } = useOutletContext<AppOutletContext>();
  const { activeConnection } = useConnectionContext();

  const request = useMemo(() => ({
    connection: {
      name: defaultConnection.name,
      baseUrl,
      email,
      apiToken
    },
    issueKey,
    depth: "standard" as const,
    useMock,
    apiVersion,
    authType
  }), [apiToken, apiVersion, authType, baseUrl, email, issueKey, useMock]);

  useEffect(() => {
    void handleReloadEnv(false);
  }, []);

  useEffect(() => {
    if (!useActiveConnection || !activeConnection) return;
    setBaseUrl(activeConnection.baseUrl);
    setEmail(activeConnection.email || activeConnection.username);
    if (activeConnection.apiToken) setApiToken(activeConnection.apiToken);
    setAuthType(activeConnection.authType as JiraProbeAuthType);
    setApiVersion(activeConnection.apiVersion as JiraProbeApiVersion);
  }, [activeConnection, useActiveConnection]);

  function applyEnvConfig(config: {
    baseUrl: string;
    email: string;
    username: string;
    apiToken: string;
    authType: string;
    apiVersion: string;
    issueKey: string;
    mockMode: boolean;
  }) {
    if (config.baseUrl) setBaseUrl(config.baseUrl);
    if (config.email || config.username) setEmail(config.email || config.username);
    if (config.apiToken) setApiToken(config.apiToken);
    if (config.issueKey) setIssueKey(config.issueKey);
    if (["basic", "bearer"].includes(config.authType)) setAuthType(config.authType as JiraProbeAuthType);
    if (["auto", "v2", "v3"].includes(config.apiVersion)) setApiVersion(config.apiVersion as JiraProbeApiVersion);
    setUseMock(config.mockMode);
  }

  async function handleReloadEnv(showNotice = true) {
    const response = await window.desktopApp?.jiraProbe?.loadEnv?.();
    if (!response) {
      setEnvStatus("Env not available in browser preview");
      return;
    }
    applyEnvConfig(response.config);
    if (response.status === "loaded") {
      const loadedAt = response.loadedAt ? new Date(response.loadedAt).toLocaleString("zh-TW", { hour12: false }) : new Date().toLocaleString("zh-TW", { hour12: false });
      setEnvStatus(`已載入 .env / Env loaded | Env Path: ${response.envPath ?? response.sourcePath} | Loaded At: ${loadedAt}`);
      appendDebugLog("jiraProbe", ["[INFO] Env file loaded", `[INFO] Env path: ${response.envPath ?? response.sourcePath}`, `[INFO] Env token present: ${response.config.hasToken ? "yes (masked)" : "no"}`]);
      if (showNotice) setActionNotice("Env loaded.");
    } else {
      const createdAt = response.createdAt ? new Date(response.createdAt).toLocaleString("zh-TW", { hour12: false }) : new Date().toLocaleString("zh-TW", { hour12: false });
      setEnvStatus(`未找到 .env，已自動建立範本 / Default env file created | Env Path: ${response.envPath ?? response.sourcePath} | Created At: ${createdAt}`);
      appendDebugLog("jiraProbe", ["[WARN] Env file not found", "[INFO] Default env file created", `[INFO] Env path: ${response.envPath ?? response.sourcePath}`]);
      if (showNotice) setActionNotice("Default env file created.");
    }
  }

  async function handleRunProbe() {
    setRunState("loading");
    setError("");
    appendDebugLog("jiraProbe", ["[INFO] Jira Probe uses Live Jira API regardless of global data source mode"]);
    try {
      const next = await runJiraProbe(request);
      setResult(next);
      setActiveTab("overview");
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

  function safeIssueFileName() {
    return result?.issueKey.replace(/[^A-Z0-9_-]/gi, "_") || "jira-probe";
  }

  function exportPayload() {
    if (!result) return null;
    const dataSource = probeDataSourceMetadata(result.apiVersion);
    return {
      exportType: "jira-probe-result",
      appVersion: buildInfo.version.replace(/^v/, ""),
      buildTime: buildInfo.buildTime,
      exportedAt: new Date().toISOString(),
      ...dataSource,
      probeRunId: result.debugLogs.find((line) => line.includes("Run ID:"))?.replace("[INFO] Run ID: ", "") ?? "",
      baseUrl,
      issueKey: result.issueKey,
      apiVersion: result.apiVersion,
      authType,
      endpointCoverage: result.endpoints,
      overview: result.inspector?.overview ?? [],
      issueFields: result.inspector?.issueFields ?? [],
      description: result.inspector?.description ?? null,
      changelog: result.inspector?.changelog ?? null,
      comments: result.inspector?.comments ?? null,
      attachmentsMetadata: result.inspector?.attachments ?? null,
      links: result.inspector?.links ?? null,
      users: result.inspector?.users ?? [],
      activityEventEstimate: result.inspector?.activityEstimate ?? [],
      rawResponsesSanitized: result.inspector?.rawJson ?? result.preview.rawJson,
      debugLogSanitized: result.debugLogs
    };
  }

  function rawDataPayload() {
    if (!result) return null;
    const dataSource = probeDataSourceMetadata(result.apiVersion);
    return {
      exportType: "jira-probe-raw-data",
      appVersion: buildInfo.version.replace(/^v/, ""),
      buildTime: buildInfo.buildTime,
      exportedAt: new Date().toISOString(),
      ...dataSource,
      requestContext: {
        ...dataSource.source,
        issueKey: result.issueKey,
        readOnly: true
      },
      endpoints: result.endpoints,
      rawResponsesSanitized: result.inspector?.rawJson ?? result.preview.rawJson,
      debugLogSanitized: result.debugLogs
    };
  }

  function probeDataSourceMetadata(selectedApiVersion: JiraProbeResult["apiVersion"] | null) {
    return {
      globalDataSourceMode: globalDataSourceMode.id,
      source: {
        type: globalDataSourceMode.id,
        baseUrl,
        apiVersion: selectedApiVersion ?? apiVersion,
        authType,
        readOnly: true,
        databaseWrite: false,
        attachmentDownload: false,
        token: "[masked]",
        authorization: "[masked]"
      }
    };
  }

  async function handleSaveProbeResult() {
    const payload = exportPayload();
    if (!payload || !window.desktopApp?.jiraProbe?.saveResult) return;
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    const content = JSON.stringify(payload, null, 2);
    const saveResult = await window.desktopApp.jiraProbe.saveResult({
      defaultFileName: `jira-probe-result-${safeIssueFileName()}-${timestamp}.json`,
      content
    });
    if (!saveResult.canceled) {
      setActionNotice("Probe result saved.");
      appendDebugLog("jiraProbe", [
        `[INFO] Output folder ready: ${saveResult.folderPath ?? ""}`,
        `[INFO] Probe result saved: ${saveResult.filePath ?? ""}`
      ]);
    }
  }

  async function handleSaveRawData() {
    const payload = rawDataPayload();
    if (!payload || !window.desktopApp?.jiraProbe?.saveRawData) return;
    const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "_").slice(0, 15);
    const saveResult = await window.desktopApp.jiraProbe.saveRawData({
      defaultFileName: `jira-probe-raw-${safeIssueFileName()}-${timestamp}.json`,
      data: payload
    });
    if (!saveResult.canceled) {
      setActionNotice("Raw data saved.");
      appendDebugLog("jiraProbe", [
        `[INFO] Raw data saved: ${saveResult.filePath ?? ""}`,
        "[INFO] No database write performed"
      ]);
    }
  }

  async function handleCopyCurrentJson() {
    if (!result?.inspector || !navigator.clipboard) return;
    await navigator.clipboard.writeText(JSON.stringify(result.inspector.rawJson, null, 2));
    setActionNotice("Sanitized JSON copied.");
    appendDebugLog("jiraProbe", ["[INFO] Sanitized raw JSON copied to clipboard"]);
  }

  async function handleCopyCompareSummary() {
    if (!result?.inspector || !navigator.clipboard) return;
    const text = result.inspector.manualCompare.map((row) => `${row[0]}: API=${row[1]} | Web=${row[2] || "(empty)"} | ${row[3]}`).join("\n");
    await navigator.clipboard.writeText(text);
    setActionNotice("Compare summary copied.");
    appendDebugLog("jiraProbe", ["[INFO] Manual compare summary copied to clipboard"]);
  }

  const errorBanner = result?.localizedMessage;

  function noData(message = "No data available / Permission denied / Endpoint failed") {
    return <div className="rounded-lg border border-dashed border-line p-5 text-sm font-bold text-muted">{message}</div>;
  }

  function matchesInspectorFilters(row: unknown[]) {
    const value = row.map((cell) => String(cell ?? "")).join(" ").toLowerCase();
    const query = inspectorSearch.trim().toLowerCase();
    const hasData = !/empty \/ not available|permission denied|endpoint failed/i.test(value);
    if (query && !value.includes(query)) return false;
    if (inspectorFilter === "withData" && !hasData) return false;
    if (inspectorFilter === "emptyOnly" && hasData) return false;
    return true;
  }

  function filteredRows<T extends unknown[]>(rows: T[]) {
    return rows.filter((row) => matchesInspectorFilters(row));
  }

  function renderInspectorTab() {
    const inspector = result?.inspector;
    if (!result) return null;
    if (!inspector) {
      if (activeTab === "rawJson") {
        return (
          <pre className="thin-scroll max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
            {JSON.stringify(result.preview.rawJson, null, 2)}
          </pre>
        );
      }
      return noData();
    }

    switch (activeTab) {
      case "overview":
        return <DataTable headers={["Field", "Value"]} rows={filteredRows(inspector.overview)} />;
      case "issueFields":
        return <DataTable headers={["Field Key", "Field Name", "Type", "Value Preview", "Raw Type", "Has Value", "Is Custom Field"]} rows={filteredRows(inspector.issueFields)} />;
      case "description":
        return (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-black text-ink">Rendered / 渲染</div>
              <div className="rounded-lg border border-line bg-white p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: inspector.description.rendered }} />
            </div>
            <div>
              <div className="mb-2 text-sm font-black text-ink">Plain Text / 純文字</div>
              <pre className="thin-scroll max-h-52 overflow-auto rounded-lg border border-line bg-slate-50 p-4 text-xs leading-relaxed">{inspector.description.plainText}</pre>
            </div>
            <div>
              <div className="mb-2 text-sm font-black text-ink">Raw / 原始</div>
              <pre className="thin-scroll max-h-52 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">{inspector.description.raw}</pre>
            </div>
          </div>
        );
      case "changelog":
        return (
          <div className="space-y-4">
            {inspector.changelog.partial ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">Changelog may be partial.</div> : null}
            <DataTable headers={["Metric", "Value"]} rows={inspector.changelog.summary} />
            {inspector.changelog.rows.length ? <DataTable headers={["Time", "Author", "Field", "From", "To", "Changelog ID", "Item Index"]} rows={filteredRows(inspector.changelog.rows)} /> : noData()}
          </div>
        );
      case "comments":
        return (
          <div className="space-y-4">
            <DataTable headers={["Metric", "Value"]} rows={inspector.comments.summary} />
            {inspector.comments.rows.length ? <DataTable headers={["Comment ID", "Author", "Created", "Updated", "Updated By", "Body Preview", "Visibility"]} rows={filteredRows(inspector.comments.rows)} /> : noData()}
          </div>
        );
      case "attachments":
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800">Attachment metadata only; file content not downloaded.</div>
            <DataTable headers={["Metric", "Value"]} rows={inspector.attachments.summary} />
            {inspector.attachments.rows.length ? <DataTable headers={["Attachment ID", "Filename", "Author", "Created", "MIME Type", "Size", "Thumbnail URL", "Content URL"]} rows={filteredRows(inspector.attachments.rows)} /> : noData()}
          </div>
        );
      case "links":
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">Link creator may not be recoverable unless changelog contains link change event.</div>
            <DataTable headers={["Metric", "Value"]} rows={inspector.links.summary} />
            {inspector.links.rows.length ? <DataTable headers={["Link ID", "Link Type", "Direction", "Linked Issue Key", "Linked Issue Summary", "Linked Issue Status", "Linked Issue Type"]} rows={filteredRows(inspector.links.rows)} /> : noData()}
          </div>
        );
      case "users":
        return inspector.users.length ? <DataTable headers={["Display Name", "Username / Name", "Email", "Account ID", "Source", "Event Count Estimate"]} rows={filteredRows(inspector.users)} /> : noData("No users detected from the available API response.");
      case "activityEstimate":
        return <DataTable headers={["Event Type", "Count", "Source", "Confidence", "Notes"]} rows={filteredRows(inspector.activityEstimate)} />;
      case "manualCompare":
        return (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 p-3 text-sm font-bold text-muted">
              <span>Enter Jira Web Value manually and mark Match / Different when comparing with Jira Web UI. This is UI-only; no file or database write is performed.</span>
              <button className="btn" type="button" data-no-clip="true" onClick={handleCopyCompareSummary}>
                <ClipboardCopy size={16} />Copy Compare Summary
              </button>
            </div>
            <DataTable headers={["Item", "API Value", "Jira Web Value", "Match Status", "Notes"]} rows={filteredRows(inspector.manualCompare)} />
          </div>
        );
      case "rawJson":
        return (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm font-bold">
              <span>Show Raw JSON / 顯示原始 JSON</span>
              <div className="flex flex-wrap gap-2">
                <button className="btn" type="button" data-no-clip="true" onClick={handleCopyCurrentJson}>
                  <ClipboardCopy size={16} />Copy JSON
                </button>
                <button className="btn" type="button" data-no-clip="true" onClick={handleSaveProbeResult}>
                  <Download size={16} />Save JSON
                </button>
                <button type="button" data-allow-truncate="true" onClick={() => setShowRawJson((value) => !value)} aria-label="Toggle raw JSON">
                  <Toggle on={showRawJson} />
                </button>
              </div>
            </div>
            {showRawJson ? (
              <pre className="thin-scroll max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                {JSON.stringify(inspector.rawJson, null, 2)}
              </pre>
            ) : (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-700">
                Raw JSON is hidden by default. Token and Authorization data are redacted.
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  }

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
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold">
              <span>Use Active Connection<br /><span className="text-xs font-semibold text-muted">{activeConnection?.name ?? "No active connection"}</span></span>
              <button type="button" data-allow-truncate="true" onClick={() => setUseActiveConnection((value) => !value)} aria-label="Toggle active connection">
                <Toggle on={useActiveConnection} />
              </button>
            </div>
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
              <div className="mt-1 text-xs font-semibold leading-snug text-muted">{authTypeNotes[authType]}</div>
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
            <div className="mt-3 border-t border-current/20 pt-3 font-black" data-no-clip="true">Probe Scope / 測試範圍</div>
            <div>Standard read-only issue analysis</div>
            <div className="mt-2 font-bold" data-no-clip="true">Global Data Source Mode: Live Jira API</div>
            <div className="mt-1 text-xs leading-relaxed">Jira Probe always uses Live Jira API. Local Database mode is disabled / coming later.</div>
            <div className="mt-2 text-xs leading-relaxed">
              GET /rest/api/2/myself, GET /rest/api/2/issue/{"{issueKey}"}, GET /rest/api/2/issue/{"{issueKey}"}?expand=changelog, GET /rest/api/2/issue/{"{issueKey}"}/comment, parse attachments metadata, issue links, users, and estimate activity events.
            </div>
            <div className="mt-3">Only GET requests are used. Attachments are metadata only; no file content is downloaded.</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button className="btn btn-primary" data-no-clip="true" onClick={handleRunProbe} disabled={runState === "loading"}>
            <Play size={16} />{runState === "loading" ? "Running Probe..." : "Run Probe / \u57f7\u884c\u6e2c\u8a66"}
          </button>
          <button className="btn" data-no-clip="true" onClick={() => void handleReloadEnv(true)}>
            <RefreshCcw size={16} />Reload Env
          </button>
          <button className="btn" data-no-clip="true" onClick={handleClear}>
            <Eraser size={16} />Clear Result / {"\u6e05\u9664\u7d50\u679c"}
          </button>
          <button className="btn" data-no-clip="true" onClick={handleSaveProbeResult} disabled={!result} title={result ? "Export sanitized probe JSON" : "Run Probe first."}>
            <Download size={16} />Save Probe Result
          </button>
          <button className="btn" data-no-clip="true" onClick={handleSaveRawData} disabled={!result} title={result ? "Export sanitized raw data JSON" : "Run Probe first."}>
            <FileJson size={16} />Save Raw Data
          </button>
        </div>

        <div className="mt-3 rounded-lg border border-line bg-slate-50 p-3 text-xs font-bold leading-relaxed text-muted">
          {envStatus}
          {actionNotice ? <span className="ml-3 text-blue-700">{actionNotice}</span> : null}
        </div>

        {runState !== "idle" ? (
          <div className={`mt-4 rounded-lg border p-3 text-sm font-bold ${runState === "success" ? "border-green-200 bg-green-50 text-green-700" : runState === "loading" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            State: {runState}
            {error ? <span className="ml-2">{error}</span> : null}
          </div>
        ) : null}
        {errorBanner ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-relaxed text-red-800">
            <div className="whitespace-pre-line">{errorBanner.en}</div>
            <div className="mt-3 whitespace-pre-line">{errorBanner.zh}</div>
          </div>
        ) : null}
      </SectionCard>

      {result ? (
        <>
          <SectionCard className="mt-4" title="Probe Summary" subtitle="read-only result overview">
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3 text-sm font-semibold">
              {[
                ["Issue Key", result.issueKey],
                ["Status", result.status],
                ["API Version", result.apiVersion ?? "-"],
                ["Auth Type", authType === "bearer" ? "Bearer Token / PAT" : "Basic Auth"],
                ["Probe Scope", "Standard read-only probe"],
                ["Build Time", typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "Development Mode"]
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-lg border border-line bg-slate-50 p-3">
                  <div className="text-xs font-black uppercase tracking-wide text-muted">{label}</div>
                  <div className="mt-1 break-words text-base font-black text-ink" data-no-clip="true">{value}</div>
                </div>
              ))}
            </div>
          </SectionCard>

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

          {result.authDiagnostics ? (
            <SectionCard className="mt-4" title="Authentication Diagnostics" subtitle="認證診斷">
              <DataTable
                headers={["Field", "Value"]}
                rows={[
                  ["Base URL", result.authDiagnostics.baseUrl],
                  ["API Version tried", result.authDiagnostics.apiVersionTried.join(", ") || "-"],
                  ["Auth Type", result.authDiagnostics.authType],
                  ["/rest/api/3/myself status", result.authDiagnostics.v3MyselfStatus],
                  ["/rest/api/2/myself status", result.authDiagnostics.v2MyselfStatus],
                  ["Content-Type", result.authDiagnostics.contentType],
                  ["Selected API Version", result.authDiagnostics.selectedApiVersion ?? "-"],
                  ["Recommended Next Action", result.authDiagnostics.recommendedNextAction.join(" ")]
                ]}
              />
            </SectionCard>
          ) : null}

          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard title="Endpoint Coverage" subtitle="Endpoint result">
              <DataTable
                headers={["Endpoint", "Method", "URL Path", "Status", "HTTP Code", "Content-Type", "Records", "Duration", "Useful Level", "Notes"]}
                rows={result.endpoints.map((item) => [
                  item.endpoint,
                  item.method ?? "GET",
                  item.urlPath ?? "-",
                  <StatusBadge tone={statusTone[item.status]}>{item.status}</StatusBadge>,
                  String(item.httpCode),
                  item.contentType ?? "-",
                  item.records,
                  item.duration ?? "-",
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
            <SectionCard title="Data Inspector" subtitle="read-only probe result">
              <div className="mb-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <input
                  className="field"
                  value={inspectorSearch}
                  onChange={(event) => setInspectorSearch(event.target.value)}
                  placeholder="Search inspector data..."
                />
                <select className="field" value={inspectorFilter} onChange={(event) => setInspectorFilter(event.target.value)}>
                  <option value="all">All data</option>
                  <option value="withData">With value only</option>
                  <option value="emptyOnly">Empty / unavailable only</option>
                </select>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {inspectorTabs.map((tab) => (
                  <button key={tab.key} className={`btn px-3 py-2 ${activeTab === tab.key ? "btn-primary" : ""}`} data-no-clip="true" onClick={() => setActiveTab(tab.key)}>
                    {tab.label}
                  </button>
                ))}
              </div>
              {renderInspectorTab()}
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
