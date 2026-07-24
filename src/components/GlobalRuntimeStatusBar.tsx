import { Database, RefreshCw, Server } from "lucide-react";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";

function tone(status: string) {
  if (["CONNECTED", "READY"].includes(status)) return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (status === "CHECKING") return "border-blue-300 bg-blue-50 text-blue-950";
  if (["READY_READ_ONLY", "NOT_CONFIGURED", "MIGRATION_REQUIRED"].includes(status)) return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-rose-300 bg-rose-50 text-rose-950";
}

function shortPath(value: string) {
  if (!value) return "-";
  return value.length > 54 ? `…${value.slice(-53)}` : value;
}

export function GlobalRuntimeStatusBar() {
  const { state, retryJira, retryDatabase } = useRuntimeStatus();
  const { jira, database, capabilities } = state;
  return (
    <section data-testid="global-runtime-status" className="mb-4 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
      <details className={`min-w-0 rounded-lg border p-3 ${tone(jira.status)}`}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-black">
          <Server size={17} aria-hidden="true" />
          <span>Jira ● {jira.status}</span>
          <span className="min-w-0 flex-1 truncate text-xs font-bold">{jira.accountDisplayName || jira.message}</span>
          <button data-testid="retry-jira-status" className="btn px-2 py-1" type="button" disabled={jira.status === "CHECKING"} onClick={(event) => { event.preventDefault(); void retryJira(); }}><RefreshCw size={14} />重試</button>
        </summary>
        <dl className="mt-3 grid grid-cols-[150px_minmax(0,1fr)] gap-1 text-xs font-semibold">
          <dt>Reason Code</dt><dd>{jira.reasonCode}</dd>
          <dt>最後測試</dt><dd>{jira.checkedAt || "-"}</dd>
          <dt>Base URL</dt><dd className="break-all">{jira.baseUrlNormalized || "-"}</dd>
          <dt>Account</dt><dd>{jira.accountDisplayName || jira.username || "-"}</dd>
          <dt>Server Identity</dt><dd className="break-all">{jira.serverIdentity || "-"}</dd>
          <dt>Latency</dt><dd>{jira.latencyMs === null ? "-" : `${jira.latencyMs} ms`}</dd>
        </dl>
      </details>
      <details className={`min-w-0 rounded-lg border p-3 ${tone(database.status)}`}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-black">
          <Database size={17} aria-hidden="true" />
          <span>Database ● {database.status}</span>
          <span className="min-w-0 flex-1 truncate text-xs font-bold" title={database.path}>{shortPath(database.path || database.message)}</span>
          <button data-testid="retry-database-status" className="btn px-2 py-1" type="button" disabled={database.status === "CHECKING"} onClick={(event) => { event.preventDefault(); void retryDatabase(); }}><RefreshCw size={14} />重試</button>
        </summary>
        <dl className="mt-3 grid grid-cols-[150px_minmax(0,1fr)] gap-1 text-xs font-semibold">
          <dt>Reason Code</dt><dd>{database.reasonCode}</dd>
          <dt>最後測試</dt><dd>{database.checkedAt || "-"}</dd>
          <dt>完整路徑</dt><dd className="break-all">{database.path || "-"}</dd>
          <dt>Database ID</dt><dd className="break-all">{database.databaseId || "-"}</dd>
          <dt>Schema</dt><dd>{database.schemaVersion ?? "-"}</dd>
          <dt>Binding</dt><dd className="break-all">{database.sourceBinding || "Unbound"}</dd>
          <dt>能力</dt><dd>讀取 {capabilities.databaseRead ? "可用" : "停用"}／寫入 {capabilities.databaseWrite ? "可用" : "停用"}／匯入 {capabilities.databaseImport ? "可用" : "停用"}</dd>
        </dl>
      </details>
    </section>
  );
}
