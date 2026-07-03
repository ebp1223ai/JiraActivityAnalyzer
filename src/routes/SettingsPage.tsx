import { Download, FolderOpen, RefreshCw, Shield, Trash2, Upload } from "lucide-react";
import { buildInfo } from "../buildInfo";
import { DataTable } from "../components/DataTable";
import { FieldLabel, Toggle } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-4"><FieldLabel label={label} />{children}</div>;
}

export function SettingsPage() {
  return (
    <div>
      <PageHeader title="設定" subtitle="Settings" />
      <div className="grid grid-cols-3 gap-4">
        <SectionCard title="一般設定" subtitle="General Settings">
          <SettingRow label="Application Name"><input className="field" defaultValue="Jira Analyzer" /></SettingRow>
          <SettingRow label="Time Zone"><select className="field"><option>(UTC+08:00) Taipei</option></select></SettingRow>
          <SettingRow label="Items per page"><select className="field"><option>25</option><option>50</option></select></SettingRow>
          <div className="flex items-center justify-between font-bold">Enable tips & guidance <Toggle /></div>
        </SectionCard>
        <SectionCard title="資料庫設定" subtitle="Database Settings">
          <SettingRow label="Database Type"><div className="space-y-2 text-sm font-bold"><label><input type="radio" defaultChecked /> SQLite（預設）</label><br /><label><input type="radio" /> PostgreSQL（進階）</label></div></SettingRow>
          <SettingRow label="Database Path (SQLite)"><input className="field" defaultValue="data/jira_analyzer.db" /></SettingRow>
          <div className="flex gap-3"><button className="btn">Test Connection</button><button className="btn btn-primary">Save Changes</button></div>
        </SectionCard>
        <SectionCard title="安全性與權杖儲存" subtitle="Security & Token Storage">
          <SettingRow label="Token Encryption"><select className="field"><option>AES-256（預設）</option></select></SettingRow>
          <SettingRow label="Master Key"><input className="field" defaultValue="••••••••••••••" /></SettingRow>
          <SettingRow label="Token Storage Location"><select className="field"><option>Local Database (Encrypted)</option></select></SettingRow>
          <div className="flex items-center justify-between font-bold">Enable token usage audit <Toggle /></div>
        </SectionCard>
        <SectionCard title="預設匯入選項" subtitle="Import Defaults">
          <SettingRow label="Default Project Scope"><select className="field"><option>All Projects (全部專案)</option></select></SettingRow>
          <SettingRow label="Default Event Lookback"><select className="field"><option>Last 180 days</option></select></SettingRow>
          <SettingRow label="Batch Size"><select className="field"><option>500</option></select></SettingRow>
          <div className="flex items-center justify-between font-bold">Show summary after import <Toggle /></div>
        </SectionCard>
        <SectionCard title="匯出與報表" subtitle="Export & Reports">
          <SettingRow label="Default Export Format"><select className="field"><option>CSV（預設）</option></select></SettingRow>
          <SettingRow label="Default Field Set"><select className="field"><option>Standard（標準欄位）</option></select></SettingRow>
          <div className="space-y-3 font-bold"><div className="flex justify-between">Include attachment stats <Toggle /></div><div className="flex justify-between">Warn on long export <Toggle /></div></div>
          <SettingRow label="Reports Output Path"><input className="field" defaultValue="exports/reports" /></SettingRow>
        </SectionCard>
        <SectionCard title="除錯紀錄設定" subtitle="Debug Log Settings">
          <SettingRow label="Log Level"><select className="field"><option>INFO</option></select></SettingRow>
          <SettingRow label="Log Retention (days)"><input className="field" defaultValue="30" /></SettingRow>
          <div className="space-y-3 font-bold"><div className="flex justify-between">Enable performance logs <Toggle /></div><div className="flex justify-between">Auto-scroll debug panel <Toggle /></div></div>
          <SettingRow label="Log File Path"><input className="field" defaultValue="logs/debug.log" /></SettingRow>
        </SectionCard>
      </div>
      <div className="mt-4 grid grid-cols-[2fr_1fr] gap-4">
        <SectionCard title="資料管理" subtitle="Data Management">
          <div className="grid grid-cols-[1fr_1.4fr] gap-4">
            <div className="text-sm font-semibold leading-8"><b>Current Database</b><br />Database Type: SQLite<br />Database Events: 1,248,356<br />Database Size: 68.4 GB<br />Attachment Metadata: 279,463<br />Last Import Time: 2026/07/03 15:43:21<br />Last Backup Time: 2026/07/03 15:42:18</div>
            <div className="grid grid-cols-3 gap-3">
              {[["Backup Database", Download], ["Load Database", Upload], ["Backup History", FolderOpen], ["Verify Backup", Shield], ["Delete Backup", Trash2], ["Run Diagnostics", RefreshCw]].map(([label, Icon]) => <button key={label as string} className="btn justify-start text-slate-700"><Icon size={18} />{label as string}</button>)}
            </div>
          </div>
          <div className="mt-4"><DataTable headers={["Backup Time", "Type", "File", "Size", "Events", "Created By", "Verify Status", "Actions"]} rows={[["2026-07-03 15:42:58","Auto","backup_20260703_154258.db","68.3 GB","1,248,356","System",<StatusBadge>Valid</StatusBadge>,<button className="btn">Download</button>],["2026-07-02 22:15:30","Manual","backup_20260702_221530.db","67.9 GB","1,246,112","Admin",<StatusBadge>Valid</StatusBadge>,<button className="btn">Download</button>],["2026-06-30 09:01:12","Scheduled","backup_20260630_090112.db","66.1 GB","1,219,884","System",<StatusBadge>Valid</StatusBadge>,<button className="btn">Download</button>]]} /></div>
        </SectionCard>
        <SectionCard title="系統狀態" subtitle="System Status">
          <div className="divide-y divide-line rounded-lg border border-line text-sm font-semibold">
            {["Jira Cloud Connection|Connected", "Database Connection|Connected", "Last Import Status|Success", "Pending Jobs|0", "System Uptime|2d 14h 23m", `Application Version|${buildInfo.version}`, `Build Time|${buildInfo.buildTime}`].map((row) => { const [a,b]=row.split("|"); return <div key={a} className="flex justify-between p-3"><span>{a}</span><span className="font-black text-green-600">{b}</span></div>; })}
          </div>
          <button className="btn mx-auto mt-6"><RefreshCw size={16} />重新整理 / Refresh</button>
        </SectionCard>
      </div>
    </div>
  );
}
