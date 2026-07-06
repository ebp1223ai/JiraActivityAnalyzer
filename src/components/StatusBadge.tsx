import { CheckCircle2 } from "lucide-react";

type Props = {
  children: React.ReactNode;
  tone?: "green" | "blue" | "amber" | "red" | "gray";
};

const tones = {
  green: "border-green-200 bg-green-50 text-green-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
  gray: "border-slate-200 bg-slate-50 text-slate-600"
};

export function StatusBadge({ children, tone = "green" }: Props) {
  return (
    <span className={`inline-flex max-w-full shrink-0 items-center gap-0.5 rounded-md border px-1.5 py-1 text-xs font-bold leading-snug ${tones[tone]}`} data-no-clip="true">
      {tone === "green" ? <CheckCircle2 className="shrink-0" size={12} /> : null}
      <span className="min-w-0">{children}</span>
    </span>
  );
}
