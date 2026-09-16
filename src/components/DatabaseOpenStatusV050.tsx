import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
export function DatabaseOpenStatusV050() {
  const [state, setState] = useState<{ stage: string; startedAt: string; elapsedMs: number; error: string; active: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true, pending = false;
    const refresh = async () => {
      setNow(Date.now()); if (pending) return;
      pending = true;
      try { const next = await window.desktopApp?.databases?.openState(); if (active && next) setState(next); }
      finally { pending = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh().catch(() => {}), 500);
    return () => { active = false; clearInterval(timer); };
  }, []);
  if (!state?.startedAt) return null;
  const labels: Record<string, string> = { OPENING: '開啟資料庫', VALIDATING: '驗證必要結構', CRITICAL_READY: '可唯讀使用', HEALTH_CHECKING: '可唯讀使用，背景健康檢查中', READY: '完整健康檢查完成', WARNING: '背景檢查已停止，維持唯讀', ERROR: '資料庫檢查失敗' };
  return <div role="status" data-testid="database-open-status" className="my-3 flex flex-wrap items-center gap-3 border-l-4 border-blue-500 bg-blue-50 p-3 text-sm">
    <span>{labels[state.stage] ?? state.stage} · {((state.active ? now - Date.parse(state.startedAt) : state.elapsedMs) / 1000).toFixed(1)} 秒{state.active ? ' · 回應正常，進度未提供' : ''}{state.error ? ' · ' + state.error : ''}</span>
    {state.active ? <button className="btn" onClick={() => void window.desktopApp?.databases?.cancelOpen()}><X size={16}/>取消{state.stage === 'HEALTH_CHECKING' ? '背景檢查' : '開啟'}</button> : null}
  </div>;
}
