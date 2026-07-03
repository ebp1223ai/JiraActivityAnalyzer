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
    <div className="flex min-h-screen bg-app">
      <Sidebar />
      <main className="thin-scroll h-screen flex-1 overflow-auto p-4">
        <Outlet />
      </main>
      <DebugLogPanel page={page} />
    </div>
  );
}
