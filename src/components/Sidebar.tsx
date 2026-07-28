import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3, ChevronDown, ChevronRight, Database, DatabaseZap,
  RadioTower, Settings, ShieldCheck, UserRound, UsersRound
} from "lucide-react";
import { BuildInfo } from "./BuildInfo";

const groups = [
  {
    label: "總覽 / Overview",
    items: [
      { to: "/connections", label: "Jira 連線", sub: "Jira Connection", icon: UserRound },
      { to: "/database", label: "資料庫總覽", sub: "Database Overview", icon: Database }
    ]
  },
  {
    label: "資料作業 / Collection",
    items: [
      { to: "/collection", label: "資料擷取", sub: "Data Collection", icon: DatabaseZap }
    ]
  },
  {
    label: "檢視器 / Viewers",
    items: [
      { to: "/issues", label: "Issue 檢視", sub: "Issue Viewer", icon: BarChart3 },
      { to: "/users", label: "使用者檢視", sub: "User Viewer", icon: UsersRound }
    ]
  }
];

const advancedItems = [
  { to: "/activity-stream-probe", label: "活動串流測試", sub: "Activity Stream Probe", icon: RadioTower },
  { to: "/jira-probe", label: "Jira 測試", sub: "Jira Probe", icon: ShieldCheck }
];

function NavItem({ item }: { item: typeof groups[number]["items"][number] }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex min-w-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold leading-snug transition ${
          isActive ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-700 hover:bg-slate-50"
        }`
      }
    >
      <Icon className="shrink-0" size={19} />
      <span className="min-w-0" data-no-clip="true">
        {item.label}<br />
        <span className="text-[11px] font-semibold text-current/75">{item.sub}</span>
      </span>
    </NavLink>
  );
}

export function Sidebar() {
  const [advancedOpen, setAdvancedOpen] = useState(true);
  return (
    <aside className="flex h-screen w-[232px] min-w-[232px] max-w-[232px] shrink-0 flex-col overflow-hidden border-r border-line bg-white">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
          <BarChart3 size={20} />
        </span>
        <div className="min-w-0">
          <div className="font-black text-ink">Jira Activity</div>
          <div className="text-xs font-bold text-muted">Analyzer</div>
        </div>
      </div>
      <nav className="thin-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {groups.map((group) => (
          <div className="mb-4" key={group.label}>
            <div className="mb-1 px-3 text-[10px] font-black uppercase text-slate-400">{group.label}</div>
            <div className="space-y-1">{group.items.map((item) => <NavItem key={item.to} item={item} />)}</div>
          </div>
        ))}
        <div className="mb-4">
          <button
            type="button"
            className="mb-1 flex w-full items-center justify-between px-3 py-1 text-left text-[10px] font-black uppercase text-slate-400"
            onClick={() => setAdvancedOpen((value) => !value)}
            aria-expanded={advancedOpen}
          >
            <span>進階工具 / Advanced Tools</span>
            {advancedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {advancedOpen ? <div className="space-y-1">{advancedItems.map((item) => <NavItem key={item.to} item={item} />)}</div> : null}
        </div>
        <NavItem item={{ to: "/settings", label: "設定", sub: "Settings", icon: Settings }} />
      </nav>
      <div className="border-t border-line px-5 py-4"><BuildInfo /></div>
    </aside>
  );
}
