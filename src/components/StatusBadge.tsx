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
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold ${tones[tone]}`}>
      {tone === "green" ? <CheckCircle2 size={13} /> : null}
      {children}
    </span>
  );
}
