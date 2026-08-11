import { Activity, BrainCircuit, Cable } from "lucide-react";
import type { AiMainTab } from "./types";

const tabs: Array<{ id: AiMainTab; number: string; label: string; icon: typeof Cable }> = [
  { id: "diagnostics", number: "01", label: "AI 連線與診斷", icon: Cable },
  { id: "workspace", number: "02", label: "分析工作區", icon: BrainCircuit },
  { id: "results", number: "03", label: "Activity Events 分析結果", icon: Activity }
];

export function AiAnalysisTabs({ active, analyzedCount, onChange }: { active: AiMainTab; analyzedCount: number; onChange: (tab: AiMainTab) => void }) {
  return <div className="mb-5 flex min-w-0 gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="AI Analysis">
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const selected = active === tab.id;
      return <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={selected}
        data-testid={"ai-tab-" + tab.id}
        className={"flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-black transition " + (selected ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800")}
        onClick={() => onChange(tab.id)}
      >
        <span className="text-[10px] text-current/60">{tab.number}</span><Icon size={16} />{tab.label}
        {tab.id === "results" && analyzedCount > 0 ? <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] text-white">{analyzedCount}</span> : null}
      </button>;
    })}
  </div>;
}
