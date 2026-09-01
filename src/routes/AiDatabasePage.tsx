import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Archive, Copy, Database, FileCheck2, FolderOpen, HardDrive, Link2, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid, ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";

type Snapshot = Record<string, any>;
type Preview = Record<string, any>;

const makeRequestId = (kind: string) => `v039-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function size(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function Detail({ label, value, mono = false, copy = false }: { label: string; value: unknown; mono?: boolean; copy?: boolean }) {
  const text = value === null || value === undefined || value === "" ? "-" : String(value);
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className={`mt-1 flex min-w-0 items-start gap-1 break-words text-sm ${mono ? "font-mono text-xs" : ""}`} title={text}>
        <span className="min-w-0 break-all">{text}</span>
        {copy && text !== "-" ? <button className="icon-button h-7 w-7 shrink-0" type="button" title={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(text)}><Copy size={14} /></button> : null}
      </dd>
    </div>
  );
}

function StateBanner({ snapshot }: { snapshot: Snapshot }) {
  const diagnostic = snapshot.lifecycleState === "READ_ONLY_DIAGNOSTIC" || snapshot.lifecycleState === "ERROR";
  const ready = snapshot.lifecycleState === "READY_EMPTY" || snapshot.lifecycleState === "READY_WITH_DATA";
  return (
    <div className={`rounded-md border p-3 ${diagnostic ? "border-red-200 bg-red-50" : ready ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
      <div className="flex min-w-0 items-start gap-2">
        {diagnostic ? <AlertTriangle className="mt-0.5 shrink-0 text-red-700" size={18} /> : ready ? <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={18} /> : <Database className="mt-0.5 shrink-0 text-blue-700" size={18} />}
        <div className="min-w-0">
          <div className="break-words font-black" data-no-clip="true">{snapshot.lifecycleState ?? "DETECTING"}</div>
          <p className="mt-1 break-words text-sm">
            {snapshot.lifecycleState === "NOT_CREATED" ? "AI 分析資料庫尚未建立。只有按下 Create Database 並確認後才會建立檔案。" :
              diagnostic ? snapshot.message ?? "資料庫只能以診斷模式開啟；系統不會覆寫或刪除既有檔案。" :
              snapshot.lifecycleState === "READY_EMPTY" ? "資料庫健康且尚無資料，可以選擇正式 Import Package。" :
              snapshot.lifecycleState === "READY_WITH_DATA" ? "資料庫健康且已有可查詢的 AI 分析資料。" :
              "Operation in progress. Please wait."}
          </p>
          {snapshot.errorCode ? <p className="mt-1 break-all font-mono text-xs text-red-800">{snapshot.errorCode}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function AiDatabasePage() {
  const api = window.desktopApp?.aiDatabase;
  const [snapshot, setSnapshot] = useState<Snapshot>({ lifecycleState: "DETECTING" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    const result = await api?.lifecycle({ requestId: makeRequestId("lifecycle") });
    setSnapshot(result?.snapshot ?? { lifecycleState: "ERROR", message: result?.message ?? "Lifecycle detection failed." });
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);

  const ready = snapshot.lifecycleState === "READY_EMPTY" || snapshot.lifecycleState === "READY_WITH_DATA";
  const run = async (name: string, operation: () => Promise<Record<string, any>> | undefined) => {
    setBusy(name); setNotice("");
    try {
      const result = await operation();
      setNotice(result?.ok === false ? `${result.errorCode ?? "FAILED"}: ${result.message ?? "Operation failed"}` : name === "backup" ? `Backup created: ${result?.backupPath ?? "-"}` : "");
      await refresh();
      return result;
    } finally { setBusy(""); }
  };

  const createDatabase = async () => {
    if (!window.confirm(`建立 AI 分析資料庫？\n\n${snapshot.databasePath ?? ""}\n\nExisting files are never overwritten.`)) return;
    await run("create", () => api?.create({ requestId: makeRequestId("create") }));
  };
  const selectPackage = async () => {
    const result = await run("preflight", () => api?.selectImport({ requestId: makeRequestId("select") }));
    if (result && !result.canceled) setPreview(result);
  };
  const confirmImport = async () => {
    if (!preview?.ok || !preview.filePath || !window.confirm(`匯入 ${preview.recordCount} 筆 AI 分析資料？\nImport will run in one SQLite transaction.`)) return;
    const result = await run("import", () => api?.importPackage({ requestId: makeRequestId("import"), filePath: preview.filePath, confirmed: true }));
    if (result?.ok) {
      setPreview(null);
      setNotice(`匯入完成：新增 ${result.insertedCount}、覆蓋 ${result.replacedCount}、保護略過 ${result.protectedSkipCount}、No-op ${result.identicalNoopCount}`);
    }
  };

  const details = useMemo(() => [
    ["File Name", snapshot.databaseFileName],
    ["Full Path", snapshot.databasePath],
    ["Schema", `${snapshot.schemaName ?? "jaa-ai-analysis-sqlite"} v${snapshot.schemaVersion ?? 1}`],
    ["SQLite Runtime", snapshot.sqliteRuntimeVersion ?? "node:sqlite"],
    ["Size", size(Number(snapshot.sizeBytes ?? 0))],
    ["Integrity", snapshot.integrity ?? "-"],
    ["Foreign Keys", Number(snapshot.foreignKeyErrors ?? 0) === 0 ? "PASS" : `FAILED (${snapshot.foreignKeyErrors})`],
    ["Invariants", Number(snapshot.invariantErrors ?? 0) === 0 ? "PASS" : `FAILED (${snapshot.invariantErrors})`],
    ["Journal Mode", snapshot.journalMode ?? "-"],
    ["Created", snapshot.createdAtUtc ?? "-"],
    ["Modified", snapshot.modifiedAtUtc ?? "-"],
    ["Last Opened", snapshot.lastOpenedAtUtc ?? "-"],
    ["Last Import", snapshot.lastImportAtUtc ?? "-"]
  ], [snapshot]);

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="AI 分析資料庫" subtitle="AI Analysis Database Lifecycle" connected={ready} />
      <StateBanner snapshot={snapshot} />

      {snapshot.lifecycleState === "NOT_CREATED" ? (
        <SectionCard title="Create AI Analysis Database" subtitle="明確建立資料庫">
          <div className="space-y-4">
            <dl className="grid min-w-0 gap-3 md:grid-cols-2">
              <Detail label="Target Path" value={snapshot.databasePath} mono copy />
              <Detail label="Frozen Schema" value={`${snapshot.schemaName} v${snapshot.schemaVersion}`} />
            </dl>
            <p className="break-words text-sm text-muted">建立流程會在同一目錄產生暫存 DB、執行 DDL、integrity／foreign-key／invariant 檢查，再以 atomic rename 發佈。若目標已存在，操作會停止且不覆寫。</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" type="button" disabled={Boolean(busy)} onClick={() => void createDatabase()}><Database size={16} /> {busy === "create" ? "Creating..." : "Create Database"}</button>
              <button className="btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={16} /> Re-detect</button>
            </div>
          </div>
        </SectionCard>
      ) : null}

      {snapshot.exists ? (
        <>
          <ResponsiveMetricGrid>
            <MetricCard label="AI Records" value={String(snapshot.recordCount ?? 0)} icon={Database} />
            <MetricCard label="Skill Findings" value={String(snapshot.findingCount ?? 0)} icon={FileCheck2} tone="bg-emerald-50 text-emerald-700" />
            <MetricCard label="Reviewed Records" value={String(snapshot.reviewedCount ?? 0)} icon={ShieldCheck} tone="bg-amber-50 text-amber-700" />
            <MetricCard label="Matched Sources" value={String(snapshot.matchedCount ?? 0)} icon={Link2} tone="bg-cyan-50 text-cyan-700" />
            <MetricCard label="Source Contexts" value={String(snapshot.sourceContextCount ?? 0)} icon={Activity} tone="bg-indigo-50 text-indigo-700" />
            <MetricCard label="Import Batches" value={String(snapshot.importBatchCount ?? 0)} icon={Archive} tone="bg-slate-100 text-slate-700" />
          </ResponsiveMetricGrid>

          <SectionCard title="Database Overview" subtitle="資料庫概況" action={<div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="button" disabled={!ready || Boolean(busy)} onClick={() => void selectPackage()}><Upload size={16} /> Import Data</button>
            <button className="btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={16} /> Refresh</button>
            <button className="btn-secondary" type="button" disabled={!ready || Boolean(busy)} onClick={() => void run("health", () => api?.healthCheck({ requestId: makeRequestId("health") }))}><Activity size={16} /> Health Check</button>
            <button className="btn-secondary" type="button" disabled={!ready || Boolean(busy)} onClick={() => void run("backup", () => api?.backup({ requestId: makeRequestId("backup") }))}><HardDrive size={16} /> Backup</button>
            <button className="btn-secondary" type="button" onClick={() => void api?.openFolder({ requestId: makeRequestId("folder") })}><FolderOpen size={16} /> Open Folder</button>
            <button className="btn-secondary" type="button" onClick={() => void api?.exportDiagnostics({ requestId: makeRequestId("diagnostics") })}><FileCheck2 size={16} /> Export Diagnostics</button>
          </div>}>
            <dl className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {details.map(([label, value]) => <Detail key={label} label={label} value={value} mono={label === "Full Path"} copy={label === "Full Path"} />)}
            </dl>
          </SectionCard>
        </>
      ) : null}

      <SectionCard title="Import Package" subtitle="匯入套件" action={<button className="btn-primary" type="button" onClick={() => void selectPackage()} disabled={!ready || Boolean(busy)}><Upload size={16} /> Select JSON</button>}>
        {!ready ? <p className="text-sm text-muted">Create and validate the AI Analysis database before selecting an import package.</p> : !preview ? <p className="text-sm text-muted">只接受 jaa-ai-analysis-import-package v1.0.0。Manual Review、Pending Analysis 與 legacy analyzed JSON 會以明確 file-role 錯誤拒絕，Preflight 失敗不會寫入 DB 或 Import History。</p> : (
          <div className="space-y-3">
            <div className={`rounded-md border p-3 text-sm ${preview.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <div className="font-black" data-no-clip="true">{preview.ok ? "Preflight Passed" : "Preflight Failed"}</div>
              <div className="break-all text-xs">{preview.fileName} · {size(Number(preview.fileSizeBytes ?? 0))}</div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1"><span>Records: {preview.recordCount ?? 0}</span><span>Findings: {preview.findingCount ?? 0}</span><span>Review: {preview.reviewState ?? "-"}</span><span>Insert: {preview.insertCount ?? 0}</span><span>Replace: {preview.replaceCount ?? 0}</span><span>Protected: {preview.protectedSkipCount ?? 0}</span><span>No-op: {preview.identicalNoopCount ?? 0}</span></div>
              {preview.errors?.length ? <ul className="mt-2 list-disc pl-5">{preview.errors.map((error: any, index: number) => <li className="break-words" key={`${error.code}-${index}`}><strong>{error.code}</strong>: {error.message}{error.path ? ` (${error.path})` : ""}</li>)}</ul> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" type="button" onClick={() => void confirmImport()} disabled={!preview.ok || Boolean(busy)}><Upload size={16} /> {busy === "import" ? "Importing..." : "Confirm Import"}</button>
              <button className="btn-secondary" type="button" onClick={() => { setPreview(null); void api?.cancelPreflight({ requestId: makeRequestId("cancel") }); }}>Cancel</button>
            </div>
          </div>
        )}
        {notice ? <p className="mt-3 break-words rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-bold">{notice}</p> : null}
      </SectionCard>

      {snapshot.exists ? (
        <>
          <SectionCard title="Source Contexts" subtitle="來源資料庫脈絡">
            <ResponsiveTableContainer>
              <table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b text-muted"><th className="p-2">Source Database</th><th className="p-2">Jira Fingerprint</th><th className="p-2">Host</th><th className="p-2">Records</th><th className="p-2">Last Imported</th></tr></thead><tbody>{(snapshot.sourceContexts ?? []).map((item: any) => <tr className="border-b" key={`${item.source_database_id}-${item.jira_server_fingerprint}`}><td className="max-w-[260px] truncate p-2" title={item.source_database_id} data-allow-truncate="true">{item.source_database_id}</td><td className="max-w-[260px] truncate p-2" title={item.jira_server_fingerprint} data-allow-truncate="true">{item.jira_server_fingerprint}</td><td className="p-2">{item.jira_server_host ?? "-"}</td><td className="p-2">{item.record_count}</td><td className="p-2">{item.last_imported_at_utc ?? "-"}</td></tr>)}</tbody></table>
            </ResponsiveTableContainer>
          </SectionCard>
          <SectionCard title="Import History" subtitle="匯入歷史" action={<button className="btn-secondary" type="button" disabled={!ready || Boolean(busy)} onClick={async () => { const result = await run("relink", () => api?.relink({ requestId: makeRequestId("relink") })); if (result?.ok) setNotice(`Relink completed: ${result.total}`); }}><Link2 size={16} /> Relink</button>}>
            <ResponsiveTableContainer>
              <table className="min-w-[980px] w-full text-left text-xs"><thead><tr className="border-b text-muted"><th className="p-2">Package</th><th className="p-2">Review</th><th className="p-2">Status</th><th className="p-2">Records</th><th className="p-2">Inserted</th><th className="p-2">Replaced</th><th className="p-2">Protected</th><th className="p-2">No-op</th><th className="p-2">Completed</th></tr></thead><tbody>{(snapshot.batches ?? []).map((batch: any) => <tr className="border-b" key={batch.import_batch_id}><td className="max-w-[260px] truncate p-2" title={batch.package_id} data-allow-truncate="true">{batch.package_id}</td><td className="p-2">{batch.review_coverage_state}</td><td className="p-2 font-bold">{batch.status}</td><td className="p-2">{batch.declared_record_count}</td><td className="p-2">{batch.inserted_count}</td><td className="p-2">{batch.replaced_count}</td><td className="p-2">{batch.protected_skip_count}</td><td className="p-2">{batch.identical_noop_count}</td><td className="p-2">{batch.completed_at_utc ?? "-"}</td></tr>)}</tbody></table>
            </ResponsiveTableContainer>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}