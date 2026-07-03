import { Copy, Download, Trash2 } from "lucide-react";
import { debugLogs } from "../data/mockData";

type Props = {
  page: keyof typeof debugLogs;
};

const levelFor = (index: number) => (index % 5 === 0 ? "INFO" : index % 3 === 0 ? "DEBUG" : "INFO");

export function DebugLogPanel({ page }: Props) {
  const logs = debugLogs[page];
  return (
    <aside className="flex h-screen w-[330px] shrink-0 flex-col border-l border-line bg-white p-4">
      <h2 className="text-lg font-black text-ink">除錯紀錄 / Debug Log</h2>
      {page === "timeline" ? <div className="mt-4 w-fit rounded-full bg-green-50 px-3 py-2 text-sm font-bold text-green-700">sessionStorage enabled</div> : null}
      <div className="mt-4 flex gap-2">
        <button className="btn flex-1"><Copy size={16} />Copy</button>
        <button className="btn flex-1"><Download size={16} />Download TXT</button>
        <button className="btn btn-danger"><Trash2 size={16} />Clear</button>
      </div>
      <div className="thin-scroll mt-4 flex-1 overflow-auto rounded-lg border border-line p-3">
        {logs.concat(logs.slice(0, 4)).map((log, index) => {
          const level = levelFor(index);
          return (
            <div key={`${log}-${index}`} className="grid grid-cols-[76px_48px_1fr] gap-2 py-2 text-xs">
              <span className="font-mono text-slate-500">15:4{index}:21.{120 + index}</span>
              <span className={`h-fit rounded px-1.5 py-0.5 text-[10px] font-black ${level === "INFO" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{level}</span>
              <span className="font-mono leading-relaxed text-slate-700">{log}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 rounded-lg border border-line p-4 text-xs">
        <div className="mb-3 text-sm font-black text-ink">Log Level 說明</div>
        <div className="space-y-2 font-semibold text-muted">
          <div><span className="text-red-500">● ERROR</span> 輸入錯誤或系統錯誤</div>
          <div><span className="text-amber-500">● WARN</span> 潛在問題或非關鍵警告</div>
          <div><span className="text-blue-600">● INFO</span> 一般資訊性訊息</div>
          <div><span className="text-slate-500">● DEBUG</span> 詳細除錯資訊</div>
        </div>
      </div>
      <label className="mt-4 text-sm font-black text-ink">Log Level</label>
      <select className="field mt-2"><option>INFO</option><option>DEBUG</option><option>WARN</option><option>ERROR</option></select>
      <div className="mt-5 flex items-center justify-between text-sm font-black text-ink">
        <span>Auto Scroll<br /><span className="text-xs font-semibold text-muted">自動捲動至最新記錄</span></span>
        <span className="relative inline-flex h-6 w-11 rounded-full bg-blue-600 p-1"><span className="h-4 w-4 translate-x-5 rounded-full bg-white shadow" /></span>
      </div>
    </aside>
  );
}
