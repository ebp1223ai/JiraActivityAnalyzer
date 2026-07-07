import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ConnectionEnvStatus, ConnectionStatePayload, JiraConnection } from "../types/connection";

type ConnectionContextValue = {
  activeConnection: JiraConnection | null;
  savedConnections: JiraConnection[];
  envStatus: ConnectionEnvStatus | null;
  reloadEnv: () => Promise<ConnectionStatePayload | null>;
  testConnection: (connection: JiraConnection) => Promise<{ connection: JiraConnection; logs: string[]; result: unknown } | null>;
  saveConnection: (connection: JiraConnection) => Promise<ConnectionStatePayload | null>;
  setActiveConnection: (id: string) => Promise<ConnectionStatePayload | null>;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [activeConnection, setActiveConnectionState] = useState<JiraConnection | null>(null);
  const [savedConnections, setSavedConnections] = useState<JiraConnection[]>([]);
  const [envStatus, setEnvStatus] = useState<ConnectionEnvStatus | null>(null);

  function applyState(payload: ConnectionStatePayload) {
    setActiveConnectionState(payload.activeConnection);
    setSavedConnections(payload.connections);
    setEnvStatus(payload.env);
    return payload;
  }

  async function reloadEnv() {
    const payload = await window.desktopApp?.connections?.loadEnv?.();
    return payload ? applyState(payload) : null;
  }

  async function refreshList() {
    const payload = await window.desktopApp?.connections?.list?.();
    return payload ? applyState(payload) : null;
  }

  async function testConnection(connection: JiraConnection) {
    const result = await window.desktopApp?.connections?.test?.(connection);
    if (!result) return null;
    setActiveConnectionState((current) => current?.id === result.connection.id ? result.connection : current);
    setSavedConnections((current) => current.map((item) => item.id === result.connection.id ? result.connection : item));
    return result;
  }

  async function saveConnection(connection: JiraConnection) {
    const payload = await window.desktopApp?.connections?.save?.(connection);
    return payload ? applyState(payload) : null;
  }

  async function setActiveConnection(id: string) {
    const payload = await window.desktopApp?.connections?.setActive?.(id);
    return payload ? applyState(payload) : null;
  }

  useEffect(() => {
    void refreshList();
  }, []);

  const value = useMemo(() => ({
    activeConnection,
    savedConnections,
    envStatus,
    reloadEnv,
    testConnection,
    saveConnection,
    setActiveConnection
  }), [activeConnection, envStatus, savedConnections]);

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnectionContext() {
  const context = useContext(ConnectionContext);
  if (!context) throw new Error("useConnectionContext must be used inside ConnectionProvider");
  return context;
}
