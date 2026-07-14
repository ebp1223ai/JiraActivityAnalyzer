import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
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
  const page = pageByPath[pathname] ?? "dashboard";
  const mainRef = useRef<HTMLElement>(null);
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  const [logsByPage, setLogsByPage] = useState(createInitialDebugLogState);

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
    </div>
  );
}
