import { NavLink } from "react-router-dom";
import { Activity, BarChart3, Clock3, DatabaseZap, Home, ListChecks, Settings, UserRound, UsersRound } from "lucide-react";
import { BuildInfo } from "./BuildInfo";

const items = [
  { to: "/", label: "總覽", sub: "Dashboard", icon: Home },
  { to: "/connections", label: "連線設定", sub: "Connections", icon: UserRound },
  { to: "/import", label: "資料匯入", sub: "Import", icon: DatabaseZap },
  { to: "/timeline", label: "工作紀錄", sub: "Timeline", icon: Clock3 },
  { to: "/analysis", label: "使用者分析", sub: "Analysis", icon: UsersRound },
  { to: "/jira-analysis", label: "Jira 分析", sub: "Jira Analysis", icon: ListChecks },
  { to: "/settings", label: "設定", sub: "Settings", icon: Settings }
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-[235px] shrink-0 flex-col border-r border-line bg-white p-3">
      <div className="mb-5 flex items-center gap-3 px-3 py-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><BarChart3 size={22} /></span>
        <div className="text-lg font-black text-ink">Activity Builder</div>
      </div>
      <nav className="space-y-2">
        {items.map(({ to, label, sub, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition ${isActive ? "bg-blue-50 text-blue-700" : "text-ink hover:bg-slate-50"}`
            }
          >
            <Icon size={22} />
            <span>{label}<br /><span className="text-xs font-semibold">{sub}</span></span>
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-line px-4 py-5">
        <BuildInfo />
        <button className="mt-5 flex items-center gap-2 text-sm font-black text-muted"><Activity size={18} />收合選單</button>
      </div>
    </aside>
  );
}
