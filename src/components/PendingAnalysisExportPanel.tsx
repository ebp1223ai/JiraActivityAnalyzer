import { Download, FolderOpen, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PendingAnalysisExportRequest, PendingAnalysisProgress, PendingAnalysisSourceView } from "../../shared/pendingAnalysisContract";

type Props = {
  sourceView: PendingAnalysisSourceView;
  filteredCount: number;
  query: Record<string, unknown>;
  expectedDatabaseIdentity: string;
  issueKey?: string;
  userScope?: unknown;
};

const activeStatuses = new Set(["preparing", "filtering", "writing", "finalizing"]);

export function PendingAnalysisExportPanel(props: Props) {
  const [run, setRun] = useState<PendingAnalysisProgress | null>(null);
  const active = Boolean(run && activeStatuses.has(run.status));
  const forThisView = run?.sourceView === props.sourceView;
  const disabledReason = props.filteredCount === 0
    ? "No filtered records to export. / 沒有可匯出的篩選紀錄。"
    : active ? "An export is already running. / 匯出正在執行中。" : "";
  const label = useMemo(() => props.sourceView === "ISSUE_ACTIVITY_EVENTS" ? "Issue Viewer · Activity Events" : "User Viewer · All Activity Events", [props.sourceView]);

  useEffect(() => {
    void window.desktopApp?.pendingAnalysisExport?.getStatus().then((status) => { if (status) setRun(status); });
    return window.desktopApp?.pendingAnalysisExport?.onProgress((progress) => setRun(progress));
  }, []);

  async function start() {
    const request: PendingAnalysisExportRequest = {
      sourceView: props.sourceView,
      query: structuredClone(props.query),
      expectedFilteredCount: props.filteredCount,
      expectedDatabaseIdentity: props.expectedDatabaseIdentity,
      issueKey: props.issueKey,
      userScope: props.userScope
    };
    try { await window.desktopApp?.pendingAnalysisExport?.start(request); }
    catch (error) { setRun((current) => current ? { ...current, status: "failed", message: error instanceof Error ? error.message : String(error) } : current); }
  }

  return <div data-testid={`pending-analysis-export-${props.sourceView.toLowerCase()}`} className="rounded-md border border-blue-200 bg-blue-50 p-3">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 text-sm text-blue-950">
        <div className="font-black">Export Pending Analysis Data / 匯出待分析資料</div>
        <div className="mt-1 break-words text-xs font-semibold">Source / 來源：{label} · Filtered / 篩選後：<span data-no-clip="true">{props.filteredCount.toLocaleString()}</span> · Status / 狀態：{forThisView ? run?.status ?? "ready" : "ready"}</div>
        {disabledReason ? <div className="mt-1 text-xs font-bold text-amber-800">{disabledReason}</div> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {active && forThisView ? <button className="btn" type="button" onClick={() => void window.desktopApp?.pendingAnalysisExport?.cancel({ exportId: run!.exportId })}><Square size={15} />Cancel / 取消</button> : null}
        <button className="btn btn-primary" type="button" disabled={Boolean(disabledReason)} title={disabledReason || "Export the complete frozen filtered set"} onClick={() => void start()}><Download size={16} />Export Pending Analysis Data / 匯出待分析資料</button>
      </div>
    </div>
    {forThisView && run && activeStatuses.has(run.status) ? <div className="mt-3">
      <div className="h-2 overflow-hidden rounded bg-blue-100"><div className="h-full bg-blue-600 transition-[width]" style={{ width: `${run.percentage}%` }} /></div>
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs font-bold text-blue-900"><span>{run.message}</span><span>{run.exportedCount.toLocaleString()} / {run.filteredCount.toLocaleString()} · {run.percentage}%</span></div>
    </div> : null}
    {forThisView && run?.status === "failed" ? <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-2 text-xs font-bold text-rose-800">{run.errorCode}: {run.message}</div> : null}
    {forThisView && run?.status === "cancelled" ? <div className="mt-3 text-xs font-bold text-amber-800">Export cancelled. No final file was created. / 匯出已取消，未建立正式檔案。</div> : null}
    {forThisView && run?.status === "completed" && run.result ? <div className="mt-3 min-w-0 rounded border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-950">
      <div className="font-black">Export completed / 匯出完成</div>
      <div className="mt-1 break-all">{run.result.fileName}</div>
      <div className="break-all">{run.result.filePath}</div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1"><span>Records: {run.result.exportedCount.toLocaleString()}</span><span>Size: {run.result.sizeBytes.toLocaleString()} bytes</span><span>Elapsed: {Math.round(run.result.elapsedMs)} ms</span></div>
      <div className="mt-1 break-all">SHA-256: {run.result.sha256}</div>
      <button className="btn mt-2" type="button" onClick={() => void window.desktopApp?.pendingAnalysisExport?.openFolder()}><FolderOpen size={15} />Open Folder / 開啟資料夾</button>
    </div> : null}
  </div>;
}
