import { ChevronLeft, ChevronRight, Copy, Download, Trash2 } from "lucide-react";
import { debugLogs } from "../data/mockData";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  page: keyof typeof debugLogs;
  extraLogs?: string[];
};

const levelFor = (line: string, index: number) => {
  if (line.includes("[ERROR]")) return "ERROR";
  if (line.includes("[WARN]")) return "WARN";
  if (line.includes("[DEBUG]")) return "DEBUG";
  return index % 3 === 0 ? "DEBUG" : "INFO";
};

const levelClass: Record<string, string> = {
  ERROR: "bg-red-100 text-red-700",
  WARN: "bg-amber-100 text-amber-700",
  DEBUG: "bg-blue-100 text-blue-700",
  INFO: "bg-green-100 text-green-700"
};

function timestampFor(index: number) {
  const minutes = String(40 + Math.floor(index / 12)).padStart(2, "0");
  const seconds = String(21 + (index % 12)).padStart(2, "0");
  return `15:${minutes}:${seconds}.${120 + index}`;
}

export function DebugLogPanel({ collapsed, onToggle, page, extraLogs = [] }: Props) {
  const logs = [...debugLogs[page], ...extraLogs];

  if (collapsed) {
    return (
      <aside
        className="flex h-screen w-[56px] min-w-[56px] max-w-[56px] shrink-0 flex-col items-center overflow-hidden border-l border-line bg-white p-2"
        data-debug-panel-state="collapsed"
      >
        <button className="btn h-10 w-10 p-0" data-no-clip="true" onClick={onToggle} title="Expand Debug Log">
          <ChevronLeft size={18} />
          <span className="sr-only">Expand Debug Log</span>
        </button>
        <div className="mt-4 rotate-90 whitespace-nowrap text-xs font-black text-muted" data-no-clip="true">
          Debug Log
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="flex h-screen w-[320px] min-w-[320px] max-w-[320px] shrink-0 flex-col overflow-hidden border-l border-line bg-white p-4"
      data-debug-panel-state="expanded"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="text-lg font-black leading-snug text-ink" data-no-clip="true">
          除錯紀錄 / Debug Log
        </h2>
        <button className="btn h-9 w-9 shrink-0 p-0" data-no-clip="true" onClick={onToggle} title="Collapse Debug Log">
          <ChevronRight size={18} />
          <span className="sr-only">Collapse Debug Log</span>
        </button>
      </div>

      {page === "timeline" ? (
        <div className="mt-4 w-fit max-w-full rounded-full bg-green-50 px-3 py-2 text-sm font-bold leading-snug text-green-700" data-no-clip="true">
          sessionStorage enabled
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn min-w-[72px] flex-1 px-3" data-no-clip="true" title="Copy logs">
          <Copy size={16} />
          <span>Copy</span>
        </button>
        <button className="btn min-w-[46px] px-3" data-no-clip="true" title="Download TXT">
          <Download size={16} />
          <span className="sr-only">Download TXT</span>
        </button>
        <button className="btn btn-danger min-w-[46px] px-3" data-no-clip="true" title="Clear logs">
          <Trash2 size={16} />
          <span>Clear</span>
        </button>
      </div>

      <div className="thin-scroll mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-line p-3">
        {logs.map((log, index) => {
          const level = levelFor(log, index);
          return (
            <div key={`${log}-${index}`} className="grid min-w-0 grid-cols-[82px_44px_minmax(0,1fr)] gap-2 py-2 text-xs">
              <span className="font-mono text-slate-500" data-no-clip="true">{timestampFor(index)}</span>
              <span
                className={`h-fit rounded px-1.5 py-0.5 text-[10px] font-black ${levelClass[level]}`}
                data-no-clip="true"
              >
                {level}
              </span>
              <span className="min-w-0 break-words font-mono leading-relaxed text-slate-700">{log}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-line p-4 text-xs">
        <div className="mb-3 text-sm font-black text-ink" data-no-clip="true">Log Level 說明</div>
        <div className="space-y-2 font-semibold leading-snug text-muted">
          <div><span className="text-red-500" data-no-clip="true">ERROR</span> 輸入錯誤或系統錯誤，需立即處理</div>
          <div><span className="text-amber-500" data-no-clip="true">WARN</span> 潛在問題或非阻斷警告</div>
          <div><span className="text-blue-600" data-no-clip="true">INFO</span> 一般資訊性訊息</div>
          <div><span className="text-slate-500" data-no-clip="true">DEBUG</span> 詳細除錯資訊</div>
        </div>
      </div>

      <label className="mt-4 text-sm font-black text-ink" data-no-clip="true">Log Level</label>
      <select className="field mt-2">
        <option>INFO</option>
        <option>DEBUG</option>
        <option>WARN</option>
        <option>ERROR</option>
      </select>

      <div className="mt-5 flex min-w-0 items-center justify-between gap-3 text-sm font-black leading-snug text-ink">
        <span data-no-clip="true">Auto Scroll<br /><span className="text-xs font-semibold text-muted">自動捲動到最新記錄</span></span>
        <span className="relative inline-flex h-6 w-11 shrink-0 rounded-full bg-blue-600 p-1"><span className="h-4 w-4 translate-x-5 rounded-full bg-white shadow" /></span>
      </div>
    </aside>
  );
}
