import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { DebugLogPanel } from "./DebugLogPanel";
import { Sidebar } from "./Sidebar";
import { appendDebugLogLines, clearDebugLogPage, createInitialDebugLogState, type DebugPage } from "../state/debugLogStore";
import { GlobalRuntimeStatusBar } from "./GlobalRuntimeStatusBar";

const pageByPath: Record<string, DebugPage> = {
  "/": "dashboard",
  "/connections": "connections",
  "/database": "dashboard",
  "/collection": "analysis",
  "/issues": "jira",
  "/users": "timeline",
  "/ai-analysis": "analysis",
  "/activity-stream-probe": "precision",
  "/jira-probe": "jiraProbe",
  "/settings": "settings"
};

export type AppOutletContext = {
  appendDebugLog: (page: DebugPage, lines: string[]) => void;
  getDebugLogs: (page: DebugPage) => string[];
};

function warningCount(logs: string[]) {
  return logs.filter((line) => line.includes("[WARN]") || line.includes("[ERROR]")).length;
}

export function AppLayout() {
  const { pathname } = useLocation();
  const page = pageByPath[pathname] ?? "dashboard";
  const mainRef = useRef<HTMLElement>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [logsByPage, setLogsByPage] = useState(createInitialDebugLogState);
  const allLogs = useMemo(() => Object.entries(logsByPage).flatMap(([source, lines]) =>
    lines.map((line) => `[${source}] ${line}`)), [logsByPage]);
  const appendDebugLog = useCallback((targetPage: DebugPage, lines: string[]) => {
    setLogsByPage((current) => appendDebugLogLines(current, targetPage, lines));
  }, []);
  const getDebugLogs = useCallback((targetPage: DebugPage) => logsByPage[targetPage] ?? [], [logsByPage]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
    void window.desktopApp?.userAnalysis?.logAction?.({ category: "USER_ACTION", message: `page_changed path=${pathname}` });
  }, [pathname]);

  return (
    <div className="flex h-screen w-screen max-w-full overflow-hidden bg-app">
      <Sidebar />
      <main ref={mainRef} className="thin-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-6">
        <div className="mx-auto w-full max-w-[1680px] min-w-0">
          <GlobalRuntimeStatusBar debugCount={warningCount(allLogs)} onOpenDebug={() => setDebugOpen(true)} />
          <Outlet context={{
            appendDebugLog,
            getDebugLogs
          } satisfies AppOutletContext} />
        </div>
      </main>
      <DebugLogPanel
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        currentPage={pathname}
        logs={allLogs}
        onClear={() => setLogsByPage(createInitialDebugLogState())}
        onAppend={(lines) => appendDebugLog(page, lines)}
        onUserAction={(message) => {
          appendDebugLog(page, [`[USER_ACTION] ${message}`]);
          void window.desktopApp?.userAnalysis?.logAction?.({ category: "USER_ACTION", message });
        }}
      />
    </div>
  );
}
