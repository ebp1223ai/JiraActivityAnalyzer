import type { LucideIcon } from "lucide-react";

type Props = {
  label: string;
  sub?: string;
  value: string;
  icon: LucideIcon;
  tone?: string;
  foot?: string;
};

export function MetricCard({ label, sub, value, icon: Icon, tone = "text-blue-600 bg-blue-50", foot }: Props) {
  return (
    <div className="card min-h-[112px] p-4">
      <div className="flex items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon size={22} />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-black text-ink">{label}</div>
          {sub ? <div className="text-xs font-semibold text-muted">{sub}</div> : null}
          <div className="mt-4 text-2xl font-black text-ink">{value}</div>
          {foot ? <div className="mt-1 text-xs font-bold text-green-600">{foot}</div> : null}
        </div>
      </div>
    </div>
  );
}
