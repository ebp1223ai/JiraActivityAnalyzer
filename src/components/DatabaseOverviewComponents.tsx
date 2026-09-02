import type { ReactNode } from "react";

export function DatabaseOverviewToolbar({ children, testId }: { children: ReactNode; testId?: string }) {
  return <div className="mb-4 flex min-w-0 flex-wrap gap-2" data-testid={testId}>{children}</div>;
}

export function DatabaseOverviewDetails({ children, columns = "md:grid-cols-2 xl:grid-cols-3" }: { children: ReactNode; columns?: string }) {
  return <dl className={`grid min-w-0 gap-4 ${columns}`}>{children}</dl>;
}
