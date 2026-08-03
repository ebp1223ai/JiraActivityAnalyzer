import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ConnectionEnvStatus, ConnectionStatePayload, JiraConnection, JiraConnectionState } from "../types/connection";
import type { RuntimeState } from "../types/runtime";

type ConnectionContextValue = {
  activeConnection: JiraConnection | null;
  savedConnections: JiraConnection[];
  envStatus: ConnectionEnvStatus | null;
  jiraState: JiraConnectionState | null;
  reloadEnv: () => Promise<ConnectionStatePayload | null>;
  chooseEnv: () => Promise<{ canceled: boolean; state: ConnectionStatePayload } | null>;
  testConnection: (connection: JiraConnection) => Promise<{ connection: JiraConnection; logs: string[]; result: unknown } | null>;
};

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [activeConnection, setActiveConnectionState] = useState<JiraConnection | null>(null);
  const [savedConnections, setSavedConnections] = useState<JiraConnection[]>([]);
  const [envStatus, setEnvStatus] = useState<ConnectionEnvStatus | null>(null);
  const [jiraState, setJiraState] = useState<JiraConnectionState | null>(null);

  function applyState(payload: ConnectionStatePayload) {
    setActiveConnectionState(payload.activeConnection);
    setSavedConnections(payload.connections);
    setEnvStatus(payload.env);
    setJiraState(payload.jiraState);
    return payload;
  }

  async function reloadEnv() {
    const payload = await window.desktopApp?.connections?.loadEnv?.();
    return payload ? applyState(payload) : null;
  }

  async function chooseEnv() {
    const payload = await window.desktopApp?.connections?.chooseEnv?.();
    if (!payload) return null;
    applyState(payload.state);
    return payload;
  }

  async function refreshList() {
    const payload = await window.desktopApp?.connections?.list?.();
    return payload ? applyState(payload) : null;
  }

  async function testConnection(connection: JiraConnection) {
    const result = await window.desktopApp?.connections?.test?.(connection);
    if (!result) return null;
    if (result.state) applyState(result.state);
    return result;
  }

  useEffect(() => {
    void refreshList();
    const unsubscribe = window.desktopApp?.connections?.onStateChanged?.((state) => applyState(state));
    return () => unsubscribe?.();
  }, []);

  const value = useMemo(() => ({
    activeConnection,
    savedConnections,
    envStatus,
    jiraState,
    reloadEnv,
    chooseEnv,
    testConnection
  }), [activeConnection, envStatus, jiraState, savedConnections]);

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnectionContext() {
  const context = useContext(ConnectionContext);
  if (!context) throw new Error("useConnectionContext must be used inside ConnectionProvider");
  return context;
}
