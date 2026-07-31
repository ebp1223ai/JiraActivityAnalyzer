import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { RuntimeState } from "../types/runtime";

const initialState: RuntimeState = {
  jira: {
    status: "CHECKING", reasonCode: "CHECKING", message: "Checking Jira connection.",
    checkedAt: "", lastSuccessAt: "", latencyMs: null, baseUrlNormalized: "",
    accountDisplayName: "", username: "", serverIdentity: "", serverTitle: "",
    serverTitleStatus: "unverified", connectionStatus: "testing", authType: "", testedAt: "",
    errorCode: "", errorMessage: "", settingsFingerprint: "", requestId: 0
  },
  database: {
    status: "CHECKING", reasonCode: "CHECKING", message: "Checking current local database.",
    checkedAt: "", path: "", databaseId: "", schemaVersion: null, sourceBinding: "",
    canRead: false, canWrite: false, bindingComparison: "UNAVAILABLE", requestId: 0
  },
  capabilities: {
    jiraSearch: false, candidateDiscovery: false, fullFetchStaging: false,
    databaseRead: false, databaseWrite: false, databaseImport: false,
    offlineAnalysis: false, settings: true
  },
  startedAt: new Date().toISOString()
};

type RuntimeStatusContextValue = {
  state: RuntimeState;
  databaseLoadStatus: "not-configured" | "connecting" | "loading" | "ready" | "error";
  setDatabaseLoadStatus: React.Dispatch<React.SetStateAction<"not-configured" | "connecting" | "loading" | "ready" | "error">>;
  retryJira: () => Promise<RuntimeState | null>;
  retryDatabase: () => Promise<RuntimeState | null>;
  selectExistingDatabase: () => Promise<{ canceled: boolean; saved: boolean; validation?: RuntimeState["database"]; state: RuntimeState; error?: string } | null>;
  createNewDatabase: () => Promise<{ canceled: boolean; saved: boolean; created?: { databasePath: string; databaseId: string; validation: RuntimeState["database"] }; state: RuntimeState; error?: string } | null>;
};

const RuntimeStatusContext = createContext<RuntimeStatusContextValue | null>(null);

export function RuntimeStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RuntimeState>(initialState);
  const [databaseLoadStatus, setDatabaseLoadStatus] = useState<"not-configured" | "connecting" | "loading" | "ready" | "error">("connecting");

  useEffect(() => {
    let active = true;
    void window.desktopApp?.runtime?.getState?.().then((next) => {
      if (active && next) setState(next);
    });
    const unsubscribe = window.desktopApp?.runtime?.onStateChanged?.((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (state.database.status === "CHECKING") setDatabaseLoadStatus("connecting");
    else if (state.database.status === "NOT_CONFIGURED") setDatabaseLoadStatus("not-configured");
    else if (state.database.canRead) setDatabaseLoadStatus("loading");
    else setDatabaseLoadStatus("error");
  }, [state.database.requestId, state.database.status, state.database.canRead]);
  async function retryJira() {
    const next = await window.desktopApp?.runtime?.retryJira?.();
    if (next) setState(next);
    return next ?? null;
  }

  async function retryDatabase() {
    const next = await window.desktopApp?.runtime?.retryDatabase?.();
    if (next) setState(next);
    return next ?? null;
  }

  async function selectExistingDatabase() {
    const result = await window.desktopApp?.databases?.selectExisting?.();
    if (result?.state) setState(result.state);
    return result ?? null;
  }

  async function createNewDatabase() {
    const result = await window.desktopApp?.databases?.createNew?.();
    if (result?.state) setState(result.state);
    return result ?? null;
  }

  const value = useMemo(() => ({
    state, databaseLoadStatus, setDatabaseLoadStatus, retryJira, retryDatabase, selectExistingDatabase, createNewDatabase
  }), [state, databaseLoadStatus]);

  return <RuntimeStatusContext.Provider value={value}>{children}</RuntimeStatusContext.Provider>;
}

export function useRuntimeStatus() {
  const context = useContext(RuntimeStatusContext);
  if (!context) throw new Error("useRuntimeStatus must be used inside RuntimeStatusProvider");
  return context;
}
