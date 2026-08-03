import type { DateRangeState, DateShortcut } from "../types/dateRange";
import { dateRangeForShortcut } from "../types/dateRange";

type Props = {
  value: DateRangeState;
  onChange: (value: DateRangeState) => void;
  label?: string;
};

const shortcuts: Array<{ value: DateShortcut; label: string }> = [
  { value: "all", label: "All Time / 全部時間" },
  { value: "today", label: "Today / 今天" },
  { value: "last7", label: "Last 7 Days / 最近 7 天" },
  { value: "last30", label: "Last 30 Days / 最近 30 天" },
  { value: "thisMonth", label: "This Month / 本月" },
  { value: "custom", label: "Custom / 自訂" }
];

export function DateRangeControl({ value, onChange, label = "Date Range / 日期範圍" }: Props) {
  const invalid = Boolean(value.startDate && value.endDate && value.startDate > value.endDate);
  function choose(shortcut: DateShortcut) {
    onChange(shortcut === "custom" ? { shortcut, startDate: value.startDate, endDate: value.endDate } : dateRangeForShortcut(shortcut));
  }
  return <fieldset className="min-w-0 rounded-md border border-line bg-slate-50 p-3" data-date-range-control="true">
    <legend className="px-1 text-xs font-black text-muted">{label}</legend>
    <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[minmax(180px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)]">
      <select className="field" value={value.shortcut} onChange={(event) => choose(event.currentTarget.value as DateShortcut)}>
        {shortcuts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <input aria-label="Start date" className="field" type="date" disabled={value.shortcut !== "custom"} value={value.startDate} onChange={(event) => onChange({ ...value, shortcut: "custom", startDate: event.currentTarget.value })} />
      <input aria-label="End date" className="field" type="date" disabled={value.shortcut !== "custom"} value={value.endDate} onChange={(event) => onChange({ ...value, shortcut: "custom", endDate: event.currentTarget.value })} />
    </div>
    {invalid ? <div className="mt-2 text-xs font-black text-rose-700">Start date must not be after end date. / 開始日期不可晚於結束日期。</div> : null}
  </fieldset>;
}
