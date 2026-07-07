import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, FolderOpen, KeyRound, RefreshCw, Save, ShieldCheck, UserCheck } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { DataTable } from "../components/DataTable";
import { FieldLabel } from "../components/FormControls";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import type { AppOutletContext } from "../components/AppLayout";
import type { ConnectionApiVersion, ConnectionAuthType, JiraConnection } from "../types/connection";

function emptyConnection(): JiraConnection {
  return {
    id: "jira-production",
    name: "Jira Server (Production)",
    baseUrl: "https://jira.example.com:8443",
    authType: "bearer",
    apiVersion: "v2",
    username: "",
    email: "",
    apiToken: "",
    tokenSource: "env",
    tokenMasked: "",
    projectScope: ["COPGEN1", "FW", "QA"],
    status: "not_tested",
    lastTestedAt: "",
    authenticatedUser: "",
    accessibleProjectsCount: 0,
    active: true
  };
}

function statusTone(status: JiraConnection["status"]) {
  if (status === "connected") return "green";
  if (status === "failed") return "red";
  return "gray";
}

export function ConnectionsPage() {
  const { activeConnection, savedConnections, envStatus, reloadEnv, testConnection, saveConnection, setActiveConnection } = useConnectionContext();
  const { appendDebugLog } = useOutletContext<AppOutletContext>();
  const [draft, setDraft] = useState<JiraConnection>(emptyConnection());
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (activeConnection) setDraft({ ...activeConnection });
  }, [activeConnection]);

  function update<K extends keyof JiraConnection>(key: K, value: JiraConnection[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleReloadEnv() {
    const state = await reloadEnv();
    if (!state) return;
    setDraft({ ...state.activeConnection });
    const envPath = state.env.envPath ?? "";
    appendDebugLog("connections", [
      state.env.status === "created" ? "[WARN] Env file not found" : "[INFO] Env file loaded",
      state.env.status === "created" ? "[INFO] Default env file created" : "[INFO] Env loaded",
      `[INFO] Env path: ${envPath}`,
      "[INFO] Token: [masked]"
    ]);
    setNotice(state.env.status === "created" ? "Env template created and loaded." : "Env loaded.");
  }

  async function handleTest() {
    const result = await testConnection(draft);
    if (!result) return;
    setDraft(result.connection);
    appendDebugLog("connections", result.logs);
    setNotice(result.connection.status === "connected" ? "Connection test successful." : "Connection test failed.");
  }

  async function handleSave() {
    const state = await saveConnection({ ...draft, active: true });
    if (!state) return;
    setNotice("Connection saved and set active.");
    appendDebugLog("connections", ["[INFO] Connection saved", `[INFO] Active connection: ${state.activeConnection.name}`, "[INFO] Token was not persisted"]);
  }

  async function handleSetActive(id: string) {
    const state = await setActiveConnection(id);
    if (!state) return;
    setDraft({ ...state.activeConnection });
    setNotice(`Active connection set: ${state.activeConnection.name}`);
    appendDebugLog("connections", [`[INFO] Active connection set: ${state.activeConnection.name}`]);
  }

  const envText = envStatus?.status
    ? `${envStatus.status === "created" ? "Env created" : "Env loaded"} | ${envStatus.envPath ?? ""}`
    : "Env status not loaded";

  return (
    <div className="min-w-0">
      <PageHeader title="連線設定" subtitle="Connections" />

      <SectionCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-3 text-xl font-black">
            <Cloud className="shrink-0 text-blue-600" />
            <span className="truncate">Jira Connection</span>
          </h2>
          <div className="rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs font-bold text-muted">{envText}</div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <FieldLabel label="Connection Name" sub="連線名稱" />
          <input className="field" value={draft.name} onChange={(event) => update("name", event.target.value)} />

          <FieldLabel label="Jira Base URL" sub="Jira 基礎 URL" />
          <input className="field" value={draft.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} />

          <FieldLabel label="Auth Type" sub="認證類型" />
          <select className="field" value={draft.authType} onChange={(event) => update("authType", event.target.value as ConnectionAuthType)}>
            <option value="bearer">Bearer Token / Personal Access Token</option>
            <option value="basic">Basic Auth</option>
          </select>

          <FieldLabel label="API Version" sub="API 版本" />
          <select className="field" value={draft.apiVersion} onChange={(event) => update("apiVersion", event.target.value as ConnectionApiVersion)}>
            <option value="v2">Jira Server/Data Center v2</option>
            <option value="v3">Jira Cloud v3</option>
            <option value="auto">Auto Detect</option>
          </select>

          <FieldLabel label="Email / Username" sub="Email / 使用者名稱" />
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            <input className="field" value={draft.email} onChange={(event) => update("email", event.target.value)} placeholder="email@example.com" />
            <input className="field" value={draft.username} onChange={(event) => update("username", event.target.value)} placeholder="username" />
          </div>

          <FieldLabel label="API Token / PAT" sub="不會寫入 config" />
          <input className="field" type="password" value={draft.apiToken ?? ""} onChange={(event) => update("apiToken", event.target.value)} placeholder={draft.tokenMasked || "Token is masked and not logged"} />

          <FieldLabel label="Project Scope" sub="專案範圍" />
          <input className="field" value={draft.projectScope.join(",")} onChange={(event) => update("projectScope", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
        </div>

        <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="min-w-0 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-700">
            Active: {activeConnection?.name ?? "None"}<br />
            Token Source: {draft.tokenSource} {draft.tokenMasked ? `(${draft.tokenMasked})` : ""}
          </div>
          <div className="flex min-w-0 flex-wrap gap-3">
            <button className="btn" onClick={handleReloadEnv}><RefreshCw size={16} />Reload Env</button>
            <button className="btn" onClick={() => activeConnection && setDraft({ ...activeConnection })}>Load from .env</button>
            <button className="btn" onClick={handleTest}><ShieldCheck size={16} />Test Connection</button>
            <button className="btn btn-primary" onClick={handleSave}><Save size={16} />Save Connection</button>
          </div>
        </div>
        {notice ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">{notice}</div> : null}
      </SectionCard>

      <SectionCard className="mt-4" title="Connection Status" subtitle="read-only test result">
        <ResponsiveMetricGrid min={180}>
          <MetricCard label="Authenticated User" sub="user" value={draft.authenticatedUser || "-"} icon={UserCheck} tone="bg-green-50 text-green-600" />
          <MetricCard label="Accessible Projects" sub="projects" value={String(draft.accessibleProjectsCount || 0)} icon={FolderOpen} />
          <MetricCard label="Auth Type" sub="auth" value={draft.authType === "bearer" ? "Bearer" : "Basic"} icon={ShieldCheck} tone="bg-violet-50 text-violet-600" />
          <MetricCard label="Last Tested" sub="time" value={draft.lastTestedAt || "-"} icon={KeyRound} tone="bg-amber-50 text-amber-600" />
        </ResponsiveMetricGrid>
      </SectionCard>

      <SectionCard className="mt-4" title="Saved Connections" subtitle="local app config metadata">
        <DataTable
          headers={["Name", "Base URL", "Auth Type", "API Version", "Token Source", "Project Scope", "Status", "Last Tested", "Active", "Actions"]}
          rows={savedConnections.map((connection) => [
            connection.name,
            connection.baseUrl,
            connection.authType,
            connection.apiVersion,
            connection.tokenSource,
            connection.projectScope.join(", "),
            <StatusBadge tone={statusTone(connection.status)}>{connection.status}</StatusBadge>,
            connection.lastTestedAt || "-",
            connection.active ? <CheckCircle2 className="text-green-600" size={18} /> : "-",
            <div className="flex min-w-max gap-2">
              <button className="btn px-3 py-2" onClick={() => setDraft({ ...connection })}>Edit</button>
              <button className="btn px-3 py-2" onClick={() => void handleSetActive(connection.id)}>Set Active</button>
            </div>
          ])}
        />
      </SectionCard>
    </div>
  );
}
