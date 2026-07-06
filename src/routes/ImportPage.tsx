import { Beaker, Cloud, Database, Download, Eye, Link2, MessageSquare, Paperclip, Server, Users } from "lucide-react";
import { DataTable } from "../components/DataTable";
import { Chip, FieldLabel } from "../components/FormControls";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { db, previewIssues } from "../data/mockData";

export function ImportPage() {
  return (
    <div className="min-w-0">
      <PageHeader title="資料匯入" subtitle="Import" />
      <SectionCard>
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-5">
          <div>
            <FieldLabel label="Connection" sub="Jira 連線" />
            <div className="rounded-lg border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <Cloud className="shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <div className="font-black text-ink">Jira Cloud (Production)</div>
                    <div className="text-xs font-bold text-muted">Base URL: https://example.atlassian.net</div>
                    <div className="mt-2 flex flex-wrap gap-2"><Chip>COPGEN1</Chip><Chip>FW</Chip><Chip>QA</Chip></div>
                  </div>
                </div>
                <StatusBadge>Connected</StatusBadge>
              </div>
            </div>
          </div>
          <div>
            <FieldLabel label="Current Database" sub="目前資料庫" />
            <div className="rounded-lg border border-line bg-white p-4">
              <div className="flex items-start gap-3">
                <Server className="shrink-0 text-slate-600" />
                <div>
                  <div className="font-black text-ink">{db.name}</div>
                  <div className="text-xs font-bold text-muted">DB ID: {db.id}</div>
                  <div className="text-xs font-bold text-muted">Last Backup Time: {db.lastBackup}</div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <FieldLabel label="Import Mode" sub="匯入模式" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button className="btn btn-primary justify-start"><Users size={20} />使用者操作紀錄<br />User Activity</button>
              <button className="btn justify-start text-slate-700"><Database size={20} />Jira Issue 完整記錄<br />Issue Full History</button>
            </div>
          </div>
          <div>
            <FieldLabel label="Date Range" sub="日期範圍" />
            <div className="field flex justify-between"><span>2026-06-01</span><span>→</span><span>2026-07-03</span></div>
          </div>
          <div>
            <FieldLabel label="Target Users" sub="目標使用者" />
            <div className="field flex flex-wrap gap-2"><Chip>Alice Chen</Chip><Chip>Bob Lin</Chip><Chip>Charlie Wu</Chip></div>
          </div>
          <div>
            <FieldLabel label="Max Issues" sub="最大 Issue 數" />
            <input className="field" defaultValue="10,000" />
          </div>
          <div>
            <FieldLabel label="Project Filter" sub="專案篩選" />
            <div className="field flex flex-wrap gap-2"><Chip>Alpha Platform</Chip><Chip>Beta Service</Chip></div>
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-3 font-black">匯入內容 / Imported Data Scope</div>
          <div className="grid grid-cols-2 gap-3 text-sm font-bold lg:grid-cols-3 2xl:grid-cols-6">
            {[["Issue 基本欄位", Database], ["變更記錄", Cloud], ["留言內容", MessageSquare], ["附件中繼資料", Paperclip], ["Issue 連結", Link2], ["使用者 / 專案中繼資料", Users]].map(([text, Icon]) => (
              <div key={text as string} className="flex min-w-0 items-center gap-2"><Icon className="shrink-0 text-blue-600" size={20} />{text as string}</div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <button className="btn"><Eye size={16} />Preview 預覽</button>
            <button className="btn">Estimate 預估</button>
            <button className="btn"><Beaker size={16} />Dry Run 試跑</button>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary"><Download size={16} />Import 匯入</button>
            <button className="btn text-slate-700">Diagnose 診斷</button>
          </div>
        </div>
      </SectionCard>
      <SectionCard className="mt-4" title="預覽結果" subtitle="Issue Preview">
        <DataTable headers={["Issue Key", "Summary", "Updated", "Creator", "Assignee", "Matched Users", "Estimated Events"]} rows={previewIssues} />
      </SectionCard>
      <ResponsiveMetricGrid min={190} className="mt-4">
        {["匹配成功的 Issue|2,184|98.2%", "預估事件數|56,812|", "使用者|1,287|匹配成功", "專案|48|匹配成功", "已存在於 DB|12,345|", "新事件數|44,467|78.2%", "將跳過的重複事件|10,123|17.8%"].map((m) => {
          const [a, b, c] = m.split("|");
          return <MetricCard key={a} label={a} value={b} sub={c} icon={Database} />;
        })}
      </ResponsiveMetricGrid>
    </div>
  );
}
