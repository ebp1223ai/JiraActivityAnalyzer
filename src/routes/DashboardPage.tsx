import { useState } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Database, FolderOpen, HeartPulse, Layers3, MessageSquare, Paperclip, RefreshCw, Users } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { MockModal } from "../components/FormControls";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { buildInfo } from "../buildInfo";
import { activeUsers, db, eventTypes, projectActivity, syncRuns, trend } from "../data/mockData";

const databaseDetails = [
  ["Database Name", db.name],
  ["Database ID", db.id],
  ["Source Type", "Live"],
  ["Source Backup", "None"],
  ["Created At", db.createdAt],
  ["Restored At", "-"],
  ["Last Backup Time", db.lastBackup],
  ["Database Path", "data/jira_analyzer.db"],
  ["Schema Version", "2026.07.static-ui"],
  ["App Version", buildInfo.version],
  ["Build Time", buildInfo.buildTime]
];

export function DashboardPage() {
  const [showDbModal, setShowDbModal] = useState(false);

  return (
    <div className="min-w-0">
      <PageHeader title="總覽" subtitle="Dashboard" />
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        <MetricCard label="最後同步時間" sub="Last Sync Time" value="2026/07/03 15:43:21" icon={RefreshCw} />
        <MetricCard label="連線狀態" sub="Connection Status" value="已連線" icon={Activity} tone="bg-green-50 text-green-600" />
        <div className="card p-4">
          <div className="flex gap-3">
            <Database className="shrink-0 text-blue-600" />
            <div className="min-w-0">
              <div className="font-black">目前資料庫</div>
              <div className="text-xs font-bold text-muted">Current Database</div>
            </div>
          </div>
          <div className="mt-4 text-xl font-black">{db.name}</div>
          <div className="text-sm font-semibold text-muted">ID: {db.id}</div>
          <div className="text-sm font-semibold text-muted">Source Type: Live</div>
          <div className="text-sm font-semibold text-muted">Source Backup: None</div>
          <div className="text-sm font-semibold text-muted">Restored At: -</div>
          <div className="text-sm font-semibold text-muted">Last Backup: {db.lastBackup}</div>
          <button className="mt-3 text-sm font-black text-blue-600" onClick={() => setShowDbModal(true)}>
            檢視詳情 / Details
          </button>
        </div>
        <MetricCard label="已索引事件總數" sub="Total Indexed Events" value="1,248,356" icon={Layers3} tone="bg-violet-50 text-violet-600" />
        <MetricCard label="專案數" sub="Active Projects" value="48" icon={FolderOpen} />
        <MetricCard label="追蹤使用者數" sub="Tracked Users" value="1,287" icon={Users} tone="bg-violet-50 text-violet-600" />
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <HeartPulse className="shrink-0 text-green-600" />
            <div>
              <div className="font-black">資料庫健康度</div>
              <div className="text-xs font-bold text-muted">Database Health</div>
            </div>
          </div>
          <div className="mt-3 text-lg font-black text-green-600">Good</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[34%] bg-green-500" /></div>
          <div className="mt-2 text-sm font-semibold text-muted">使用中 {db.size} / {db.capacity} (34.2%)</div>
        </div>
      </div>
      <div className="mt-3 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
        {[
          ["總事件數", "Total Events", "1.25M", Activity],
          ["匯入 Issue 數", "Imported Issues", "356,892", Database],
          ["使用者數", "Users", "1,287", Users],
          ["評論數", "Comments", "412,651", MessageSquare],
          ["附件數", "Attachments", "198,324", Paperclip],
          ["狀態變更數", "Status Changes", "279,463", RefreshCw]
        ].map(([label, sub, value, icon]) => (
          <MetricCard key={label as string} label={label as string} sub={sub as string} value={value as string} icon={icon as typeof Activity} />
        ))}
      </div>
      <div className="mt-3 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-3">
        <SectionCard title="活動趨勢" subtitle="Activity Trend" action={<select className="field w-28"><option>Daily</option></select>}>
          <div className="h-56 min-w-0">
            <ResponsiveContainer>
              <AreaChart data={trend}>
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="total" stroke="#2563eb" fill="#dbeafe" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="事件類型分布" subtitle="Event Type Breakdown">
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
            <div className="h-56 min-w-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={eventTypes} dataKey="value" innerRadius={55} outerRadius={90}>
                    {eventTypes.map((e) => <Cell key={e.name} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 space-y-2 text-sm font-semibold">
              {eventTypes.map((e) => (
                <div key={e.name} className="flex min-w-0 justify-between gap-3">
                  <span className="truncate"><span style={{ color: e.color }}>●</span> {e.name}</span>
                  <span>{Math.round((e.value / 1248356) * 1000) / 10}%</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
        <SectionCard title="專案活動" subtitle="Project Activity">
          <DataTable headers={["專案名稱", "事件數", "Issue 數", "更新時間"]} rows={projectActivity} />
        </SectionCard>
        <SectionCard title="Jira 活躍使用者" subtitle="Jira Active Users">
          <DataTable headers={["使用者", "事件數", "更新數", "最後活動"]} rows={activeUsers} />
        </SectionCard>
        <SectionCard title="最近同步記錄" subtitle="Recent Sync Runs">
          <DataTable headers={["開始時間", "狀態", "事件", "新增", "略過", "失敗", "時間"]} rows={syncRuns.map((r) => [r[0], <StatusBadge key={r[0]}>成功</StatusBadge>, ...r.slice(2)])} />
        </SectionCard>
        <SectionCard title="系統健康狀態" subtitle="System Health">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {["Pending Jobs|3", "Avg Import Duration|00:02:08", "Last Successful Import|2026/07/03 15:43:21", "Index Size|68.4 GB", "Recent Warnings|0", "Last Backup Time|2026/07/03 15:42:18"].map((item) => {
              const [a, b] = item.split("|");
              return <div key={a} className="rounded-lg border border-line p-4 text-center"><div className="text-xs font-bold text-muted">{a}</div><div className="mt-2 text-xl font-black">{b}</div></div>;
            })}
          </div>
        </SectionCard>
      </div>

      {showDbModal ? (
        <MockModal
          title="Current Database Details"
          onClose={() => setShowDbModal(false)}
          footer={<button className="btn btn-primary" onClick={() => setShowDbModal(false)}>Close</button>}
        >
          <div className="space-y-2">
            {databaseDetails.map(([label, value]) => (
            <div key={label} className="flex min-w-0 justify-between gap-4 rounded-md bg-slate-50 px-3 py-2">
                <span className="shrink-0 font-black text-muted">{label}</span>
                <span className="min-w-0 truncate text-right font-black text-ink" title={value}>{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
            Mock restored state sample: Source Type = Restored Backup, Source Backup = backup_20260703_142530_before_import.db, Restored At = 2026/07/03 16:05:44.
          </div>
        </MockModal>
      ) : null}
    </div>
  );
}
