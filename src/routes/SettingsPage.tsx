import { useMemo, useState } from "react";
import { Download, Eye, FileText, RotateCcw, Save, Settings2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";

type Category = "general" | "display" | "export" | "logs";
type AppSettings = {
  language: string; timeZone: string; rowsPerPage: string; density: string;
  exportFormat: string; outputPath: string; debugLevel: string; retention: string;
  performanceLog: boolean; autoScroll: boolean;
};

const defaults: AppSettings = {
  language: "zh-TW / English", timeZone: "Asia/Taipei (UTC+08:00)",
  rowsPerPage: "25", density: "Comfortable", exportFormat: "JSON",
  outputPath: "exports", debugLevel: "INFO", retention: "30",
  performanceLog: true, autoScroll: true
};

const categories = [
  { id: "general" as const, label: "一般 / General", icon: Settings2 },
  { id: "display" as const, label: "顯示 / Display", icon: Eye },
  { id: "export" as const, label: "匯出 / Export", icon: Download },
  { id: "logs" as const, label: "日誌與診斷 / Logs & Diagnostics", icon: FileText }
];

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem("jaa-ui-settings-v1") ?? "{}") } as AppSettings;
  } catch {
    return defaults;
  }
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="grid min-w-0 grid-cols-1 gap-2 border-b border-line py-4 last:border-0 md:grid-cols-[240px_minmax(0,1fr)]"><span><span className="block text-sm font-black">{label}</span>{hint ? <span className="mt-1 block text-xs font-semibold leading-relaxed text-muted">{hint}</span> : null}</span><span>{children}</span></label>;
}

export function SettingsPage() {
  const [category, setCategory] = useState<Category>("general");
  const [settings, setSettings] = useState(loadSettings);
  const [notice, setNotice] = useState("");
  const currentLabel = useMemo(() => categories.find((item) => item.id === category)?.label ?? "", [category]);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice("");
  }

  function save() {
    try {
      localStorage.setItem("jaa-ui-settings-v1", JSON.stringify(settings));
      setNotice("設定已儲存 / Settings saved");
    } catch (reason) {
      setNotice(`儲存失敗 / Save failed: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }

  function restoreCurrent() {
    const keys: Record<Category, Array<keyof AppSettings>> = {
      general: ["language", "timeZone"],
      display: ["rowsPerPage", "density"],
      export: ["exportFormat", "outputPath"],
      logs: ["debugLevel", "retention", "performanceLog", "autoScroll"]
    };
    setSettings((current) => Object.assign({}, current, Object.fromEntries(keys[category].map((key) => [key, defaults[key]]))));
    setNotice(`${currentLabel} 已還原預設值，按 Save 後生效。`);
  }

  return (
    <div className="min-w-0">
      <PageHeader title="設定" subtitle="Settings" connected={false} />
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="space-y-1 border-r-0 border-line xl:border-r xl:pr-4">
          {categories.map(({ id, label, icon: Icon }) => <button key={id} className={`flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-sm font-black ${category === id ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`} type="button" onClick={() => setCategory(id)}><Icon size={18} />{label}</button>)}
        </nav>
        <SectionCard title={currentLabel}>
          {category === "general" ? <>
            <Row label="語言 / Language"><select className="field" value={settings.language} onChange={(event) => update("language", event.target.value)}><option>zh-TW / English</option></select></Row>
            <Row label="時區 / Time Zone" hint="影響 UI 顯示，不改寫資料庫原始時間。"><select className="field" value={settings.timeZone} onChange={(event) => update("timeZone", event.target.value)}><option>Asia/Taipei (UTC+08:00)</option><option>UTC</option></select></Row>
          </> : null}
          {category === "display" ? <>
            <Row label="每頁筆數 / Rows per Page"><select className="field" value={settings.rowsPerPage} onChange={(event) => update("rowsPerPage", event.target.value)}><option>25</option><option>50</option><option>100</option></select></Row>
            <Row label="顯示密度 / Display Density"><select className="field" value={settings.density} onChange={(event) => update("density", event.target.value)}><option>Comfortable</option><option>Compact</option></select></Row>
          </> : null}
          {category === "export" ? <>
            <Row label="預設格式 / Default Format"><select className="field" value={settings.exportFormat} onChange={(event) => update("exportFormat", event.target.value)}><option>JSON</option><option>CSV</option></select></Row>
            <Row label="輸出路徑 / Output Path" hint="相對路徑位於 APP_ROOT；實際匯出仍使用既有安全主程序。"><input className="field" value={settings.outputPath} onChange={(event) => update("outputPath", event.target.value)} /></Row>
          </> : null}
          {category === "logs" ? <>
            <Row label="除錯等級 / Debug Level"><select className="field" value={settings.debugLevel} onChange={(event) => update("debugLevel", event.target.value)}><option>DEBUG</option><option>INFO</option><option>WARN</option><option>ERROR</option></select></Row>
            <Row label="保留天數 / Retention"><input className="field" type="number" min="1" max="365" value={settings.retention} onChange={(event) => update("retention", event.target.value)} /></Row>
            <Row label="效能日誌 / Performance Log"><input type="checkbox" checked={settings.performanceLog} onChange={(event) => update("performanceLog", event.target.checked)} /></Row>
            <Row label="自動捲動 / Auto Scroll"><input type="checkbox" checked={settings.autoScroll} onChange={(event) => update("autoScroll", event.target.checked)} /></Row>
          </> : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" type="button" onClick={save}><Save size={16} />儲存 / Save</button>
            <button className="btn" type="button" onClick={restoreCurrent}><RotateCcw size={16} />還原目前分類 / Restore Current Category</button>
            {notice ? <span className="text-sm font-bold text-blue-700">{notice}</span> : null}
          </div>
          <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900">
            Full Fetch 的 1 calendar month、3 rounds、5 seconds 與 Force All Rounds 為資料正確性規則，不在 Settings 開放修改。
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
