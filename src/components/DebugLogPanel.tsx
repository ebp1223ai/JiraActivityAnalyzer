import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Download, Trash2 } from "lucide-react";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  logs: string[];
  onClear: () => void;
  onAppend?: (lines: string[]) => void;
};

const levelClass: Record<string, string> = {
  ERROR: "bg-red-100 text-red-700",
  WARN: "bg-amber-100 text-amber-700",
  DEBUG: "bg-blue-100 text-blue-700",
  INFO: "bg-green-100 text-green-700",
  SUCCESS: "bg-emerald-100 text-emerald-700"
};

function levelFor(line: string, index: number) {
  if (line.includes("[ERROR]")) return "ERROR";
  if (line.includes("[WARN]")) return "WARN";
  if (line.includes("[DEBUG]")) return "DEBUG";
  if (line.includes("[SUCCESS]")) return "SUCCESS";
  return "INFO";
}

function displayParts(line: string) {
  const match = /^(\d{4}\/\d{2}\/\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3}) (.*)$/.exec(line);
  return match ? { date: match[1], time: match[2], message: match[3] } : { date: "", time: "", message: line };
}

function debugFileName() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `jira-activity-analyzer-debug-${timestamp}.txt`;
}

export function DebugLogPanel({ collapsed, onToggle, logs, onClear, onAppend }: Props) {
  const [notice, setNotice] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const content = logs.join("\n");

  useEffect(() => {
    if (!autoScroll) return;
    const node = logContainerRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [autoScroll, logs]);

  async function handleCopy() {
    if (!navigator.clipboard) {
      setNotice("Clipboard is not available");
      return;
    }
    await navigator.clipboard.writeText(content);
    setNotice("Copied");
  }

  async function handleDownload() {
    if (window.desktopApp?.appDebug?.saveTextFile) {
      const result = await window.desktopApp.appDebug.saveTextFile({
        defaultFileName: debugFileName(),
        content
      });
      setNotice(result.canceled ? "Download canceled" : "Downloaded");
      if (!result.canceled) {
        onAppend?.([
          `[INFO] Output folder ready: ${result.folderPath ?? ""}`,
          `[INFO] Debug log saved: ${result.filePath ?? ""}`
        ]);
      }
      return;
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = debugFileName();
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Downloaded");
  }

  function handleClear() {
    onClear();
    onAppend?.(["[INFO] Debug log cleared"]);
    setNotice("Debug log cleared");
  }

  if (collapsed) {
    return (
      <aside
        className="flex h-screen w-[56px] min-w-[56px] max-w-[56px] shrink-0 flex-col items-center overflow-hidden border-l border-line bg-white p-2"
        data-debug-panel-state="collapsed"
      >
        <button className="btn h-10 w-10 p-0" data-no-clip="true" onClick={onToggle} title="Expand Debug Log / 展開除錯紀錄">
          <ChevronLeft size={18} />
          <span className="sr-only">Expand Debug Log / 展開除錯紀錄</span>
        </button>
        <div className="mt-4 rotate-90 whitespace-nowrap text-xs font-black text-muted" data-no-clip="true">
          Debug Log / 除錯紀錄
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
          Debug Log / 除錯紀錄
        </h2>
        <button className="btn shrink-0 px-2 py-2" data-no-clip="true" onClick={onToggle} title="Collapse Debug Log / 收合除錯紀錄">
          <ChevronRight size={18} />
          <span className="text-[10px] leading-tight">Collapse<br />收合</span>
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn min-w-[72px] flex-1 px-3" data-no-clip="true" title="Copy Debug Log / 複製除錯紀錄" onClick={handleCopy}>
          <Copy size={16} />
          <span>Copy<br />複製</span>
        </button>
        <button className="btn min-w-[72px] flex-1 px-3" data-no-clip="true" title="Save Debug Log / 儲存除錯紀錄" onClick={handleDownload}>
          <Download size={16} />
          <span>Save<br />儲存</span>
        </button>
        <button className="btn btn-danger min-w-[72px] flex-1 px-3" data-no-clip="true" title="Clear Debug Log / 清除除錯紀錄" onClick={handleClear}>
          <Trash2 size={16} />
          <span>Clear<br />清除</span>
        </button>
      </div>

      {notice ? <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700" data-no-clip="true">{notice}</div> : null}

      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs font-semibold leading-relaxed text-blue-900">
        Debug Log records the current operation flow, API calls, warnings, and errors.<br />
        除錯紀錄會記錄目前操作流程、API 呼叫、警告與錯誤。Sensitive values are masked. / 敏感資訊會被遮蔽。
      </div>

      <div ref={logContainerRef} className="thin-scroll mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-line p-3">
        {logs.map((log, index) => {
          const level = levelFor(log, index);
          const parts = displayParts(log);
          return (
            <div key={`${log}-${index}`} className="grid min-w-0 grid-cols-[86px_52px_minmax(0,1fr)] gap-2 py-2 text-xs" title={parts.date}>
              <span className="font-mono text-slate-500" data-no-clip="true">{parts.time || "--:--:--.---"}</span>
              <span
                className={`h-fit rounded px-1.5 py-0.5 text-[10px] font-black ${levelClass[level]}`}
                data-no-clip="true"
              >
                {level}
              </span>
              <span className="min-w-0 break-words font-mono leading-relaxed text-slate-700">{parts.message}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-line p-4 text-xs">
        <div className="mb-3 text-sm font-black text-ink" data-no-clip="true">Log Level 說明</div>
        <div className="space-y-2 font-semibold leading-snug text-muted">
          <div><span className="text-red-500" data-no-clip="true">ERROR</span> Requires immediate attention.</div>
          <div><span className="text-amber-500" data-no-clip="true">WARN</span> Potential issue or recoverable warning.</div>
          <div><span className="text-blue-600" data-no-clip="true">INFO</span> Normal application flow.</div>
          <div><span className="text-slate-500" data-no-clip="true">DEBUG</span> Detailed diagnostic information.</div>
        </div>
      </div>

      <label className="mt-4 text-sm font-black text-ink" data-no-clip="true">Log Level</label>
      <select className="field mt-2" defaultValue="DEBUG">
        <option>DEBUG</option>
        <option>INFO</option>
        <option>WARN</option>
        <option>ERROR</option>
      </select>

      <div className="mt-5 flex min-w-0 items-center justify-between gap-3 text-sm font-black leading-snug text-ink">
        <span data-no-clip="true">Auto Scroll<br /><span className="text-xs font-semibold text-muted">Scroll to latest logs</span></span>
        <button
          type="button"
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full p-1 transition ${autoScroll ? "bg-blue-600" : "bg-slate-300"}`}
          onClick={() => setAutoScroll((value) => !value)}
          aria-label="Toggle debug log auto scroll"
          data-allow-truncate="true"
        >
          <span className={`h-4 w-4 rounded-full bg-white shadow transition ${autoScroll ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
    </aside>
  );
}
