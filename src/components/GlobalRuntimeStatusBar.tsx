import { Bell, Bug, Database, Server } from "lucide-react";
import { buildInfo } from "../buildInfo";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";
import { formatDisplayTime } from "../utils/displayTime";

type Props = { debugCount: number; onOpenDebug: () => void };

function dot(status: string) {
  if (["CONNECTED", "ready"].includes(status)) return "bg-emerald-500";
  if (["CHECKING", "connecting", "loading"].includes(status)) return "bg-blue-500";
  if (["NOT_CONFIGURED", "not-configured", "MIGRATION_REQUIRED"].includes(status)) return "bg-amber-500";
  return "bg-rose-500";
}

function jiraStatus(status: string) {
  return status.toLowerCase().replace(/_/g, " ");
}

function databaseStatus(status: string) {
  if (status === "not-configured") return "Not configured";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function GlobalRuntimeStatusBar({ debugCount, onOpenDebug }: Props) {
  const { state, databaseLoadStatus } = useRuntimeStatus();
  return (
    <header className="sticky top-0 z-20 -mx-5 mb-5 border-b border-line bg-white/95 px-5 py-3 backdrop-blur" data-testid="global-runtime-status">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-600">
        <div className="flex items-center gap-2" title={state.jira.message}><Server size={15} /><span className={`h-2 w-2 rounded-full ${dot(state.jira.status)}`} /><span>Jira: {jiraStatus(state.jira.status)}</span></div>
        <div className="flex items-center gap-2" title={state.database.path || state.database.message}><Database size={15} /><span className={`h-2 w-2 rounded-full ${dot(databaseLoadStatus)}`} /><span>Local DB: {databaseStatus(databaseLoadStatus)}</span></div>
        <div className="min-w-0 truncate" title={state.database.checkedAt}>DB Checked: {formatDisplayTime(state.database.checkedAt)}</div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden xl:inline">Build {buildInfo.version} · {buildInfo.buildTime}</span>
          <button className="btn relative px-3 py-2" type="button" onClick={onOpenDebug} data-testid="open-debug-log">{debugCount ? <Bell size={15} /> : <Bug size={15} />}<span>Debug Log</span>{debugCount ? <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white" data-testid="debug-warning-count">{debugCount}</span> : null}</button>
        </div>
      </div>
    </header>
  );
}
