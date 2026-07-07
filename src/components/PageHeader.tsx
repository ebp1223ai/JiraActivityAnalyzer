import { StatusBadge } from "./StatusBadge";
import { connectionBadgeText } from "../data/dataSource";
import { useConnectionContext } from "../state/ConnectionContext";

type Props = {
  title: string;
  subtitle: string;
  connected?: boolean;
};

export function PageHeader({ title, subtitle, connected = true }: Props) {
  const { activeConnection } = useConnectionContext();
  return (
    <header className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
      <h1 className="min-w-0 text-2xl font-black leading-tight tracking-normal text-ink" data-no-clip="true">
        {title} <span className="text-slate-300">/</span> {subtitle}
      </h1>
      {connected ? <StatusBadge>{connectionBadgeText(activeConnection)}</StatusBadge> : null}
    </header>
  );
}
