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
    <div className="card min-h-[112px] p-4" data-ui="metric-card">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
          <Icon size={22} />
        </span>
        <div className="min-w-0 max-w-full flex-1">
          <div className="text-balance text-sm font-black leading-snug text-ink" data-allow-wrap="true">{label}</div>
          {sub ? <div className="text-xs font-semibold leading-snug text-muted" data-allow-wrap="true">{sub}</div> : null}
          <div
            className="mt-4 font-black leading-tight text-ink [font-size:clamp(1.2rem,1.35vw,1.65rem)] [overflow-wrap:anywhere]"
            data-no-clip="true"
          >
            {value}
          </div>
          {foot ? <div className="mt-1 text-xs font-bold leading-snug text-green-600" data-no-clip="true">{foot}</div> : null}
        </div>
      </div>
    </div>
  );
}
