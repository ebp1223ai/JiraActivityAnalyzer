import { NavLink } from "react-router-dom";
import { Activity, BarChart3, Clock3, DatabaseZap, Home, ListChecks, Settings, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { BuildInfo } from "./BuildInfo";

const items = [
  { to: "/", label: "總覽", sub: "Dashboard", icon: Home },
  { to: "/connections", label: "連線與資料來源", sub: "Connections & Data Source", icon: UserRound },
  { to: "/import", label: "資料匯入", sub: "Import", icon: DatabaseZap },
  { to: "/timeline", label: "工作紀錄", sub: "Timeline", icon: Clock3 },
  { to: "/analysis", label: "使用者分析", sub: "Analysis", icon: UsersRound },
  { to: "/jira-analysis", label: "Jira 分析", sub: "Jira Analysis", icon: ListChecks },
  { to: "/jira-probe", label: "Jira 測試", sub: "Jira Probe", icon: ShieldCheck },
  { to: "/settings", label: "設定", sub: "Settings", icon: Settings }
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-[220px] min-w-[220px] max-w-[220px] shrink-0 flex-col overflow-hidden border-r border-line bg-white p-3">
      <div className="mb-5 flex items-center gap-3 px-3 py-2">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <BarChart3 size={22} />
        </span>
        <div className="min-w-0 truncate text-lg font-black text-ink" data-allow-truncate="true" title="Activity Builder">
          Activity Builder
        </div>
      </div>
      <nav className="thin-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
        {items.map(({ to, label, sub, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-w-0 items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold leading-snug transition ${isActive ? "bg-blue-50 text-blue-700" : "text-ink hover:bg-slate-50"}`
            }
          >
            <Icon className="shrink-0" size={21} />
            <span className="min-w-0" data-no-clip="true">
              {label}
              <br />
              <span className="text-xs font-semibold">{sub}</span>
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-line px-4 py-5">
        <BuildInfo />
        <button className="mt-5 flex max-w-full items-center gap-2 text-sm font-black leading-snug text-muted" data-no-clip="true">
          <Activity size={18} />
          <span>收合選單</span>
        </button>
      </div>
    </aside>
  );
}
