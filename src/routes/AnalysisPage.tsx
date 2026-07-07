import { Line, LineChart, Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Plus } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { Chip, FieldLabel } from "../components/FormControls";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { analysisRows, eventTypes, metricIcons, trend } from "../data/mockData";

export function AnalysisPage() {
  const { Activity, AlertTriangle, Archive, FolderOpen, MessageSquare, Paperclip } = metricIcons;
  return (
    <div className="min-w-0">
      <PageHeader title="使用者分析" subtitle="Analysis" />
      <SectionCard className="mb-4" title="Data Source Mode" subtitle="資料來源模式">
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="text-xs font-black uppercase text-blue-700">Live Jira API / 即時 Jira 查詢</div>
            <div className="mt-2 text-sm font-semibold leading-relaxed text-blue-800">
              Candidate Discovery will use read-only Jira JQL search.
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-muted">
            Local Database mode is disabled / coming later.
          </div>
        </div>
      </SectionCard>
      <SectionCard>
        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div><FieldLabel label="Selected Users" sub="比較使用者" /><div className="field flex min-w-0 flex-wrap gap-2"><Chip>Alpha-Platform</Chip><Chip>Ben Service</Chip><Chip>Chia-Ting Wu</Chip><button className="btn ml-auto"><Plus size={16} />新增使用者</button></div></div>
          <div><FieldLabel label="Date Range" sub="日期範圍" /><div className="field">2026-06-26 ~ 2026-07-03</div></div>
        </div>
      </SectionCard>
      <ResponsiveMetricGrid min={210} className="mt-4">
        {[["總事件數", "Total Events", "1,248,356", Activity], ["活躍 Issue 數", "Active Issues", "412,651", AlertTriangle], ["建立 Issue 數", "Created Issues", "198,324", Archive], ["留言數", "Comments", "279,463", MessageSquare], ["附件數", "Attachments", "1,287,901", Paperclip], ["專案數", "Projects", "48", FolderOpen]].map(([a,b,c,d]) => <MetricCard key={a as string} label={a as string} sub={b as string} value={c as string} foot="↑ 12.7% vs 上一週" icon={d as typeof Activity} />)}
      </ResponsiveMetricGrid>
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
        <SectionCard title="1. 使用者比較" subtitle="User Comparison"><DataTable headers={["使用者", "總事件數", "活躍 Issue 數", "建立 Issue 數", "留言數", "附件數"]} rows={analysisRows} /></SectionCard>
        <SectionCard title="2. 活動趨勢" subtitle="Activity Trend" action={<select className="field w-28"><option>Daily</option></select>}>
          <div className="h-72"><ResponsiveContainer><LineChart data={trend}><XAxis dataKey="day" /><YAxis /><Tooltip /><Line dataKey="alpha" stroke="#2563eb" strokeWidth={3} /><Line dataKey="ben" stroke="#8b5cf6" strokeWidth={3} /><Line dataKey="chia" stroke="#16a34a" strokeWidth={3} /><Line dataKey="yen" stroke="#f59e0b" strokeWidth={3} /></LineChart></ResponsiveContainer></div>
        </SectionCard>
        <SectionCard title="3. 事件類型分布" subtitle="Event Type Distribution">
          <div className="h-72"><ResponsiveContainer><PieChart><Pie data={eventTypes} dataKey="value" innerRadius={65} outerRadius={105}>{eventTypes.map((e) => <Cell key={e.name} fill={e.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
        </SectionCard>
        <SectionCard title="4. 專案參與" subtitle="Project Participation">
          <div className="h-72"><ResponsiveContainer><BarChart data={[{p:"Customer Portal",v:28},{p:"Data Platform",v:22},{p:"Mobile App",v:19},{p:"Alpha Platform",v:16},{p:"Internal Tools",v:10}]} layout="vertical"><XAxis type="number" /><YAxis dataKey="p" type="category" width={110} /><Tooltip /><Bar dataKey="v" fill="#2563eb" /></BarChart></ResponsiveContainer></div>
        </SectionCard>
        <SectionCard title="5. 近期重點" subtitle="Recent Highlights" className="xl:col-span-2">
          <div className="grid min-w-0 grid-cols-1 gap-3 text-sm font-semibold text-ink md:grid-cols-2">
            {["Alpha-Platform 在 Customer Portal 新增 15 則留言", "Chia-Ting Wu 解決了 8 個 Issue", "Ben Service 上傳了 23 個附件", "Yen-Lang Chen 記錄了 32 小時工作", "Alpha-Platform 建立了 6 個新 Issue"].map((h) => <div key={h} className="rounded-lg border border-line p-3">{h}<div className="text-xs text-muted">2026-07-03 15:42:15</div></div>)}
          </div>
        </SectionCard>
      </div>
      <button className="btn mt-4"><Download size={16} />匯出分析摘要 CSV</button>
    </div>
  );
}
