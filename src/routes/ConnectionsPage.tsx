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
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import type { AppOutletContext } from "../components/AppLayout";
import type { ConnectionApiVersion, ConnectionAuthType, JiraConnection } from "../types/connection";

function emptyConnection(): JiraConnection {
  return {
    id: "env-jira-connection",
    name: "Current .env Jira Connection",
    baseUrl: "",
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
  const { activeConnection, envStatus, reloadEnv, chooseEnv, testAndSaveConnection } = useConnectionContext();
  const { state: runtimeState } = useRuntimeStatus();
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
    appendDebugLog("connections", [
      "[INFO] Reload Env requested",
      `[INFO] Current Env Path: ${envStatus?.currentEnvPath ?? envStatus?.envPath ?? ""}`
    ]);
    const state = await reloadEnv();
    if (!state) return;
    setDraft({ ...state.activeConnection });
    const envPath = state.env.currentEnvPath ?? state.env.envPath ?? "";
    appendDebugLog("connections", [
      state.env.status === "created" ? "[WARN] Env file not found; default file created" : "[INFO] Env loaded successfully",
      `[INFO] Env path: ${envPath}`,
      "[INFO] Credential status: present (masked)"
    ]);
    setNotice(state.env.status === "created"
      ? "已建立並載入預設 .env。 / Default .env created and loaded."
      : "已重新載入 .env。 / Env reloaded.");
  }

  async function handleChooseEnv() {
    appendDebugLog("connections", ["[INFO] Choose Env File requested"]);
    const response = await chooseEnv();
    if (!response) return;
    if (response.canceled) {
      setNotice("已取消選擇 .env。 / Env selection cancelled.");
      return;
    }
    setDraft({ ...response.state.activeConnection });
    appendDebugLog("connections", [
      `[INFO] Env file selected: ${response.state.env.currentEnvPath ?? response.state.env.envPath ?? ""}`,
      "[INFO] Credential status: present (masked)"
    ]);
    setNotice("已選取並載入 .env。 / Env selected and loaded.");
  }

  async function handleTest() {
    const result = await testAndSaveConnection(draft);
    if (!result) return;
    setDraft(result.connection);
    appendDebugLog("connections", result.logs);
    setNotice(result.saved
      ? "連線測試成功，已安全更新 .env。 / Connection succeeded; .env updated atomically."
      : `連線測試失敗（${result.runtime.reasonCode}），.env 未變更。 / Test failed; .env unchanged.`);
  }

  const currentEnvPath = envStatus?.currentEnvPath ?? envStatus?.envPath ?? "尚未載入 / Not loaded";
  const connected = draft.status === "connected";

  return (
    <div className="min-w-0">
      <PageHeader title="Jira 連線" subtitle="Jira Connection" connected={connected} />

      <SectionCard title="Jira API 連線設定" subtitle="Jira API Connection Settings">
        <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-3 text-xl font-black">
            <Cloud className="shrink-0 text-blue-600" />
            <span>Jira .env Connection</span>
          </h2>
          <StatusBadge tone={connected ? "green" : draft.status === "failed" ? "red" : "gray"}>
            {draft.status}
          </StatusBadge>
        </div>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-relaxed text-blue-900">
          <div className="font-black">執行期間只讀取一個 .env；憑證永遠遮罩顯示。</div>
          <div>Only one .env is active at runtime. Credentials are always masked.</div>
          <div className="mt-2 break-all"><b>Current Env Path:</b> {currentEnvPath}</div>
          <div className="break-all"><b>Default Env Path:</b> {envStatus?.defaultEnvPath ?? "-"}</div>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <FieldLabel label="Jira Base URL" sub="JIRA_BASE_URL" />
          <input className="field" value={draft.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} />

          <FieldLabel label="Email" sub="JIRA_EMAIL" />
          <input className="field" value={draft.email} onChange={(event) => update("email", event.target.value)} placeholder="email@example.com" />

          <FieldLabel label="Username" sub="JIRA_USERNAME" />
          <input className="field" value={draft.username} onChange={(event) => update("username", event.target.value)} placeholder="username" />

          <FieldLabel label="API Token / PAT" sub="password field" />
          <input className="field" type="password" value={draft.apiToken ?? ""} onChange={(event) => update("apiToken", event.target.value)} placeholder={draft.tokenMasked || "Token is masked"} />

          <FieldLabel label="Auth Type" sub="JIRA_AUTH_TYPE" />
          <select className="field" value={draft.authType} onChange={(event) => update("authType", event.target.value as ConnectionAuthType)}>
            <option value="bearer">Bearer Token / Personal Access Token</option>
            <option value="basic">Basic Auth</option>
          </select>

          <FieldLabel label="API Version" sub="JIRA_API_VERSION" />
          <select className="field" value={draft.apiVersion} onChange={(event) => update("apiVersion", event.target.value as ConnectionApiVersion)}>
            <option value="v2">Jira Server / Data Center v2</option>
            <option value="v3">Jira Cloud v3</option>
            <option value="auto">Auto Detect</option>
          </select>
        </div>

        <div className="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="min-w-0 text-sm font-semibold text-muted">
            成功測試才更新 Jira 設定；失敗不修改 .env。 / Failed tests never modify .env.
          </div>
          <div className="flex min-w-0 flex-wrap gap-3">
            <button className="btn" type="button" onClick={() => void handleReloadEnv()}><RefreshCw size={16} />Reload Env</button>
            <button className="btn" type="button" onClick={() => void handleChooseEnv()}><FileInput size={16} />Choose Env</button>
            <button className="btn btn-primary" type="button" onClick={() => void handleTest()}><ShieldCheck size={16} />Test Connection</button>
          </div>
        </div>
        {notice ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-800">{notice}</div> : null}
      </SectionCard>

      <SectionCard className="mt-4" title="Jira 連線狀態" subtitle="Connection Status">
        <ResponsiveMetricGrid min={180}>
          <MetricCard label="Authenticated User" sub="已驗證使用者" value={draft.authenticatedUser || "-"} icon={UserCheck} tone="bg-green-50 text-green-600" />
          <MetricCard label="Accessible Projects" sub="可存取專案" value={String(draft.accessibleProjectsCount || 0)} icon={Cloud} />
          <MetricCard label="Auth Type" sub="認證方式" value={draft.authType === "bearer" ? "Bearer" : "Basic"} icon={ShieldCheck} tone="bg-violet-50 text-violet-600" />
          <MetricCard label="Jira Server" sub={runtimeState.jira.serverTitleStatus === "verified" ? "verified" : "unverified"} value={runtimeState.jira.serverTitle || "-"} icon={Cloud} />
          <MetricCard label="Last Tested" sub="最後測試" value={draft.lastTestedAt || "-"} icon={KeyRound} tone="bg-amber-50 text-amber-600" />
        </ResponsiveMetricGrid>
        <div className="mt-4 rounded-lg border border-line bg-slate-50 p-3 text-sm font-semibold text-slate-700">
          <b>Remote Links：</b>預設關閉，於每次 Data Collection 執行時明確選擇。 / Default OFF; selected per collection run.
        </div>
      </SectionCard>
    </div>
  );
}
