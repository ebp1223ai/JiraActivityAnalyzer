import { useState } from "react";
import { Check, Clipboard, Cloud, FileInput, KeyRound, RefreshCw, ShieldCheck, UserCheck } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import type { AppOutletContext } from "../components/AppLayout";
import { useConnectionContext } from "../state/ConnectionContext";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";

function value(input: string | undefined, fallback = "Not configured") {
  return input?.trim() || fallback;
}

function ReadOnlyField({ label, children, title }: { label: string; children: string; title?: string }) {
  return (
    <div className="min-w-0 border-b border-line py-3 last:border-0">
      <div className="mb-1 text-xs font-black text-muted">{label}</div>
      <div className="break-words text-sm font-bold text-slate-800" title={title ?? children}>{children}</div>
    </div>
  );
}

export function ConnectionsPage() {
  const { activeConnection, envStatus, reloadEnv, chooseEnv, testConnection } = useConnectionContext();
  const { state: runtimeState } = useRuntimeStatus();
  const { appendDebugLog } = useOutletContext<AppOutletContext>();
  const [notice, setNotice] = useState("");
  const [testing, setTesting] = useState(false);
  const currentEnvPath = envStatus?.currentEnvPath ?? envStatus?.envPath ?? "Not loaded";
  const connected = activeConnection?.status === "connected";

  async function handleReloadEnv() {
    appendDebugLog("connections", ["[INFO] Reload Env requested", `[INFO] Active ENV: ${currentEnvPath}`]);
    const state = await reloadEnv();
    if (!state) {
      setNotice("Reload Env failed.");
      return;
    }
    appendDebugLog("connections", [
      "[INFO] Env reloaded",
      `[INFO] Active ENV: ${state.env.currentEnvPath ?? state.env.envPath ?? ""}`,
      "[INFO] Authorization: [masked]"
    ]);
    setNotice("已重新載入 Active ENV。/ Active ENV reloaded.");
  }

  async function handleChooseEnv() {
    appendDebugLog("connections", ["[INFO] Choose Env requested"]);
    const response = await chooseEnv();
    if (!response || response.canceled) {
      setNotice("未變更 Active ENV。/ Active ENV unchanged.");
      return;
    }
    appendDebugLog("connections", [
      `[INFO] Active ENV: ${response.state.env.currentEnvPath ?? response.state.env.envPath ?? ""}`,
      "[INFO] Authorization: [masked]"
    ]);
    setNotice("已選擇並載入 Active ENV。/ Active ENV selected and loaded.");
  }

  async function handleTest() {
    if (!activeConnection || testing) return;
    setTesting(true);
    try {
      const result = await testConnection(activeConnection);
      if (!result) {
        setNotice("Jira connection test unavailable.");
        return;
      }
      appendDebugLog("connections", [
        "[INFO] Test Jira Connection requested",
        "[INFO] Authorization: [masked]",
        ...result.logs
      ]);
      setNotice(result.connection.status === "connected"
        ? "Jira 連線測試成功。此操作不會修改 .env。/ Jira connection test passed; .env was not modified."
        : "Jira 連線測試失敗。此操作未修改 .env。/ Jira connection test failed; .env was not modified.");
    } finally {
      setTesting(false);
    }
  }

  async function copyEnvPath() {
    await navigator.clipboard.writeText(currentEnvPath);
    setNotice("已複製 Active ENV 路徑。/ Active ENV path copied.");
  }

  return (
    <div className="min-w-0">
      <PageHeader title="連線設定 / Connections" subtitle="Read-only Jira connection status" connected={connected} />

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Active ENV" subtitle="App does not edit or save Jira credentials">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-900">
            Jira 設定只從目前的 Active ENV 載入。此頁沒有可編輯欄位，也不會修改 `.env`。
            <div className="mt-1 text-xs">Jira settings are read-only. Reload, choose, and connection test do not save credentials.</div>
          </div>
          <div className="mt-3 min-w-0 rounded-md border border-line px-4">
            <ReadOnlyField label="Active ENV" title={currentEnvPath}>{currentEnvPath}</ReadOnlyField>
            <ReadOnlyField label="Jira Base URL">{value(activeConnection?.baseUrl)}</ReadOnlyField>
            <ReadOnlyField label="Email">{value(activeConnection?.email)}</ReadOnlyField>
            <ReadOnlyField label="Username">{value(activeConnection?.username)}</ReadOnlyField>
            <ReadOnlyField label="API Token / PAT">{activeConnection?.tokenMasked || "[masked]"}</ReadOnlyField>
            <ReadOnlyField label="Auth Type / API Version">
              {`${value(activeConnection?.authType)} / ${value(activeConnection?.apiVersion)}`}
            </ReadOnlyField>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn" type="button" onClick={() => void handleReloadEnv()}><RefreshCw size={16} />Reload Env</button>
            <button className="btn" type="button" onClick={() => void handleChooseEnv()}><FileInput size={16} />Choose Env</button>
            <button className="btn" type="button" onClick={() => void copyEnvPath()}><Clipboard size={16} />Copy Path</button>
          </div>
        </SectionCard>

        <SectionCard title="Jira 連線測試 / Test Jira Connection" subtitle="Read-only authentication and server metadata check">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <StatusBadge tone={connected ? "green" : activeConnection?.status === "failed" ? "red" : "gray"}>
              {activeConnection?.status ?? "not_tested"}
            </StatusBadge>
            <button className="btn btn-primary" type="button" disabled={!activeConnection || testing} onClick={() => void handleTest()}>
              {testing ? <RefreshCw className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
              Test Jira Connection
            </button>
          </div>
          <div className="min-w-0 rounded-md border border-line px-4">
            <ReadOnlyField label="Jira Server">{value(runtimeState.jira.serverTitle, "Unverified")}</ReadOnlyField>
            <ReadOnlyField label="Authenticated User">{value(activeConnection?.authenticatedUser, "Not tested")}</ReadOnlyField>
            <ReadOnlyField label="Accessible Projects">{String(activeConnection?.accessibleProjectsCount ?? 0)}</ReadOnlyField>
            <ReadOnlyField label="Last Tested">{value(activeConnection?.lastTestedAt, "Not tested")}</ReadOnlyField>
          </div>
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
            此測試只驗證 Jira 連線與伺服器資訊，不檢查 SQLite、Database Path、Schema、Integrity 或 Issue Snapshot。
          </div>
        </SectionCard>
      </div>

      {notice ? <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900"><Check className="mt-0.5 shrink-0" size={16} />{notice}</div> : null}

      <SectionCard className="mt-4" title="連線狀態 / Connection Status">
        <ResponsiveMetricGrid min={180}>
          <MetricCard label="Authenticated User" sub="Jira identity" value={activeConnection?.authenticatedUser || "-"} icon={UserCheck} tone="bg-green-50 text-green-600" />
          <MetricCard label="Accessible Projects" sub="Project count" value={String(activeConnection?.accessibleProjectsCount ?? 0)} icon={Cloud} />
          <MetricCard label="Auth Type" sub="Authentication" value={activeConnection?.authType === "basic" ? "Basic" : "Bearer"} icon={ShieldCheck} tone="bg-violet-50 text-violet-600" />
          <MetricCard label="Jira Server" sub={runtimeState.jira.serverTitleStatus} value={runtimeState.jira.serverTitle || "-"} icon={Cloud} />
          <MetricCard label="Last Tested" sub="Connection test" value={activeConnection?.lastTestedAt || "-"} icon={KeyRound} tone="bg-amber-50 text-amber-600" />
        </ResponsiveMetricGrid>
      </SectionCard>
    </div>
  );
}
