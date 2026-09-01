import { useEffect, useState } from "react";
import { Bell, Bug, BrainCircuit, Combine, Database, Server } from "lucide-react";
import { buildInfo } from "../buildInfo";
import { useRuntimeStatus } from "../state/RuntimeStatusContext";

type Props = { debugCount: number; onOpenDebug: () => void };
type AiSnapshot = { lifecycleState?: string; recordCount?: number; matchedCount?: number; databasePath?: string; message?: string };
function tone(value: string) {
  const status = value.split(" · ")[0];
  if (["CONNECTED", "ready", "READY", "READY_EMPTY", "READY_WITH_DATA"].includes(status)) return "bg-emerald-500";
  if (["CHECKING", "connecting", "loading", "CREATING", "IMPORTING", "PREFLIGHTING"].includes(status)) return "bg-blue-500";
  if (["NOT_CONFIGURED", "not-configured", "NOT_SELECTED", "NOT_CREATED", "FILE_NOT_FOUND", "READY_NO_MATCH", "READY_PARTIAL", "BLOCKED_AI_DB"].includes(status)) return "bg-amber-500";
  return "bg-rose-500";
}
function Status({ icon: Icon, label, state, title }: { icon: typeof Server; label: string; state: string; title?: string }) {
  return <div className="flex min-w-0 items-center gap-2" title={title || state}><Icon className="shrink-0" size={15} /><span className={`h-2 w-2 shrink-0 rounded-full ${tone(state)}`} /><span className="whitespace-nowrap">{label}: {state.replace(/_/g, " ")}</span></div>;
}
export function GlobalRuntimeStatusBar({ debugCount, onOpenDebug }: Props) {
  const { state, databaseLoadStatus } = useRuntimeStatus();
  const [ai, setAi] = useState<AiSnapshot>({ lifecycleState: "CHECKING" });
  useEffect(() => {
    let active = true;
    const refresh = async () => { const result = await window.desktopApp?.aiDatabase?.lifecycle({ requestId: `global-${Date.now()}` }); if (active && result?.snapshot) setAi(result.snapshot as AiSnapshot); };
    void refresh(); const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const jira = state.jira.status;
  const raw = databaseLoadStatus === "ready" ? "READY" : databaseLoadStatus === "not-configured" ? "NOT_CREATED" : databaseLoadStatus === "error" ? "ERROR" : databaseLoadStatus.toUpperCase();
  const aiState = ai.lifecycleState ?? "CHECKING", records = Number(ai.recordCount ?? 0), matched = Number(ai.matchedCount ?? 0);
  const integration = raw !== "READY" ? "BLOCKED_RAW_DB" : !["READY_EMPTY", "READY_WITH_DATA"].includes(aiState) ? "BLOCKED_AI_DB" : records > 0 && matched === 0 ? "READY_NO_MATCH" : matched < records ? "READY_PARTIAL" : "READY";
  return <header className="sticky top-0 z-20 -mx-5 mb-5 border-b border-line bg-white/95 px-5 py-3 backdrop-blur" data-testid="global-runtime-status">
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-600">
      <Status icon={Server} label="Jira" state={jira} title={state.jira.message} />
      <Status icon={Database} label="原始 DB" state={raw} title={state.database.path || state.database.message} />
      <Status icon={BrainCircuit} label="AI DB" state={aiState + (records ? ` · ${records}` : "")} title={ai.databasePath || ai.message} />
      <Status icon={Combine} label="整合" state={integration + (records ? ` · ${matched}/${records}` : "")} />
      <div className="ml-auto flex items-center gap-3"><span className="hidden xl:inline">Build {buildInfo.version} · {buildInfo.buildTime}</span><button className="btn relative px-3 py-2" type="button" onClick={onOpenDebug} data-testid="open-debug-log">{debugCount ? <Bell size={15} /> : <Bug size={15} />}<span>Debug Log</span>{debugCount ? <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] text-white" data-testid="debug-warning-count">{debugCount}</span> : null}</button></div>
    </div>
  </header>;
}