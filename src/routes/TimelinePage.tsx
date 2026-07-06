import { Calendar, Download, ListFilter, Search } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { Chip, FieldLabel } from "../components/FormControls";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { metricIcons, timelineEvents } from "../data/mockData";

const issueKey = "COPGEN1-126606";

export function TimelinePage() {
  const { Activity, FileText, Users, MessageSquare, Paperclip, GitBranch } = metricIcons;
  const hasIssueKey = issueKey.trim().length > 0;

  return (
    <div className="min-w-0">
      <PageHeader title="工作紀錄" subtitle="Timeline" connected={false} />
      <SectionCard>
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5">
          <div>
            <FieldLabel label="使用者" sub="Users" />
            <div className="field flex flex-wrap gap-2"><Chip>roger.hsieh</Chip><Chip>alice.chen</Chip><Chip>kevin.lin</Chip></div>
          </div>
          <div>
            <FieldLabel label="日期範圍" sub="Date Range" />
            <div className="field flex items-center justify-between gap-3"><span>2026/05/01</span><span>~</span><span>2026/05/31</span><Calendar size={16} /></div>
          </div>
          <div>
            <FieldLabel label="專案" sub="Project" />
            <input className="field bg-slate-50 text-slate-500" value={hasIssueKey ? "Auto: COPGEN1" : "COPGEN1, FW, QA"} disabled={hasIssueKey} readOnly />
          </div>
          <div>
            <FieldLabel label="Jira 編號" sub="Issue Key" />
            <input className="field" defaultValue={issueKey} />
          </div>
          <div>
            <FieldLabel label="事件類型" sub="Event Type" />
            <select className="field"><option>請選擇事件類型</option></select>
          </div>
          <div>
            <FieldLabel label="關鍵字" sub="Keyword" />
            <div className="relative"><input className="field pr-10" placeholder="搜尋摘要或詳細資訊..." /><Search className="absolute right-3 top-3 text-muted" size={18} /></div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-3"><button className="btn">重設 / Reset</button><button className="btn btn-primary"><Search size={17} />套用 / Apply</button></div>
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-700">
          查詢規則：若未指定 Issue Key，請至少選擇一位使用者。指定有效 Issue Key 時，Users 可留空，Project 會自動以 Issue Key 推導為 Auto Project。
        </div>
      </SectionCard>
      <ResponsiveMetricGrid min={190} className="mt-4">
        {[
          ["總事件數", "Total Events", "1,248", Activity],
          ["Issue 數", "Issues", "236", FileText],
          ["使用者數", "Users", "18", Users],
          ["留言數", "Comments", "532", MessageSquare],
          ["附件數", "Attachments", "143", Paperclip],
          ["狀態變更數", "Status Changes", "196", GitBranch]
        ].map(([a, b, c, d]) => <MetricCard key={a as string} label={a as string} sub={b as string} value={c as string} icon={d as typeof Activity} />)}
      </ResponsiveMetricGrid>
      <SectionCard
        className="mt-4"
        title="活動事件"
        subtitle="Activity Events"
        action={<div className="flex flex-wrap gap-2"><button className="btn"><Download size={16} />匯出 CSV / Export CSV</button><button className="btn"><ListFilter size={16} />欄位設定 / Columns</button></div>}
      >
        <DataTable
          headers={["時間 / Time", "使用者 / User", "事件類型 / Event Type", "Jira 編號 / Issue Key", "摘要 / Summary", "詳細資訊 / Details", "來源 / Source"]}
          rows={timelineEvents.map((row) => [
            row[0],
            row[1],
            <span className="chip">{row[2]}</span>,
            <span className="font-black text-blue-600">{row[3]}</span>,
            row[4],
            <span>{row[5]}<br /><span className="text-xs font-bold text-muted">Origin: Jira Cloud</span></span>,
            "Local DB"
          ])}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm font-bold text-muted">
          <div className="flex flex-wrap gap-2"><button className="btn">‹</button><button className="btn btn-primary">1</button><button className="btn">2</button><button className="btn">3</button><button className="btn">125</button><button className="btn">›</button></div>
          <span>顯示 1 - 10 / 1,248 筆</span>
        </div>
      </SectionCard>
    </div>
  );
}
