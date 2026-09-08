import { aiStatusLabelV043 } from "../../shared/aiResultProjectionV043";
import { formatDisplayTime } from "../utils/displayTime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Archive, Copy, Database, FileCheck2, FolderOpen, HardDrive, Link2, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid, ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";
import { DatabaseOverviewDetails, DatabaseOverviewToolbar } from "../components/DatabaseOverviewComponents";

type Snapshot = Record<string, any>;
type Preview = Record<string, any>;

const makeRequestId = (kind: string) => `v043-${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function size(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function Detail({ label, value, mono = false, copy = false, rawValue }: { label: string; value: unknown; mono?: boolean; copy?: boolean; rawValue?: unknown }) {
  const text = value === null || value === undefined || value === "" ? "-" : String(value);
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className={`mt-1 flex min-w-0 items-start gap-1 break-words text-sm ${mono ? "font-mono text-xs" : ""}`} title={String(rawValue ?? text)}>
        <span className="min-w-0 break-all">{text}</span>
        {copy && text !== "-" ? <button className="icon-btn h-7 w-7 shrink-0" type="button" title={`Copy ${label}`} onClick={() => void navigator.clipboard.writeText(text)}><Copy size={14} /></button> : null}
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
          <div className="break-words font-black" data-no-clip="true">{aiStatusLabelV043(snapshot.lifecycleState ?? "DETECTING")}</div>
          <p className="mt-1 break-words text-sm">
            {snapshot.lifecycleState === "NOT_SELECTED" ? "尚未選擇 AI 分析資料庫。請建立新資料庫或開啟既有 .sqlite/.db。" :
              snapshot.lifecycleState === "FILE_NOT_FOUND" ? "最後使用的 AI 資料庫找不到；系統不會建立空白替代檔，也不會自動 fallback。" :
              snapshot.lifecycleState === "NOT_CREATED" ? "AI 分析資料庫尚未建立。" :
              snapshot.lifecycleState === "MIGRATION_REQUIRED" ? "偵測到 schema v1。本版不會自動修改或遷移此檔案；請保留原檔並使用 schema v2 資料庫。" :
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
  const [writeJob, setWriteJob] = useState<Record<string, any>>({ running: false });
  const [writeElapsed, setWriteElapsed] = useState(0);
  const [notice, setNotice] = useState("");
  const [relinkNotice, setRelinkNotice] = useState("");

  const refresh = useCallback(async () => {
    const result = await api?.lifecycle({ requestId: makeRequestId("lifecycle") });
    setSnapshot(result?.snapshot ?? { lifecycleState: "ERROR", message: result?.message ?? "Lifecycle detection failed." });
  }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { let active = true; const start = performance.now(); const tick = async () => { const job = await api?.writeState(); if (active && job) { setWriteJob(job); setWriteElapsed((performance.now() - start) / 1000); } }; void tick(); const timer = window.setInterval(() => void tick(), 500); return () => { active = false; window.clearInterval(timer); }; }, [api, busy]);

  const ready = snapshot.lifecycleState === "READY_EMPTY" || snapshot.lifecycleState === "READY_WITH_DATA";
  const run = async (name: string, operation: () => Promise<Record<string, any>> | undefined) => {
    const showNotice = name === "relink" ? setRelinkNotice : setNotice;
    setBusy(name); showNotice("");
    try {
      const result = await operation();
      showNotice(result?.ok === false ? `${result.errorCode ?? "FAILED"}: ${result.message ?? "Operation failed"}` : name === "backup" ? `Backup created: ${result?.backupPath ?? "-"}` : "");
      await refresh();
      return result;
    } catch (error) { showNotice(error instanceof Error ? error.message : String(error)); return { ok: false }; } finally { setBusy(""); }
  };

  const createDatabase = async () => {
    await run("create", () => api?.create({ requestId: makeRequestId("create") }));
  };
  const openSwitchDatabase = async () => {
    const result = await run("switch", () => api?.openSwitch({ requestId: makeRequestId("switch") }));
    if (result?.ok && !result.canceled) setNotice(`已切換至 ${String((result.snapshot as Snapshot | undefined)?.databaseFileName ?? "AI database")}`);
  };  const selectPackage = async () => {
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
    ["Path Mode", snapshot.pathMode ?? "-"],
    ["Database Identity", snapshot.databaseId ?? "-"],
    ["Full Path", snapshot.databasePath],
    ["Schema", `${snapshot.schemaName ?? "jaa-ai-analysis-sqlite"} v${snapshot.schemaVersion ?? 1}`],
    ["SQLite Runtime", snapshot.sqliteRuntimeVersion ?? "node:sqlite"],
    ["Size", size(Number(snapshot.sizeBytes ?? 0))],
    ["Integrity", snapshot.integrity ?? "-"],
    ["Foreign Keys", snapshot.foreignKeyErrors == null ? "未檢查" : Number(snapshot.foreignKeyErrors) === 0 ? "PASS" : `FAILED (${snapshot.foreignKeyErrors})`],

    ["Journal Mode", snapshot.journalMode ?? "-"],
    ["Created", snapshot.createdAtUtc ?? "未記錄"],
    ["Modified", snapshot.modifiedAtUtc ?? "-"],
    ["Last Opened", snapshot.lastOpenedAtUtc ?? "-"],
    ["Last Import", snapshot.lastImportAtUtc ?? "尚無成功匯入紀錄"]
  ], [snapshot]);

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="AI 分析資料庫" subtitle="AI Analysis Database" connected={false} />
      <DatabaseOverviewToolbar testId="ai-database-primary-actions">
        <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => void createDatabase()}><Database size={16} /> 建立新資料庫</button>
        <button className="btn" type="button" disabled={Boolean(busy)} onClick={() => void openSwitchDatabase()}><FolderOpen size={16} /> 開啟／切換資料庫</button>
        <button className="btn btn-primary" type="button" title={!ready ? "請先建立或開啟健康的 AI 資料庫" : "匯入 Package 2.0.0 或 2.0.1"} disabled={!ready || Boolean(busy)} onClick={() => void selectPackage()}><Upload size={16} /> 匯入 Package v2</button>
        <details className="relative"><summary className="btn cursor-pointer list-none">更多操作</summary><div className="absolute right-0 top-11 z-30 grid w-56 gap-1 rounded-md border border-line bg-white p-2 shadow-xl"><button className="btn justify-start" type="button" onClick={() => void refresh()}><RefreshCw size={16} /> Refresh</button><button className="btn justify-start" type="button" disabled={!ready} onClick={() => void run("health", () => api?.healthCheck({ requestId: makeRequestId("health") }))}><Activity size={16} /> Health Check</button><button className="btn justify-start" type="button" disabled={!ready} onClick={() => void run("backup", () => api?.backup({ requestId: makeRequestId("backup") }))}><HardDrive size={16} /> Backup</button><button className="btn justify-start" type="button" onClick={() => void api?.openFolder({ requestId: makeRequestId("folder") })}><FolderOpen size={16} /> Open Folder</button><button className="btn justify-start" type="button" onClick={() => void api?.exportDiagnostics({ requestId: makeRequestId("diagnostics") })}><FileCheck2 size={16} /> Export Diagnostics</button><button className="btn justify-start" type="button" onClick={() => void api?.openWorkbench({ requestId: makeRequestId("workbench") })}><FileCheck2 size={16} /> Review Workbench</button></div></details>
      </DatabaseOverviewToolbar>
      <StateBanner snapshot={snapshot} />
      {writeJob.running ? <div role="status" className="flex flex-wrap items-center gap-3 border-l-4 border-blue-500 bg-blue-50 p-3 text-sm">{writeJob.phase >= 2 ? "正在提交，取消已太晚" : "正在執行資料庫工作"} · {writeElapsed.toFixed(1)} 秒<button className="btn" disabled={writeJob.phase >= 1} onClick={() => void api?.cancelWrite({ requestId: writeJob.requestId })}>取消工作</button></div> : null}


      {snapshot.exists ? (
        <>
          <ResponsiveMetricGrid>
            <MetricCard label="AI Records" value={String(snapshot.recordCount ?? 0)} icon={Database} />
            <MetricCard label="Skill Findings" value={String(snapshot.findingCount ?? 0)} icon={FileCheck2} tone="bg-emerald-50 text-emerald-700" />
            <MetricCard label="已開始驗收 / Started" value={String(snapshot.reviewedCount ?? 0)} icon={ShieldCheck} tone="bg-amber-50 text-amber-700" />
            <MetricCard label="已完成驗收 / Completed" value={String(snapshot.completedReviewCount ?? 0)} icon={ShieldCheck} />
            <MetricCard label="Matched Sources" value={String(snapshot.matchedCount ?? 0)} icon={Link2} tone="bg-cyan-50 text-cyan-700" />
            <MetricCard label="Complete Trace" value={String(snapshot.traceCompletenessCounts?.COMPLETE ?? 0)} icon={Activity} tone="bg-indigo-50 text-indigo-700" />
            <MetricCard label="Import Batches" value={String(snapshot.importBatchCount ?? 0)} icon={Archive} tone="bg-slate-100 text-slate-700" />
          </ResponsiveMetricGrid>

          <SectionCard title="資料庫概況" subtitle="Database Overview">
            <DatabaseOverviewDetails>
              {details.map(([label, value]) => <Detail key={label} label={label} rawValue={value} value={typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? formatDisplayTime(value) : value} mono={label === "Full Path"} copy={label === "Full Path"} />)}
            </DatabaseOverviewDetails>
          </SectionCard>
        </>
      ) : null}

      <SectionCard title="匯入套件" subtitle="Import Package">
        {!ready ? <p className="text-sm text-muted">Create and validate the AI Analysis database before selecting an import package.</p> : !preview ? <p className="text-sm text-muted">支援 Package 2.0.0／2.0.1：尚未驗收、部分驗收、驗收完成。請先選擇套件並確認預覽。</p> : (
          <div className="space-y-3">
            <div className={`rounded-md border p-3 text-sm ${preview.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <div className="font-black" data-no-clip="true">{preview.ok ? "Preflight Passed" : "Preflight Failed"}</div>
              <div className="break-all text-xs">{preview.fileName} · {size(Number(preview.fileSizeBytes ?? 0))}</div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1"><span>Records: {preview.recordCount ?? 0}</span><span>Findings: {preview.findingCount ?? 0}</span><span>Review: {preview.reviewRank ?? "-"}</span><span>Derived: {preview.derivedReviewRank ?? "-"}</span><span>Insert: {preview.insertCount ?? 0}</span><span>Replace: {preview.replaceCount ?? 0}</span><span>Protected: {preview.protectedSkipCount ?? 0}</span><span>No-op: {preview.identicalNoopCount ?? 0}</span></div>
              {preview.errors?.length ? <ul className="mt-2 list-disc pl-5">{preview.errors.map((error: any, index: number) => <li className="break-words" key={`${error.code}-${index}`}><strong>{error.code}</strong>: {error.message}{error.path ? ` (${error.path})` : ""}</li>)}</ul> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" type="button" onClick={() => void confirmImport()} disabled={!preview.ok || Boolean(busy)}><Upload size={16} /> 確認匯入 / Confirm Import</button>
              <button className="btn" type="button" onClick={() => { setPreview(null); void api?.cancelPreflight({ requestId: makeRequestId("cancel") }); }}>Cancel</button>
            </div>
          </div>
        )}
        {notice ? <p role="status" className="mt-3 break-words rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-bold">{notice}</p> : null}
      </SectionCard>

      {snapshot.exists ? (
        <>
          <SectionCard title="來源配對 / Source Link" subtitle="每次配對都會保留執行紀錄" action={<button className="btn btn-primary" type="button" disabled={!ready || Boolean(busy)} onClick={async () => { const result = await run("relink", () => api?.relink({ requestId: makeRequestId("relink") })); if (result?.ok) setRelinkNotice(`重新配對完成：${result.total} 筆；錯誤 ${result.counts?.ERROR ?? 0} 筆`); }}><Link2 size={16} /> 重新配對來源</button>}>
            {relinkNotice ? <p role="status" className="mb-3 break-words text-sm">{relinkNotice}</p> : null}<div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(snapshot.linkOutcomeCounts ?? {}).map(([status, count]) => <div className="min-w-0 rounded-md border border-line p-3" key={status}><div className="break-words text-xs font-bold text-muted">{aiStatusLabelV043(status)}</div><div className="mt-1 text-2xl font-black" data-no-clip="true">{String(count)}</div></div>)}</div>
            {!Object.keys(snapshot.linkOutcomeCounts ?? {}).length ? <p className="text-sm text-muted">尚無配對紀錄。Import 或 Relink 後會顯示 PRIMARY/FALLBACK MATCHED、AMBIGUOUS、NOT_FOUND 與 ERROR counts。</p> : null}
          </SectionCard>
          {snapshot.recentDatabases?.length ? <SectionCard title="最近使用 / Recent Databases" subtitle="忘記路徑不會刪除實體 DB"><ResponsiveTableContainer><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b text-muted"><th className="p-2">File</th><th className="p-2">Path</th><th className="p-2">Mode</th><th className="p-2">Identity</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead><tbody>{snapshot.recentDatabases.map((item: Snapshot) => <tr className="border-b" key={`${item.databaseId}-${item.value}`}><td className="p-2 font-bold">{item.fileName}</td><td className="max-w-[360px] truncate p-2" title={String(item.resolvedPath)} data-allow-truncate="true">{item.resolvedPath}</td><td className="p-2">{item.mode}</td><td className="max-w-[220px] truncate p-2 font-mono" title={String(item.databaseId)} data-allow-truncate="true">{item.databaseId}</td><td className="p-2">{item.active ? "ACTIVE" : item.exists ? "READY" : "FILE_NOT_FOUND"}</td><td className="p-2"><div className="flex gap-2"><button className="btn" type="button" disabled={!item.exists || item.active || Boolean(busy)} onClick={() => void run("switch", () => api?.openSwitch({ requestId: makeRequestId("recent"), filePath: String(item.resolvedPath) }))}>使用</button><button className="btn" type="button" disabled={item.active || Boolean(busy)} onClick={() => void run("forget", () => api?.forget({ requestId: makeRequestId("forget"), databaseId: String(item.databaseId) }))}>忘記</button></div></td></tr>)}</tbody></table></ResponsiveTableContainer></SectionCard> : null}
          <SectionCard title="來源資料庫脈絡" subtitle="Source Contexts">
            <ResponsiveTableContainer>
              <table className="w-full min-w-[760px] text-left text-xs"><thead><tr className="border-b text-muted"><th className="p-2">Source Database</th><th className="p-2">Generation</th><th className="p-2">Source Schema</th><th className="p-2">Records</th><th className="p-2">Last Imported</th></tr></thead><tbody>{(snapshot.sourceContexts ?? []).map((item: any) => <tr className="border-b" key={`${item.source_database_id}-${item.database_generation}`}><td className="max-w-[260px] truncate p-2" title={item.source_database_id} data-allow-truncate="true">{item.source_database_id}</td><td className="max-w-[260px] truncate p-2" title={item.database_generation} data-allow-truncate="true">{item.database_generation}</td><td className="p-2">{item.source_schema_version ?? "-"}</td><td className="p-2">{item.record_count}</td><td className="p-2">{item.last_imported_at ?? "-"}</td></tr>)}</tbody></table>
            </ResponsiveTableContainer>
          </SectionCard>
          <SectionCard title="匯入歷史" subtitle="Import History">
            <ResponsiveTableContainer>
              <table className="min-w-[820px] w-full text-left text-xs"><thead><tr className="border-b text-muted"><th className="p-2">Package</th><th className="p-2">Schema</th><th className="p-2">Review Rank</th><th className="p-2">Transaction</th><th className="p-2">Records</th><th className="p-2">Imported</th></tr></thead><tbody>{(snapshot.batches ?? []).map((batch: any) => <tr className="border-b" key={batch.import_batch_id}><td className="max-w-[280px] truncate p-2" title={batch.package_id} data-allow-truncate="true">{batch.package_id}</td><td className="p-2">{batch.package_schema_version}</td><td className="p-2">{batch.review_rank}</td><td className="p-2 font-bold">{batch.transaction_status}</td><td className="p-2" data-no-clip="true">{batch.record_count}</td><td className="p-2">{batch.imported_at ?? "-"}</td></tr>)}</tbody></table>
            </ResponsiveTableContainer>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}