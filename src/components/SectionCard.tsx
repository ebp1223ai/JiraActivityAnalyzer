type Props = {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function SectionCard({ title, subtitle, action, children, className = "" }: Props) {
  return (
    <section className={`card min-w-0 max-w-full p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
          {title ? (
            <h2 className="min-w-0 max-w-full text-base font-black leading-snug text-ink" data-no-clip="true">
              {title}
              {subtitle ? <span className="text-slate-300"> / </span> : null}
              {subtitle ? <span>{subtitle}</span> : null}
            </h2>
          ) : <span />}
          <div className="min-w-0 max-w-full">{action}</div>
        </div>
      )}
      {children}
    </section>
  );
}
