import { useCallback, useEffect, useState } from "react";
import { Database, FileCheck2, FolderOpen, Link2, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { ResponsiveMetricGrid, ResponsiveTableContainer } from "../components/Responsive";
import { SectionCard } from "../components/SectionCard";

type Overview = Record<string, any>;
type Preview = Record<string, any>;

function size(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes, index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function AiDatabasePage() {
  const api = window.desktopApp?.aiDatabase;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => { const result = await api?.overview(); setOverview(result ?? null); }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);

  const selectPackage = async () => {
    setNotice("");
    const result = await api?.selectImport();
    if (result && !result.canceled) setPreview(result);
  };
  const confirmImport = async () => {
    if (!preview?.ok || !preview.filePath || !window.confirm(`匯入 ${preview.recordCount} 筆 AI 分析資料？\nImport will run in one SQLite transaction.`)) return;
    setBusy(true);
    try { const result = await api?.importPackage({ filePath: preview.filePath, confirmed: true }); setNotice(result?.ok ? `匯入完成：新增 ${result.insertedCount}、覆蓋 ${result.replacedCount}、保護略過 ${result.protectedSkipCount}、No-op ${result.identicalNoopCount}` : result?.message ?? "匯入失敗"); await refresh(); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="AI 分析資料庫" subtitle="AI Analysis Database" connected={false} />
      <ResponsiveMetricGrid>
        <MetricCard label="AI Records" value={String(overview?.recordCount ?? 0)} icon={Database} />
        <MetricCard label="Skill Findings" value={String(overview?.findingCount ?? 0)} icon={FileCheck2} tone="bg-emerald-50 text-emerald-700" />
        <MetricCard label="Reviewed Records" value={String(overview?.reviewedCount ?? 0)} icon={ShieldCheck} tone="bg-amber-50 text-amber-700" />
        <MetricCard label="Matched Sources" value={String(overview?.matchedCount ?? 0)} icon={Link2} tone="bg-cyan-50 text-cyan-700" />
      </ResponsiveMetricGrid>
      <SectionCard title="Database Health" subtitle="資料庫健康狀態" action={<div className="flex flex-wrap gap-2"><button className="btn-secondary" type="button" onClick={() => void api?.openFolder()}><FolderOpen size={16} /> Open Folder</button><button className="btn-secondary" type="button" onClick={() => void refresh()}><RefreshCw size={16} /> Refresh</button></div>}>
        <dl className="grid min-w-0 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
          <div><dt className="font-bold text-muted">Path</dt><dd className="break-all font-mono text-xs" title={overview?.databasePath}>{overview?.databasePath ?? "-"}</dd></div>
          <div><dt className="font-bold text-muted">Schema</dt><dd data-no-clip="true">v{overview?.schemaVersion ?? 0}</dd></div>
          <div><dt className="font-bold text-muted">Integrity</dt><dd data-no-clip="true">{overview?.integrity ?? "-"}</dd></div>
          <div><dt className="font-bold text-muted">Size</dt><dd data-no-clip="true">{size(Number(overview?.sizeBytes ?? 0))}</dd></div>
        </dl>
      </SectionCard>
      <SectionCard title="Import Package" subtitle="匯入套件" action={<button className="btn-primary" type="button" onClick={() => void selectPackage()} disabled={busy}><Upload size={16} /> Select JSON</button>}>
        {!preview ? <p className="text-sm text-muted">只接受 jaa-ai-analysis-import-package v1.0.0。選檔後先執行完整 preflight，確認前不寫入資料庫。</p> : (
          <div className="space-y-3">
            <div className={`rounded-md border p-3 text-sm ${preview.ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
              <div className="font-black" data-no-clip="true">{preview.ok ? "Preflight Passed" : "Preflight Failed"}</div>
              <div className="break-all text-xs">{preview.fileName} · {size(preview.fileSizeBytes)}</div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1"><span>Records: {preview.recordCount ?? 0}</span><span>Findings: {preview.findingCount ?? 0}</span><span>Review: {preview.reviewState ?? "-"}</span><span>Insert: {preview.insertCount ?? 0}</span><span>Replace: {preview.replaceCount ?? 0}</span><span>Protected: {preview.protectedSkipCount ?? 0}</span><span>No-op: {preview.identicalNoopCount ?? 0}</span></div>
              {preview.errors?.length ? <ul className="mt-2 list-disc pl-5">{preview.errors.map((error: any, index: number) => <li className="break-words" key={`${error.code}-${index}`}>{error.code}: {error.message}</li>)}</ul> : null}
            </div>
            <button className="btn-primary" type="button" onClick={() => void confirmImport()} disabled={!preview.ok || busy}><Upload size={16} /> {busy ? "Importing..." : "Confirm Import"}</button>
          </div>
        )}
        {notice ? <p className="mt-3 break-words rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-bold">{notice}</p> : null}
      </SectionCard>
      <SectionCard title="Import History" subtitle="匯入歷史" action={<div className="flex flex-wrap gap-2"><button className="btn-secondary" type="button" onClick={async () => { setBusy(true); try { const result = await api?.relink(); setNotice(result?.ok ? `Relink completed: ${result.total}` : result?.message ?? "Relink failed"); await refresh(); } finally { setBusy(false); } }}><Link2 size={16} /> Relink</button><button className="btn-secondary" type="button" onClick={() => void api?.exportDiagnostics()}><FileCheck2 size={16} /> Export Diagnostics</button></div>}>
        <ResponsiveTableContainer>
          <table className="min-w-[980px] w-full text-left text-xs"><thead><tr className="border-b text-muted"><th className="p-2">Package</th><th className="p-2">Review</th><th className="p-2">Status</th><th className="p-2">Records</th><th className="p-2">Inserted</th><th className="p-2">Replaced</th><th className="p-2">Protected</th><th className="p-2">No-op</th><th className="p-2">Completed</th></tr></thead><tbody>{(overview?.batches ?? []).map((batch: any) => <tr className="border-b" key={batch.import_batch_id}><td className="max-w-[260px] truncate p-2" title={batch.package_id}>{batch.package_id}</td><td className="p-2">{batch.review_coverage_state}</td><td className="p-2 font-bold">{batch.status}</td><td className="p-2">{batch.declared_record_count}</td><td className="p-2">{batch.inserted_count}</td><td className="p-2">{batch.replaced_count}</td><td className="p-2">{batch.protected_skip_count}</td><td className="p-2">{batch.identical_noop_count}</td><td className="p-2">{batch.completed_at_utc ?? "-"}</td></tr>)}</tbody></table>
        </ResponsiveTableContainer>
      </SectionCard>
    </div>
  );
}
