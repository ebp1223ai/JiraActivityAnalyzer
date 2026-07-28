import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Search, Trash2, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  logs: string[];
  onClear: () => void;
  onAppend?: (lines: string[]) => void;
  onUserAction?: (message: string) => void;
  currentPage: string;
};

const levels = ["ALL", "ERROR", "WARN", "INFO", "DEBUG"] as const;

function levelFor(line: string) {
  if (line.includes("[ERROR]")) return "ERROR";
  if (line.includes("[WARN]")) return "WARN";
  if (line.includes("[DEBUG]")) return "DEBUG";
  return "INFO";
}

export function DebugLogPanel({ open, onClose, logs, onClear, onAppend, onUserAction, currentPage }: Props) {
  const [level, setLevel] = useState<(typeof levels)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [notice, setNotice] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => logs.filter((line) =>
    (level === "ALL" || levelFor(line) === level)
    && (!search.trim() || line.toLowerCase().includes(search.trim().toLowerCase()))
  ), [level, logs, search]);

  useEffect(() => {
    if (open && autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [autoScroll, filtered, open]);

  async function copy() {
    await navigator.clipboard?.writeText(filtered.join("\n"));
    setNotice("已複製目前篩選結果 / Filtered logs copied");
    onUserAction?.("Debug Log copied / 除錯日誌已複製");
  }

  async function exportFolder() {
    const result = await window.desktopApp?.appDebug?.saveBundle?.({ debugLog: logs.join("\n"), currentPage });
    if (!result || result.canceled) {
      setNotice("已取消 / Canceled");
      return;
    }
    setNotice(result.status === "failed" ? `匯出失敗 / Export failed: ${result.errorCode ?? "unknown"}` : `已匯出 / Exported: ${result.folderPath ?? ""}`);
    if (result.folderPath) onAppend?.([`[INFO] Debug Folder exported: ${result.folderPath}`]);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/20" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside
        className="absolute inset-y-0 right-0 flex w-[min(440px,100vw)] min-w-0 flex-col border-l border-line bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Debug Log / 全域除錯日誌"
        data-debug-panel-state="expanded"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-black text-ink">全域除錯日誌 / Debug Log</h2>
            <p className="text-xs font-semibold text-muted">{logs.length} retained entries · WARN + ERROR 不會因開啟而歸零</p>
          </div>
          <button className="btn h-9 w-9 p-0" type="button" onClick={onClose} title="Close"><X size={18} /></button>
        </div>
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex flex-wrap gap-2">
            {levels.map((item) => (
              <button key={item} className={`btn px-3 py-2 ${level === item ? "btn-primary" : ""}`} type="button" onClick={() => setLevel(item)}>
                {item}
              </button>
            ))}
          </div>
          <label className="relative block">
            <Search className="absolute left-3 top-3 text-muted" size={16} />
            <input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋訊息、來源、Run ID、Issue Key..." />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" type="button" onClick={copy}><Copy size={15} />複製 / Copy</button>
            <button className="btn" type="button" onClick={exportFolder}><Download size={15} />匯出 / Export</button>
            <button className="btn btn-danger" type="button" onClick={() => { onClear(); setNotice("已清除 / Cleared"); }}><Trash2 size={15} />清除 / Clear</button>
            <label className="ml-auto flex items-center gap-2 text-xs font-bold text-muted">
              <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />
              自動捲動 / Auto Scroll
            </label>
          </div>
          {notice ? <div className="rounded-md bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">{notice}</div> : null}
        </div>
        <div ref={logRef} className="thin-scroll min-h-0 flex-1 overflow-y-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
          {filtered.length ? filtered.map((line, index) => (
            <div className="mb-2 break-words" key={`${index}-${line.slice(0, 20)}`}>
              <span className={levelFor(line) === "ERROR" ? "text-rose-400" : levelFor(line) === "WARN" ? "text-amber-300" : levelFor(line) === "DEBUG" ? "text-blue-300" : "text-emerald-300"}>
                [{levelFor(line)}]
              </span>{" "}
              {line}
            </div>
          )) : <div className="flex h-full items-center justify-center text-center text-slate-400">目前沒有除錯日誌<br />No debug logs</div>}
        </div>
        <div className="border-t border-line bg-amber-50 px-4 py-3 text-xs font-semibold leading-relaxed text-amber-900">
          Token、Authorization、Password、Cookie 與 Secret 會在既有匯出管線中遮罩。分享 Debug Folder 前仍請先檢查內容。
        </div>
      </aside>
    </div>
  );
}
