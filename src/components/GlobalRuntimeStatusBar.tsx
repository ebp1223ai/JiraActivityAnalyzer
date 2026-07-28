import { useEffect, useState } from "react";
import { Bell, Bug, Database, Server } from "lucide-react";
import { buildInfo } from "../buildInfo";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";

type Props = {
  debugCount: number;
  onOpenDebug: () => void;
};

function dot(status: string) {
  if (["CONNECTED", "READY", "READY_READ_ONLY"].includes(status)) return "bg-emerald-500";
  if (status === "CHECKING") return "bg-blue-500";
  if (["NOT_CONFIGURED", "MIGRATION_REQUIRED"].includes(status)) return "bg-amber-500";
  return "bg-rose-500";
}

function shortStatus(status: string) {
  return status.toLowerCase().replace(/_/g, " ");
}

export function GlobalRuntimeStatusBar({ debugCount, onOpenDebug }: Props) {
  const { state } = useRuntimeStatus();
  const [lastWrite, setLastWrite] = useState("-");

  useEffect(() => {
    let active = true;
    if (!state.database.canRead) {
      setLastWrite("-");
      return;
    }
    void window.desktopApp?.databaseViewer?.overview().then((result) => {
      const latest = result.latestRun as Record<string, unknown> | undefined;
      if (active) setLastWrite(String(latest?.last_completed_at ?? latest?.lastCompletedAt ?? "-"));
    }).catch(() => {
      if (active) setLastWrite("-");
    });
    return () => { active = false; };
  }, [state.database.canRead, state.database.requestId]);

  return (
    <header className="sticky top-0 z-20 -mx-5 mb-5 border-b border-line bg-white/95 px-5 py-3 backdrop-blur" data-testid="global-runtime-status">
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-600">
        <div className="flex items-center gap-2" title={state.jira.message}>
          <Server size={15} /><span className={`h-2 w-2 rounded-full ${dot(state.jira.status)}`} />
          <span>Jira: {shortStatus(state.jira.status)}</span>
        </div>
        <div className="flex items-center gap-2" title={state.database.path || state.database.message}>
          <Database size={15} /><span className={`h-2 w-2 rounded-full ${dot(state.database.status)}`} />
          <span>Local DB: {shortStatus(state.database.status)}</span>
        </div>
        <div className="min-w-0 truncate" title={lastWrite}>Last DB Write: {lastWrite}</div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden xl:inline">Build {buildInfo.version} · {buildInfo.buildTime}</span>
          <button className="btn relative px-3 py-2" type="button" onClick={onOpenDebug} data-testid="open-debug-log">
            {debugCount ? <Bell size={15} /> : <Bug size={15} />}
            <span>Debug Log</span>
            {debugCount ? <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white" data-testid="debug-warning-count">{debugCount}</span> : null}
          </button>
        </div>
      </div>
    </header>
  );
}
