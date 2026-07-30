type DistributionItem = { value: string; count: number };

type Props = {
  title: string;
  subtitle: string;
  total: number;
  items: DistributionItem[];
  color?: string;
  onSelect?: (value: string) => void;
};

export function DistributionPanel({ title, subtitle, total, items, color = "bg-blue-500", onSelect }: Props) {
  return (
    <section className="min-w-0 rounded-md border border-line bg-white p-4">
      <header className="mb-3">
        <h3 className="text-sm font-black">{title}</h3>
        <p className="text-xs font-semibold text-muted">{subtitle}</p>
      </header>
      <div className="space-y-2">
        {items.length ? items.slice(0, 12).map((item) => {
          const percent = total ? item.count / total * 100 : 0;
          const content = <>
            <span className="min-w-0 flex-1 truncate" title={item.value}>{item.value}</span>
            <span className="tabular-nums">{item.count.toLocaleString()}</span>
            <span className="w-12 text-right tabular-nums text-muted">{percent.toFixed(1)}%</span>
            <span className="h-2 w-20 overflow-hidden rounded bg-slate-100"><span className={`block h-full ${color}`} style={{ width: `${Math.max(percent ? 2 : 0, percent)}%` }} /></span>
          </>;
          return onSelect
            ? <button key={item.value} className="flex w-full items-center gap-2 text-left text-xs font-bold" type="button" onClick={() => onSelect(item.value)}>{content}</button>
            : <div key={item.value} className="flex items-center gap-2 text-xs font-bold">{content}</div>;
        }) : <div className="py-6 text-center text-xs font-semibold text-muted">No distribution data</div>}
      </div>
    </section>
  );
}
