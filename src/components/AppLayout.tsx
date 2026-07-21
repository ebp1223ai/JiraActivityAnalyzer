import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { DebugLogPanel } from "./DebugLogPanel";
import { Sidebar } from "./Sidebar";
import { appendDebugLogLines, clearDebugLogPage, createInitialDebugLogState, type DebugPage } from "../state/debugLogStore";

const pageByPath: Record<string, DebugPage> = {
  "/": "dashboard",
  "/connections": "connections",
  "/import": "import",
  "/timeline": "timeline",
  "/analysis": "analysis",
  "/precision-probe": "precision",
  "/jira-analysis": "jira",
  "/jira-probe": "jiraProbe",
  "/settings": "settings"
};

export type AppOutletContext = {
  appendDebugLog: (page: DebugPage, lines: string[]) => void;
  getDebugLogs: (page: DebugPage) => string[];
};

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const page = pageByPath[pathname] ?? "dashboard";
  const mainRef = useRef<HTMLElement>(null);
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  const [logsByPage, setLogsByPage] = useState(createInitialDebugLogState);
  const [recovery, setRecovery] = useState<Record<string, unknown> | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void window.desktopApp?.userAnalysis?.scanFullFetchStaging?.().then((result) => {
      if (active && result?.found && result.state) setRecovery(result as unknown as Record<string, unknown>);
    }).catch((error) => console.error("Full Fetch staging recovery scan failed", error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!window.desktopApp?.uiSmoke) return;
    const seed = (event: Event) => setRecovery((event as CustomEvent<Record<string, unknown>>).detail);
    const clear = () => setRecovery(null);
    window.addEventListener("jaa:seed-full-fetch-recovery", seed);
    window.addEventListener("jaa:clear-full-fetch-recovery", clear);
    return () => { window.removeEventListener("jaa:seed-full-fetch-recovery", seed); window.removeEventListener("jaa:clear-full-fetch-recovery", clear); };
  }, []);

  async function recoveryAction(action: "resume" | "export_completed" | "discard" | "decide_later") {
    const state = recovery?.state as Record<string, unknown> | undefined;
    const stagingId = String(state?.stagingId ?? "");
    if (!stagingId) return;
    if (action === "discard" && !window.confirm("Discard this Full Fetch staging? This cannot be undone.\n確定捨棄此 Full Fetch 暫存？此操作無法復原。")) return;
    setRecoveryBusy(true);
    try {
      const result = await window.desktopApp?.userAnalysis?.fullFetchStagingAction?.({ stagingId, action });
      if (!result?.ok) throw new Error(String(result?.error ?? "Recovery action failed."));
      if (action === "resume") {
        sessionStorage.setItem("jaa.resumeFullFetchStagingId", stagingId);
        navigate("/analysis");
      } else if (action === "decide_later") {
        sessionStorage.setItem("jaa.unresolvedFullFetchStagingId", stagingId);
      }
      setRecovery(null);
    } catch (error) {
      console.error("Full Fetch staging recovery action failed", error);
    } finally { setRecoveryBusy(false); }
  }

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pathname]);

  return (
    <div className="flex h-screen w-screen max-w-full overflow-hidden bg-app">
      <Sidebar />
      <main ref={mainRef} className="thin-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        <div className="mx-auto w-full max-w-[1480px] min-w-0">
          <Outlet context={{
            appendDebugLog: (targetPage, lines) => {
              setLogsByPage((current) => appendDebugLogLines(current, targetPage, lines));
            },
            getDebugLogs: (targetPage) => logsByPage[targetPage] ?? []
          } satisfies AppOutletContext} />
        </div>
      </main>
      <DebugLogPanel
        currentPage={pathname}
        collapsed={debugCollapsed}
        onToggle={() => setDebugCollapsed((value) => !value)}
        logs={logsByPage[page]}
        onClear={() => setLogsByPage((current) => clearDebugLogPage(current, page))}
        onAppend={(lines) => setLogsByPage((current) => appendDebugLogLines(current, page, lines))}
        onUserAction={(message) => {
          setLogsByPage((current) => appendDebugLogLines(current, page, [`[USER_ACTION] ${message}`]));
          void window.desktopApp?.userAnalysis?.logAction?.({ category: "USER_ACTION", message });
        }}
      />
      {recovery ? (() => {
        const state = recovery.state as Record<string, unknown>;
        return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" data-testid="full-fetch-recovery-modal">
          <div className="w-full max-w-2xl rounded-lg border border-amber-300 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3"><AlertTriangle className="mt-1 shrink-0 text-amber-600" size={22} /><div className="min-w-0"><h2 className="text-xl font-black text-ink">Incomplete Full Fetch Found / 發現未完成的 Full Fetch</h2><p className="mt-1 text-sm font-semibold text-muted">No Jira request will be sent until you choose Resume. / 在您選擇繼續前，不會送出 Jira 請求。</p></div></div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[['User / 使用者', state.selectedUser], ['Updated / 更新時間', state.updatedAt], ['Completed / 已完成', `${state.completed}/${state.total}`], ['Remaining / 剩餘', state.remaining], ['Eligible / 可匯入', state.eligible], ['Partial / 部分完成', state.partial], ['Failed / 失敗', state.failed], ['Last Jira / 最後 Jira', state.lastCompletedObjectKey || '-']].map(([label, value]) => <div key={String(label)} className="min-w-0 rounded-md border border-line bg-slate-50 p-2"><div className="text-xs font-black text-muted">{String(label)}</div><div className="mt-1 break-words font-bold text-ink" data-no-clip="true">{String(value ?? '-')}</div></div>)}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="btn" disabled={recoveryBusy} onClick={() => void recoveryAction('decide_later')}>Decide Later / 稍後決定</button>
              <button className="btn" disabled={recoveryBusy} onClick={() => void recoveryAction('discard')}>Discard Staging / 捨棄暫存</button>
              <button className="btn" disabled={recoveryBusy || Number(state.eligible ?? 0) === 0} onClick={() => void recoveryAction('export_completed')}>Export Completed Records / 匯出已完成資料</button>
              <button className="btn btn-primary" disabled={recoveryBusy || Number(state.remaining ?? 0) === 0} onClick={() => void recoveryAction('resume')}>Resume Remaining Queue / 繼續剩餘佇列</button>
            </div>
          </div>
        </div>;
      })() : null}
    </div>
  );
}
