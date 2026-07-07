import { useEffect, useState } from "react";
import { Cloud, FileInput, KeyRound, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { useOutletContext } from "react-router-dom";
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
    id: "env-jira-connection",
    name: "Current .env Jira Connection",
    baseUrl: "https://jira.example.com:8443",
    authType: "bearer",
    apiVersion: "v2",
    username: "",
    email: "",
    apiToken: "",
    tokenSource: "env",
    tokenMasked: "",
    status: "not_tested",
    lastTestedAt: "",
    authenticatedUser: "",
    accessibleProjectsCount: 0,
    active: true
  };
}

export function ConnectionsPage() {
  const { activeConnection, envStatus, reloadEnv, chooseEnv, testConnection } = useConnectionContext();
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
    appendDebugLog("connections", ["[INFO] Reload Env requested", `[INFO] Current Env Path: ${envStatus?.currentEnvPath ?? envStatus?.envPath ?? ""}`]);
    const state = await reloadEnv();
    if (!state) return;
    setDraft({ ...state.activeConnection });
    const envPath = state.env.currentEnvPath ?? state.env.envPath ?? "";
    appendDebugLog("connections", [
      state.env.status === "created" ? "[WARN] Env file not found" : "[INFO] Env loaded successfully",
      state.env.status === "created" ? "[INFO] Default env file created" : `[INFO] Env path: ${envPath}`,
      "[INFO] Token: [masked]"
    ]);
    setNotice(state.env.status === "created" ? "Default env file created and loaded." : "Env loaded.");
  }

  async function handleChooseEnv() {
    appendDebugLog("connections", ["[INFO] Choose Env File requested"]);
    const response = await chooseEnv();
    if (!response) return;
    if (response.canceled) {
      appendDebugLog("connections", ["[INFO] Choose Env File cancelled"]);
      setNotice("Choose Env File cancelled.");
      return;
    }
    setDraft({ ...response.state.activeConnection });
    const envPath = response.state.env.currentEnvPath ?? response.state.env.envPath ?? "";
    appendDebugLog("connections", [
      `[INFO] Env file selected: ${envPath}`,
      "[INFO] Env loaded successfully",
      "[INFO] Current Env Path updated",
      "[INFO] Token: [masked]"
    ]);
    setNotice("Env file selected and loaded.");
  }

  async function handleTest() {
    const result = await testConnection(draft);
    if (!result) return;
    setDraft(result.connection);
    appendDebugLog("connections", result.logs);
    setNotice(result.connection.status === "connected" ? "Connection test successful." : "Connection test failed.");
  }

  const currentEnvPath = envStatus?.currentEnvPath ?? envStatus?.envPath ?? "Env status not loaded";

  return (
    <div className="min-w-0">
      <PageHeader title="連線設定" subtitle="Connections" />

      <SectionCard>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-3 text-xl font-black">
            <Cloud className="shrink-0 text-blue-600" />
            <span className="truncate">Jira .env Connection</span>
          </h2>
          <StatusBadge tone={draft.status === "connected" ? "green" : draft.status === "failed" ? "red" : "gray"}>{draft.status}</StatusBadge>
        </div>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-relaxed text-blue-800">
          <div className="font-black">This page currently reads from .env only.</div>
          <div>To persist changes, edit the current .env file and click Reload Env.</div>
          <div className="mt-2 break-all"><b>Current Env Path:</b> {currentEnvPath}</div>
          <div className="break-all"><b>Default Env Path:</b> {envStatus?.defaultEnvPath ?? "-"}</div>
          <div className="break-all"><b>App Config:</b> {envStatus?.appConfigPath ?? "-"}</div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <FieldLabel label="Jira Base URL" sub="loaded from .env" />
          <input className="field" value={draft.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} />

          <FieldLabel label="Email" sub="JIRA_EMAIL" />
          <input className="field" value={draft.email} onChange={(event) => update("email", event.target.value)} placeholder="email@example.com" />

          <FieldLabel label="Username" sub="JIRA_USERNAME" />
          <input className="field" value={draft.username} onChange={(event) => update("username", event.target.value)} placeholder="username" />

          <FieldLabel label="API Token / PAT" sub="password field" />
          <input className="field" type="password" value={draft.apiToken ?? ""} onChange={(event) => update("apiToken", event.target.value)} placeholder={draft.tokenMasked || "Token is masked and not logged"} />

          <FieldLabel label="Auth Type" sub="JIRA_AUTH_TYPE" />
          <select className="field" value={draft.authType} onChange={(event) => update("authType", event.target.value as ConnectionAuthType)}>
            <option value="bearer">Bearer Token / Personal Access Token</option>
            <option value="basic">Basic Auth</option>
          </select>

          <FieldLabel label="API Version" sub="JIRA_API_VERSION" />
          <select className="field" value={draft.apiVersion} onChange={(event) => update("apiVersion", event.target.value as ConnectionApiVersion)}>
            <option value="v2">Jira Server/Data Center v2</option>
            <option value="v3">Jira Cloud v3</option>
            <option value="auto">Auto Detect</option>
          </select>
        </div>

        <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="min-w-0 rounded-lg border border-line bg-slate-50 p-4 text-sm font-bold text-slate-700">
            Token Source: {draft.tokenSource} {draft.tokenMasked ? `(${draft.tokenMasked})` : ""}<br />
            No Save to Env. No local connection config is written.
          </div>
          <div className="flex min-w-0 flex-wrap gap-3">
            <button className="btn" onClick={handleReloadEnv}><RefreshCw size={16} />Reload Env</button>
            <button className="btn" onClick={handleChooseEnv}><FileInput size={16} />Choose Env File</button>
            <button className="btn btn-primary" onClick={handleTest}><ShieldCheck size={16} />Test Connection</button>
          </div>
        </div>
        {notice ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">{notice}</div> : null}
      </SectionCard>

      <SectionCard className="mt-4" title="Connection Status" subtitle="read-only test result">
        <ResponsiveMetricGrid min={180}>
          <MetricCard label="Authenticated User" sub="user" value={draft.authenticatedUser || "-"} icon={UserCheck} tone="bg-green-50 text-green-600" />
          <MetricCard label="Accessible Projects" sub="projects" value={String(draft.accessibleProjectsCount || 0)} icon={Cloud} />
          <MetricCard label="Auth Type" sub="auth" value={draft.authType === "bearer" ? "Bearer" : "Basic"} icon={ShieldCheck} tone="bg-violet-50 text-violet-600" />
          <MetricCard label="Last Tested" sub="time" value={draft.lastTestedAt || "-"} icon={KeyRound} tone="bg-amber-50 text-amber-600" />
        </ResponsiveMetricGrid>
      </SectionCard>
    </div>
  );
}
