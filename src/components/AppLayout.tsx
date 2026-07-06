import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { DebugLogPanel } from "./DebugLogPanel";
import { Sidebar } from "./Sidebar";
import type { debugLogs } from "../data/mockData";

const pageByPath: Record<string, keyof typeof debugLogs> = {
  "/": "dashboard",
  "/connections": "connections",
  "/import": "import",
  "/timeline": "timeline",
  "/analysis": "analysis",
  "/jira-analysis": "jira",
  "/jira-probe": "jiraProbe",
  "/settings": "settings"
};

export type AppOutletContext = {
  appendDebugLog: (page: keyof typeof debugLogs, lines: string[]) => void;
};

export function AppLayout() {
  const { pathname } = useLocation();
  const page = pageByPath[pathname] ?? "dashboard";
  const mainRef = useRef<HTMLElement>(null);
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  const [extraLogsByPage, setExtraLogsByPage] = useState<Partial<Record<keyof typeof debugLogs, string[]>>>({});

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
              setExtraLogsByPage((current) => ({
                ...current,
                [targetPage]: [...(current[targetPage] ?? []), ...lines].slice(-120)
              }));
            }
          } satisfies AppOutletContext} />
        </div>
      </main>
      <DebugLogPanel collapsed={debugCollapsed} onToggle={() => setDebugCollapsed((value) => !value)} page={page} extraLogs={extraLogsByPage[page] ?? []} />
    </div>
  );
}
