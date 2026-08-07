import { Download, FolderOpen, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PendingAnalysisExportRequest, PendingAnalysisProgress, PendingAnalysisSourceView } from "../../shared/pendingAnalysisContract";
import {
  claimPendingAnalysisRendererStart,
  isPendingAnalysisActive,
  isPendingAnalysisTerminal,
  releasePendingAnalysisRendererStart,
  shouldAcceptPendingAnalysisProgress
} from "./pendingAnalysisExportState";

type Props = {
  sourceView: PendingAnalysisSourceView;
  filteredCount: number;
  query: Record<string, unknown>;
  expectedDatabaseIdentity: string;
  issueKey?: string;
  userScope?: unknown;
};

export function PendingAnalysisExportPanel(props: Props) {
  const [run, setRun] = useState<PendingAnalysisProgress | null>(null);
  const [starting, setStarting] = useState(false);
  const acceptedRunId = useRef("");
  const rejectedRunId = useRef("");
  const awaitingNewRun = useRef(false);
  const active = starting || isPendingAnalysisActive(run);
  const forThisView = run?.sourceView === props.sourceView;
  const disabledReason = props.filteredCount === 0
    ? "No filtered records to export. / 沒有可匯出的篩選紀錄。"
    : active ? "An export is already running. / 匯出正在執行中。" : "";
  const label = useMemo(() => props.sourceView === "ISSUE_ACTIVITY_EVENTS" ? "Issue Viewer · Activity Events" : "User Viewer · All Activity Events", [props.sourceView]);

  useEffect(() => {
    const accept = (progress: PendingAnalysisProgress) => {
      if (awaitingNewRun.current && progress.exportId === rejectedRunId.current) return;
      if (!shouldAcceptPendingAnalysisProgress(acceptedRunId.current, progress) && !awaitingNewRun.current) return;
      awaitingNewRun.current = false;
      acceptedRunId.current = progress.exportId;
      setStarting(false);
      setRun(progress);
    };
    void window.desktopApp?.pendingAnalysisExport?.getStatus().then((status) => { if (status) accept(status); });
    return window.desktopApp?.pendingAnalysisExport?.onProgress(accept);
  }, []);

  async function start() {
    if (active || !claimPendingAnalysisRendererStart()) return;
    rejectedRunId.current = acceptedRunId.current;
    acceptedRunId.current = "";
    awaitingNewRun.current = true;
    setStarting(true);
    const request: PendingAnalysisExportRequest = {
      sourceView: props.sourceView,
      query: structuredClone(props.query),
      expectedFilteredCount: props.filteredCount,
      expectedDatabaseIdentity: props.expectedDatabaseIdentity,
      issueKey: props.issueKey,
      userScope: props.userScope
    };
    try { await window.desktopApp?.pendingAnalysisExport?.start(request); }
    catch (error) {
      setStarting(false);
      setRun((current) => current && isPendingAnalysisTerminal(current) ? current : current ? {
        ...current, status: "failed", stage: "failed", processedRecords: 0, serializedRecords: 0,
        writtenRecords: 0, exportedCount: 0, percentage: 0, message: error instanceof Error ? error.message : String(error)
      } : current);
    } finally {
      awaitingNewRun.current = false;
      releasePendingAnalysisRendererStart();
    }
  }

  return <div data-testid={`pending-analysis-export-${props.sourceView.toLowerCase()}`} className="rounded-md border border-blue-200 bg-blue-50 p-3">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 text-sm text-blue-950">
        <div className="font-black">Export Compact Diff References / 匯出待分析資料</div>
        <div className="mt-1 break-words text-xs font-semibold">Source / 來源：{label} · Filtered / 篩選後：<span data-no-clip="true">{props.filteredCount.toLocaleString()}</span> · Status / 狀態：{forThisView ? run?.status ?? "ready" : "ready"}</div>
        <div className="mt-1 max-w-full break-words text-xs font-semibold text-blue-800">Compact reference export: Diff, stable SQLite references, and SHA-256 only. Full Before/After content remains in the source database.</div>
        {disabledReason ? <div className="mt-1 text-xs font-bold text-amber-800">{disabledReason}</div> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {active && run && isPendingAnalysisActive(run) ? <button className="btn" type="button" onClick={() => void window.desktopApp?.pendingAnalysisExport?.cancel({ exportId: run.exportId })}><Square size={15} />Cancel / 取消</button> : null}
        {!active ? <button className="btn btn-primary" type="button" disabled={Boolean(disabledReason)} title={disabledReason || "Export compact Diff references for the complete frozen filtered set"} onClick={() => void start()}><Download size={16} />Export Compact Diff References / 匯出待分析資料</button> : null}
      </div>
    </div>
    {forThisView && run && isPendingAnalysisActive(run) ? <div className="mt-3">
      <div className="h-2 overflow-hidden rounded bg-blue-100"><div className="h-full bg-blue-600 transition-[width]" style={{ width: `${run.percentage}%` }} /></div>
      <div className="mt-1 flex flex-wrap justify-between gap-2 text-xs font-bold text-blue-900"><span>{run.message}</span><span>{run.processedRecords.toLocaleString()} / {run.totalRecords.toLocaleString()} · {run.percentage}%</span></div>
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
