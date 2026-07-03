type Props = {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function SectionCard({ title, subtitle, action, children, className = "" }: Props) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {title ? (
            <h2 className="min-w-0 text-base font-black text-ink">
              {title}
              {subtitle ? <span className="text-slate-300"> / </span> : null}
              {subtitle ? <span>{subtitle}</span> : null}
            </h2>
          ) : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
