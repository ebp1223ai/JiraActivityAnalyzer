import { useEffect, useState } from "react";
import { Cloud, Database, FileInput, KeyRound, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { FieldLabel } from "../components/FormControls";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useConnectionContext } from "../state/ConnectionContext";
import { globalDataSourceMode } from "../data/dataSource";
import type { AppOutletContext } from "../components/AppLayout";
import type { ConnectionApiVersion, ConnectionAuthType, JiraConnection } from "../types/connection";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";

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
  const { state: runtimeState, selectExistingDatabase, createNewDatabase } = useRuntimeStatus();
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
      "[INFO] Global Data Source Mode: Live Jira API",
      "[INFO] Local Database mode: disabled / coming later",
      "[INFO] Reload Env requested",
      `[INFO] Current Env Path: ${envStatus?.currentEnvPath ?? envStatus?.envPath ?? ""}`
    ]);
    const state = await reloadEnv();
    if (!state) return;
    setDraft({ ...state.activeConnection });
    const envPath = state.env.currentEnvPath ?? state.env.envPath ?? "";
    appendDebugLog("connections", [
      state.env.status === "created" ? "[WARN] Env file not found" : "[INFO] Env loaded successfully",
      state.env.status === "created" ? "[INFO] Default env file created" : `[INFO] Env path: ${envPath}`,
      "[INFO] Credential status: present (masked)"
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
      "[INFO] Credential status: present (masked)"
    ]);
    setNotice("Env file selected and loaded.");
  }

  async function handleTest() {
    const result = await testAndSaveConnection(draft);
    if (!result) return;
    setDraft(result.connection);
    appendDebugLog("connections", result.logs);
    setNotice(result.saved
      ? "Connection test succeeded and .env was updated atomically. / 連線測試成功，已原子更新 .env。"
      : `Connection test failed (${result.runtime.reasonCode}); .env was not changed. / 連線測試失敗，未修改 .env。`);
  }

  async function handleSelectDatabase() {
    const result = await selectExistingDatabase();
    if (!result || result.canceled) {
      setNotice("Database selection cancelled. / 已取消選擇資料庫。");
      return;
    }
    setNotice(result.saved
      ? "Current Database validated and saved. / 資料庫驗證成功並已設為目前資料庫。"
      : `Database was not changed: ${result.validation?.reasonCode ?? result.error ?? "validation failed"}.`);
  }

  async function handleCreateDatabase() {
    const result = await createNewDatabase();
    if (!result || result.canceled) {
      setNotice("Database creation cancelled. / 已取消建立資料庫。");
      return;
    }
    setNotice(result.saved
      ? "Source Archive Database created and selected. / 來源封存資料庫已建立並選用。"
      : `Database was not created: ${result.error ?? "validation failed"}.`);
  }

  const currentEnvPath = envStatus?.currentEnvPath ?? envStatus?.envPath ?? "Env status not loaded";

  return (
    <div className="min-w-0">
      <PageHeader title="連線與資料來源" subtitle="Connections & Data Source" />

      <SectionCard className="mb-4" title="Global Data Source Mode" subtitle="全域資料來源模式">
        <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
          <div className="min-w-0 rounded-lg border-2 border-blue-500 bg-blue-50 p-4">
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
              <Cloud className="shrink-0 text-blue-600" />
              <div className="font-black text-ink">Live Jira API / 即時 Jira 查詢</div>
              <StatusBadge>Available / 可使用</StatusBadge>
              <StatusBadge tone="green">Selected / 目前使用中</StatusBadge>
            </div>
            <p className="text-sm font-semibold leading-relaxed text-blue-800">
              Use the current .env Jira connection to query Jira in real time.
            </p>
            <div className="mt-3 text-xs font-black uppercase text-blue-700">Global Data Source Mode: {globalDataSourceMode.label}</div>
          </div>
          <div className="min-w-0 rounded-lg border border-line bg-slate-100 p-4 opacity-75">
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
              <Database className="shrink-0 text-slate-500" />
              <div className="font-black text-ink">Local Database / 本機資料庫</div>
              <StatusBadge tone="gray">Coming later / 尚未啟用</StatusBadge>
              <StatusBadge tone="gray">Disabled</StatusBadge>
            </div>
            <p className="text-sm font-semibold leading-relaxed text-muted">
              Analyze previously imported local database records. This mode is planned but not available yet.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Live Jira API Settings" subtitle="即時 Jira 設定">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-3 text-xl font-black">
            <Cloud className="shrink-0 text-blue-600" />
            <span className="truncate">Jira .env Connection</span>
          </h2>
          <StatusBadge tone={draft.status === "connected" ? "green" : draft.status === "failed" ? "red" : "gray"}>{draft.status}</StatusBadge>
        </div>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-relaxed text-blue-800">
          <div className="font-black">Runtime reads one .env file only. / 執行階段只讀取單一 .env。</div>
          <div>Test Connection writes edited Jira keys only after a successful test; comments and unknown keys are preserved.</div>
          <div>連線測試成功後才會更新 Jira 欄位，既有註解與未知欄位會保留。</div>
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
            Successful Test saves to .env atomically. Failed Test never changes .env.<br />
            成功測試才原子寫入 .env；失敗測試不修改設定。
          </div>
          <div className="flex min-w-0 flex-wrap gap-3">
            <button className="btn" onClick={handleReloadEnv}><RefreshCw size={16} />Reload Env</button>
            <button className="btn" onClick={handleChooseEnv}><FileInput size={16} />Choose Env File</button>
            <button className="btn btn-primary" onClick={handleTest}><ShieldCheck size={16} />Test Connection</button>
          </div>
        </div>
        {notice ? <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">{notice}</div> : null}
      </SectionCard>

      <SectionCard className="mt-4" title="Current Local Database" subtitle="目前本機 Source Archive Database">
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 rounded-lg border border-line bg-slate-50 p-4 text-sm font-semibold leading-relaxed">
            <div><b>Status：</b>{runtimeState.database.status}</div>
            <div><b>Reason Code：</b>{runtimeState.database.reasonCode}</div>
            <div className="break-all"><b>Resolved Path：</b>{runtimeState.database.path || "-"}</div>
            <div className="break-all"><b>Database ID：</b>{runtimeState.database.databaseId || "-"}</div>
            <div><b>Schema Version：</b>{runtimeState.database.schemaVersion ?? "-"}</div>
            <div className="break-all"><b>Source Binding：</b>{runtimeState.database.sourceBinding || "Unbound"}</div>
            <div><b>Read／Write：</b>{runtimeState.database.canRead ? "Read" : "No Read"}／{runtimeState.database.canWrite ? "Write" : "No Write"}</div>
            {runtimeState.database.status === "MIGRATION_REQUIRED" ? <div className="mt-2 text-amber-800">Migration is required; v0.2.37 only reports this status and does not migrate.</div> : null}
            {runtimeState.database.status === "JIRA_INSTANCE_MISMATCH" ? <div className="mt-2 text-rose-800">Offline read remains available, but importing the current Jira instance is disabled.</div> : null}
          </div>
          <div className="flex flex-wrap content-start gap-3 lg:max-w-[260px]">
            <button data-testid="select-existing-database" className="btn" type="button" onClick={handleSelectDatabase}><FileInput size={16} />Select Existing／選擇既有</button>
            <button data-testid="create-new-database" className="btn btn-primary" type="button" onClick={handleCreateDatabase}><Database size={16} />Create New／建立新資料庫</button>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900">
          Relative paths resolve from APP_ROOT; external absolute paths remain external. Validation is read-only and never migrates, repairs, creates, switches, or edits .env on failure.<br />
          相對路徑以 APP_ROOT 為基準；外部絕對路徑保持原位置。驗證失敗時不遷移、不修復、不建立、不切換，也不修改 .env。
        </div>
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
