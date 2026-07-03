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
  "/settings": "settings"
};

export function AppLayout() {
  const { pathname } = useLocation();
  const page = pageByPath[pathname] ?? "dashboard";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-app">
      <Sidebar />
      <main className="thin-scroll min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        <div className="mx-auto w-full max-w-[1480px] min-w-0">
          <Outlet />
        </div>
      </main>
      <DebugLogPanel page={page} />
    </div>
  );
}
