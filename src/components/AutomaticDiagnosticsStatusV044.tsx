import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, FolderOpen, FileSearch } from 'lucide-react';
import { monitorEventLoopV050 } from '../../shared/eventLoopLagV050';

export function AutomaticDiagnosticsStatusV044() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<Record<string, any> | null>(null);
  const [show, setShow] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  useEffect(() => monitorEventLoopV050(sample => {
    void window.desktopApp?.appDiagnostics?.reportRendererEvent({ event: 'event-loop-lag', ...sample, measuredProcess: 'renderer' }).catch(() => {});
  }), []);
  useEffect(() => {
    let alive = true, recovered = false;
    const update = async () => {
      const api = window.desktopApp?.appDiagnostics; if (!api) return;
      try {
        await api.heartbeat(pathname);
        const next = await api.automaticState();
        if (!alive) return;
        setState(next);
        if (!recovered && next.previous?.status === 'unclean') {
          recovered = true;
          if (!sessionStorage.getItem('jaa-v044-recovery')) { sessionStorage.setItem('jaa-v044-recovery', '1'); navigate('/database', { replace: true }); }
        }
      } catch { if (alive) setState({ writerFailed: true, status: 'DIAGNOSTICS_DEGRADED' }); }
    };
    void update(); const timer = window.setInterval(() => void update(), 2000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [pathname, navigate]);
  if (!state?.writerFailed && state?.previous?.status !== 'unclean') return null;
  const previous = state.previous;
  return <section className="mb-3 min-w-0 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm" aria-label="自動診斷狀態">
    <div className="flex flex-wrap items-center gap-2"><AlertTriangle size={18} /><strong>{state.writerFailed ? '診斷記錄降級，部分紀錄可能未保存' : '上次執行未正常結束，已回到安全起始頁'}</strong></div>
    {previous ? <p className="my-2 break-words">上次時間：{previous.startedAt ?? '未記錄'}。最後頁面：{previous.lastRoute ?? '舊版未記錄'}。原因未確認；保留原有條件，不會自動重跑。</p> : null}
    <div className="flex flex-wrap gap-2">
      {previous ? <button className="btn" onClick={() => setShow(!show)}><FileSearch size={16} />查看上次診斷</button> : null}
      {previous ? <button className="btn" onClick={() => { void window.desktopApp?.appDiagnostics?.exportPrevious().then(r => setExportNotice(r.ok ? `已匯出：${r.folderPath}` : `匯出失敗：${r.errorCode}`)).catch(() => setExportNotice("匯出失敗，請檢查日誌路徑與權限")); }}>匯出上次診斷</button> : null}
      <button className="btn" onClick={() => void window.desktopApp?.appDiagnostics?.openLogsFolder()}><FolderOpen size={16} />開啟日誌資料夾</button>
    </div>
    {exportNotice ? <p role="status" className="break-all">{exportNotice}</p> : null}
    {show && previous ? <div className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words">Session：{previous.sessionId}<br />最後完成：{previous.lastCompletedSpan?.event ?? '未收集'}<br />未完成：{Object.values(previous.openSpans ?? {}).map((s: any) => s.event).join('、') || '舊版未收集或無未完成階段'}<br />診斷完整度：{previous.diagnosticCompleteness ?? '未知'}</div> : null}
  </section>;
}
