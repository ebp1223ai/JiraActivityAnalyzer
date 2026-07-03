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

export function MockModal({
  title,
  children,
  onClose,
  footer
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
      <div className="w-full max-w-xl rounded-lg border border-line bg-white p-5 shadow-soft">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-ink">{title}</h3>
          <button className="btn px-3 py-2" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>
        <div className="text-sm font-semibold text-slate-700">{children}</div>
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-3">{footer}</div> : null}
      </div>
    </div>
  );
}
