import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Archive, Download, FileArchive, FolderOpen, RefreshCw, Shield, Trash2, Upload } from "lucide-react";
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

function ActionCard({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  onClick
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "primary" | "warning" | "danger" | "neutral";
  onClick?: () => void;
}) {
  const styles = {
    primary: "border-blue-200 bg-blue-50 text-blue-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
    neutral: "border-line bg-white text-slate-700"
  };

  return (
    <button
      className={`min-h-[116px] rounded-lg border p-4 text-left transition hover:shadow-soft ${styles[tone]}`}
      onClick={onClick}
      type="button"
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/80">
          <Icon size={20} />
        </span>
        <div className="min-w-0 text-sm font-black leading-snug text-ink">{title}</div>
      </div>
      <div className="text-xs font-semibold leading-relaxed text-muted">{description}</div>
    </button>
  );
}

const backupRows = [
  {
    time: "2026/07/03 15:42:58",
    type: "Auto",
    file: "backup_20260703_154258_before_import.db",
    size: "68.3 GB",
    events: "1,248,356",
    by: "System",
    status: <StatusBadge>Valid</StatusBadge>,
    desc: "Auto backup before import preview"
  },
  {
    time: "2026/07/02 22:15:30",
    type: "Manual",
    file: "backup_20260702_221530_manual_restore_candidate.db",
    size: "67.9 GB",
    events: "1,246,112",
    by: "Admin",
    status: <StatusBadge tone="amber">Missing</StatusBadge>,
    desc: "Referenced file is missing from backup folder"
  },
  {
    time: "2026/06/30 09:01:12",
    type: "Scheduled",
    file: "backup_20260630_090112_weekly_snapshot.db",
    size: "66.1 GB",
    events: "1,219,884",
    by: "System",
    status: <StatusBadge tone="red">Corrupted</StatusBadge>,
    desc: "Checksum mismatch detected during mock verification"
  }
];

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

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 2xl:grid-cols-[2fr_1fr]">
        <SectionCard title="資料管理" subtitle="Data Management">
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-lg border border-line bg-slate-50 p-4 text-sm font-semibold leading-8">
              <b>Current Database</b><br />
              Database Type: SQLite<br />
              Database Events: 1,248,356<br />
              Database Size: {db.size}<br />
              Attachment Metadata: 279,463<br />
              Last Import Time: 2026/07/03 15:43:21<br />
              Last Backup Time: {db.lastBackup}
            </div>
            <div>
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                <div className="mb-1 flex items-center gap-2 font-black"><AlertTriangle size={17} />Load Database safety notice</div>
                Before loading a backup, the system will automatically back up the current database first. After loading, the selected backup becomes the active database.
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <ActionCard icon={Download} title="備份資料庫 / Backup Database" description="建立目前資料庫的安全備份。" tone="primary" />
                <ActionCard icon={Upload} title="載入資料庫 / Load Database" description="選擇備份並切換成作用中資料庫。" tone="warning" onClick={() => setShowLoadModal(true)} />
                <ActionCard icon={FolderOpen} title="備份紀錄 / Backup History" description="檢視備份檔案與驗證狀態。" />
                <ActionCard icon={Shield} title="驗證備份 / Verify Backup" description="檢查備份是否完整可用。" />
                <ActionCard icon={FileArchive} title="匯出備份 / Export Backup" description="匯出可攜式備份檔案。" />
                <ActionCard icon={Trash2} title="刪除備份 / Delete Backup" description="刪除選取備份，這是危險操作。" tone="danger" />
                <ActionCard icon={RefreshCw} title="執行診斷 / Run Diagnostics" description="產生本機健康檢查摘要。" />
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-3 text-sm font-black text-ink">備份紀錄 / Backup History</div>
            <DataTable
              headers={["Backup Time", "Type", "File", "Size", "Events", "Created By", "Verify Status", "Description", "Actions"]}
              rows={backupRows.map((row) => [
                row.time,
                row.type,
                <span className="inline-block max-w-[260px] truncate align-bottom" title={row.file}>{row.file}</span>,
                row.size,
                row.events,
                row.by,
                row.status,
                <span className="inline-block max-w-[260px] truncate align-bottom" title={row.desc}>{row.desc}</span>,
                <div className="flex gap-2"><button className="btn px-3 py-2">Details</button><button className="btn px-3 py-2">Download</button></div>
              ])}
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
          title="載入資料庫 / Load Database"
          onClose={() => setShowLoadModal(false)}
          footer={
            <>
              <button className="btn" onClick={() => setShowLoadModal(false)}>Cancel / 取消</button>
              <button className="btn btn-primary opacity-60" disabled>Confirm Load / 確認載入</button>
            </>
          }
        >
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
            Before loading a backup, the system will automatically back up the current database first. After loading, the selected backup becomes the active database.
          </p>
          <div className="space-y-2">
            <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"><span>Selected Backup / 選取備份</span><b>backup_20260703_154258_before_import.db</b></div>
            <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"><span>Current Database / 目前資料庫</span><b>{db.name} / {db.id}</b></div>
            <div className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"><span>Auto Backup / 自動備份</span><b>backup_20260703_160544_before_restore.db</b></div>
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">載入後目前資料庫將改為選取備份。</div>
            <div className="rounded-md bg-slate-100 px-3 py-2 font-black text-ink">Confirm Text: type LOAD BACKUP to enable confirm.</div>
          </div>
        </MockModal>
      ) : null}
    </div>
  );
}
