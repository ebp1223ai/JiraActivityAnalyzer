import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DataTable } from "../components/DataTable";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { jiraLifecycle, metricIcons } from "../data/mockData";

export function JiraAnalysisPage() {
  const { Activity, Clock, GitBranch, MessageSquare, Paperclip, Users } = metricIcons;
  return (
    <div className="min-w-0">
      <PageHeader title="Jira 分析" subtitle="Jira Analysis" />
      <div className="mb-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_110px] xl:grid-cols-[minmax(0,1fr)_110px_170px_150px]"><input className="field" defaultValue="COPGEN1-126606" /><button className="btn btn-primary"><Search size={16} />Load</button><button className="btn"><RefreshCw size={16} />Refresh from Jira</button><button className="btn"><ExternalLink size={16} />Open in Jira</button></div>
      <SectionCard title="Issue Summary" subtitle="Issue 摘要">
        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-4">
          <div className="xl:col-span-2"><div className="text-sm font-bold text-muted">Issue Key / Jira 編號</div><div className="truncate text-2xl font-black" title="COPGEN1-126606">COPGEN1-126606</div><p className="mt-3 max-w-xl break-words font-semibold">Investigate intermittent data sync failures between COPGEN and JIRA Cloud</p><div className="mt-4 flex flex-wrap gap-3"><StatusBadge>In Progress</StatusBadge><StatusBadge tone="red">High</StatusBadge></div></div>
          <div className="space-y-3 text-sm font-semibold"><div><b>Assignee</b><br />Alice Chen</div><div><b>Creator</b><br />Bob Lin</div><div><b>Reporter</b><br />Charlie Wu</div></div>
          <div className="space-y-3 text-sm font-semibold"><div><b>Created</b><br />2026-07-01 10:12:34</div><div><b>Updated</b><br />2026-07-03 15:42:18</div><div><b>Labels</b><br />integration, sync, bug, data</div><div><b>Linked Issues</b><br />5</div></div>
        </div>
      </SectionCard>
      <ResponsiveMetricGrid min={210} className="mt-3">
        {[["Total Events", "事件總數", "412", Activity], ["Participants", "參與人數", "26", Users], ["Comments", "留言數", "68", MessageSquare], ["Attachments", "附件數", "15", Paperclip], ["Status Changes", "狀態變更次數", "18", GitBranch], ["Lead Time", "整體處理時間", "2d 04h 21m", Clock]].map(([a,b,c,d]) => <MetricCard key={a as string} label={a as string} sub={b as string} value={c as string} icon={d as typeof Activity} />)}
      </ResponsiveMetricGrid>
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        <SectionCard title="Lifecycle Analysis" subtitle="處理生命週期"><DataTable headers={["Stage", "Time", "Duration"]} rows={jiraLifecycle} /><div className="mt-3 text-right font-black text-blue-600">Lead Time 2d 04h 21m</div></SectionCard>
        <SectionCard title="Participants Contribution" subtitle="參與者貢獻"><DataTable headers={["Participant", "Events", "% of Total"]} rows={[["Alice Chen","102","24.8%"],["Bob Lin","78","18.9%"],["Charlie Wu","64","15.5%"],["Daisy Huang","48","11.7%"],["Others","84","20.4%"]]} /></SectionCard>
        <SectionCard title="Status Transition Analysis" subtitle="狀態流轉分析"><DataTable headers={["From", "To", "Count", "%"]} rows={[["To Do","In Progress","6","33.3%"],["In Progress","In Review","4","22.2%"],["In Review","Resolved","3","16.7%"],["Resolved","In Review","2","11.1%"],["To Do","Blocked","1","5.6%"]]} /></SectionCard>
        <SectionCard title="Field Change Hotspots" subtitle="欄位變更熱點">
          <div className="h-56"><ResponsiveContainer><BarChart data={[{f:"status",v:18},{f:"assignee",v:11},{f:"labels",v:10},{f:"priority",v:6},{f:"resolution",v:4}]} layout="vertical"><XAxis type="number" /><YAxis dataKey="f" type="category" width={80} /><Tooltip /><Bar dataKey="v" fill="#60a5fa" /></BarChart></ResponsiveContainer></div>
        </SectionCard>
        <SectionCard title="Comment Summary" subtitle="留言摘要"><DataTable headers={["Author", "Preview", "Date"]} rows={[["Alice Chen","Investigating logs from sync service...","2026-07-01"],["Bob Lin","Found intermittent timeout in API call.","2026-07-01"],["Charlie Wu","Added retry mechanism in commit abc123","2026-07-02"],["Daisy Huang","Deployed to staging for verification.","2026-07-02"]]} /></SectionCard>
        <SectionCard title="Attachment Summary" subtitle="附件摘要"><div className="grid grid-cols-3 gap-3 text-center"><b>15<br /><span className="text-xs text-muted">Total</span></b><b>24.8 MB<br /><span className="text-xs text-muted">Size</span></b><b>10<br /><span className="text-xs text-muted">Unique</span></b></div><DataTable headers={["File", "By", "Size"]} rows={[["sync-error-log.txt","Alice Chen","1.2 MB"],["api-timeout-trace.zip","Bob Lin","4.8 MB"],["retry-logic.diff","Charlie Wu","78 KB"]]} /></SectionCard>
        <SectionCard title="Linked Issues Analysis" subtitle="關聯 Issue 分析"><DataTable headers={["Issue Key", "Relationship", "Summary", "Status"]} rows={[["COPGEN1-126580","blocks","Data connector refactor","In Progress"],["COPGEN1-126612","is blocked by","API rate limit investigation","To Do"],["COPGEN1-126645","relates to","Improve error logging","Done"]]} /></SectionCard>
        <SectionCard title="Risk & Anomaly Hints" subtitle="風險與異常提示"><div className="space-y-2 text-sm font-semibold"><div className="rounded-lg border border-red-200 bg-red-50 p-3">High Frequency Retries Detected</div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3">Long Resolution Time</div><div className="rounded-lg border border-blue-200 bg-blue-50 p-3">Reopened Once</div><div className="rounded-lg border border-green-200 bg-green-50 p-3">No High-Risk Patterns Detected</div></div></SectionCard>
        <SectionCard title="Activity Timeline" subtitle="活動時間軸"><DataTable headers={["Time", "Actor", "Event", "Details"]} rows={[["2026-07-01 10:12","Bob Lin","Issue Created","--"],["2026-07-01 11:03","Alice Chen","Commented","Initial notes"],["2026-07-01 15:42","Bob Lin","Status Changed","To Do -> In Progress"],["2026-07-02 09:12","Charlie Wu","Updated","Description"]]} /></SectionCard>
      </div>
    </div>
  );
}
