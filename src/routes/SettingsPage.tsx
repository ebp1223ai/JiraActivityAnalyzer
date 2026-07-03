import { useState } from "react";
import { Download, FolderOpen, RefreshCw, Shield, Trash2, Upload } from "lucide-react";
import { buildInfo } from "../buildInfo";
import { DataTable } from "../components/DataTable";
import { FieldLabel, MockModal, Toggle } from "../components/FormControls";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { db } from "../data/mockData";

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-4 min-w-0"><FieldLabel label={label} />{children}</div>;
}

export function SettingsPage() {
  const [showLoadModal, setShowLoadModal] = useState(false);

  return (
    <div className="min-w-0">
      <PageHeader title="設定" subtitle="Settings" />
      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
        <SectionCard title="一般設定" subtitle="General Settings">
          <SettingRow label="Application Name"><input className="field" defaultValue="Jira Analyzer" /></SettingRow>
          <SettingRow label="Time Zone"><select className="field"><option>(UTC+08:00) Taipei</option></select></SettingRow>
          <SettingRow label="Items per page"><select className="field"><option>25</option><option>50</option></select></SettingRow>
          <div className="flex items-center justify-between gap-3 font-bold">Enable tips & guidance <Toggle /></div>
        </SectionCard>
        <SectionCard title="資料庫設定" subtitle="Database Settings">
          <SettingRow label="Database Type"><div className="space-y-2 text-sm font-bold"><label><input type="radio" defaultChecked /> SQLite（預設）</label><br /><label><input type="radio" /> PostgreSQL（進階）</label></div></SettingRow>
          <SettingRow label="Database Path (SQLite)"><input className="field" defaultValue="data/jira_analyzer.db" /></SettingRow>
          <div className="flex flex-wrap gap-3"><button className="btn">Test Connection</button><button className="btn btn-primary">Save Changes</button></div>
        </SectionCard>
        <SectionCard title="安全性與權杖儲存" subtitle="Security & Token Storage">
          <SettingRow label="Token Encryption"><select className="field"><option>AES-256（預設）</option></select></SettingRow>
          <SettingRow label="Master Key"><input className="field" defaultValue="••••••••••••••" /></SettingRow>
          <SettingRow label="Token Storage Location"><select className="field"><option>Local Database (Encrypted)</option></select></SettingRow>
          <div className="flex items-center justify-between gap-3 font-bold">Enable token usage audit <Toggle /></div>
        </SectionCard>
        <SectionCard title="預設匯入選項" subtitle="Import Defaults">
          <SettingRow label="Default Project Scope"><select className="field"><option>Use connection project scope</option></select></SettingRow>
          <SettingRow label="Default Event Lookback"><select className="field"><option>Last 30 days</option></select></SettingRow>
          <SettingRow label="Batch Size"><select className="field"><option>500</option></select></SettingRow>
          <div className="flex items-center justify-between gap-3 font-bold">Show summary after import <Toggle /></div>
        </SectionCard>
        <SectionCard title="匯出與報表" subtitle="Export & Reports">
          <SettingRow label="Default Export Format"><select className="field"><option>CSV（預設）</option></select></SettingRow>
          <SettingRow label="Default Field Set"><select className="field"><option>Standard（標準欄位）</option></select></SettingRow>
          <div className="space-y-3 font-bold"><div className="flex justify-between gap-3">Include attachment stats <Toggle /></div><div className="flex justify-between gap-3">Warn on long export <Toggle /></div></div>
          <SettingRow label="Reports Output Path"><input className="field" defaultValue="exports/reports" /></SettingRow>
        </SectionCard>
        <SectionCard title="除錯紀錄設定" subtitle="Debug Log Settings">
          <SettingRow label="Log Level"><select className="field"><option>INFO</option></select></SettingRow>
          <SettingRow label="Log Retention (days)"><input className="field" defaultValue="30" /></SettingRow>
          <div className="space-y-3 font-bold"><div className="flex justify-between gap-3">Enable performance logs <Toggle /></div><div className="flex justify-between gap-3">Auto-scroll debug panel <Toggle /></div></div>
          <SettingRow label="Log File Path"><input className="field" defaultValue="logs/debug.log" /></SettingRow>
        </SectionCard>
      </div>
      <div className="mt-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-4">
        <SectionCard title="資料管理" subtitle="Data Management">
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
            <div className="rounded-lg border border-line bg-slate-50 p-4 text-sm font-semibold leading-8">
              <b>Current Database</b><br />
              Database Type: SQLite<br />
              Database Events: 1,248,356<br />
              Database Size: {db.size}<br />
              Attachment Metadata: 279,463<br />
              Last Import Time: 2026/07/03 15:43:21<br />
              Last Backup Time: {db.lastBackup}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <button className="btn justify-start text-slate-700"><Download size={18} />Backup Database</button>
              <button className="btn justify-start text-slate-700" onClick={() => setShowLoadModal(true)}><Upload size={18} />Load Database</button>
              <button className="btn justify-start text-slate-700"><FolderOpen size={18} />Backup History</button>
              <button className="btn justify-start text-slate-700"><Shield size={18} />Verify Backup</button>
              <button className="btn justify-start text-slate-700"><Trash2 size={18} />Delete Backup</button>
              <button className="btn justify-start text-slate-700"><RefreshCw size={18} />Run Diagnostics</button>
            </div>
          </div>
          <div className="mt-4">
            <DataTable
              headers={["Backup Time", "Type", "File", "Size", "Events", "Created By", "Verify Status", "Actions"]}
              rows={[
                ["2026/07/03 15:42:58", "Auto", "backup_20260703_154258.db", "68.3 GB", "1,248,356", "System", <StatusBadge>Valid</StatusBadge>, <button className="btn">Download</button>],
                ["2026/07/02 22:15:30", "Manual", "backup_20260702_221530.db", "67.9 GB", "1,246,112", "Admin", <StatusBadge tone="amber">Missing</StatusBadge>, <button className="btn">Download</button>],
                ["2026/06/30 09:01:12", "Scheduled", "backup_20260630_090112.db", "66.1 GB", "1,219,884", "System", <StatusBadge tone="red">Corrupted</StatusBadge>, <button className="btn">Download</button>]
              ]}
            />
          </div>
        </SectionCard>
        <SectionCard title="系統狀態" subtitle="System Status">
          <div className="divide-y divide-line rounded-lg border border-line text-sm font-semibold">
            {["Jira Cloud Connection|Connected", "Database Connection|Connected", "Last Import Status|Success", "Pending Jobs|0", "System Uptime|2d 14h 23m", `Application Version|${buildInfo.version}`, `Build Time|${buildInfo.buildTime}`].map((row) => {
              const [a, b] = row.split("|");
              return <div key={a} className="flex justify-between gap-3 p-3"><span>{a}</span><span className="text-right font-black text-green-600">{b}</span></div>;
            })}
          </div>
          <button className="btn mx-auto mt-6"><RefreshCw size={16} />重新整理 / Refresh</button>
        </SectionCard>
      </div>

      {showLoadModal ? (
        <MockModal
          title="Load Database"
          onClose={() => setShowLoadModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowLoadModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => setShowLoadModal(false)}>Confirm LOAD BACKUP</button>
            </>
          }
        >
          <p className="mb-4">
            Before loading a backup, the system will automatically back up the current database first. After loading, the selected backup becomes the active database.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"><span>Selected backup</span><b>backup_20260703_154258.db</b></div>
            <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"><span>Current database</span><b>{db.name}</b></div>
            <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"><span>Auto-backup current DB first</span><b>Enabled</b></div>
          </div>
        </MockModal>
      ) : null}
    </div>
  );
}
