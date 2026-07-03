import { X } from "lucide-react";

export function FieldLabel({ label, sub }: { label: string; sub?: string }) {
  return (
    <label className="mb-2 block text-sm font-black text-ink">
      {label}
      {sub ? <span className="ml-1 text-xs font-bold text-muted">/ {sub}</span> : null}
    </label>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="chip">
      {children}
      <X size={13} />
    </span>
  );
}

export function Toggle({ on = true }: { on?: boolean }) {
  return (
    <span className={`relative inline-flex h-6 w-11 rounded-full p-1 ${on ? "bg-blue-600" : "bg-slate-300"}`}>
      <span className={`h-4 w-4 rounded-full bg-white shadow ${on ? "translate-x-5" : ""}`} />
    </span>
  );
}
