type ResponsiveMetricGridProps = {
  children: React.ReactNode;
  min?: number;
  className?: string;
};

export function ResponsiveMetricGrid({ children, min = 210, className = "" }: ResponsiveMetricGridProps) {
  return (
    <div
      className={`grid min-w-0 items-stretch gap-3 ${className}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))` }}
    >
      {children}
    </div>
  );
}

export function ResponsiveCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`card min-w-0 max-w-full p-4 ${className}`}>{children}</div>;
}

export function ResponsiveTableContainer({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`thin-scroll min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-lg border border-line ${className}`}>
      {children}
    </div>
  );
}
