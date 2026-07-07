import { createContext, useContext, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";

export type SessionTableState = {
  page: number;
  pageSize: number;
  search: string;
  filter: string;
};

export type JiraAnalysisSessionState = {
  issueKey: string;
  result: unknown | null;
  loading: boolean;
  error: string;
  notice: string;
  activeTab: string;
  tabStates: Partial<Record<string, SessionTableState>>;
  lastLoadedAt: string;
  saving: boolean;
};

export type JiraProbeSessionState = {
  issueKey: string;
  result: unknown | null;
  showRawJson: boolean;
  activeTab: string;
  inspectorSearch: string;
  inspectorFilter: string;
  runState: string;
  error: string;
  actionNotice: string;
  envLoadedOnce: boolean;
  lastProbeAt: string;
  saving: boolean;
};

type SessionStateContextValue = {
  jiraAnalysis: JiraAnalysisSessionState;
  setJiraAnalysis: Dispatch<SetStateAction<JiraAnalysisSessionState>>;
  jiraProbe: JiraProbeSessionState;
  setJiraProbe: Dispatch<SetStateAction<JiraProbeSessionState>>;
};

const initialJiraAnalysis: JiraAnalysisSessionState = {
  issueKey: "COPGEN1-138930",
  result: null,
  loading: false,
  error: "",
  notice: "",
  activeTab: "overview",
  tabStates: {},
  lastLoadedAt: "",
  saving: false
};

const initialJiraProbe: JiraProbeSessionState = {
  issueKey: "",
  result: null,
  showRawJson: false,
  activeTab: "overview",
  inspectorSearch: "",
  inspectorFilter: "all",
  runState: "idle",
  error: "",
  actionNotice: "",
  envLoadedOnce: false,
  lastProbeAt: "",
  saving: false
};

const SessionStateContext = createContext<SessionStateContextValue | null>(null);

export function SessionStateProvider({ children }: { children: ReactNode }) {
  const [jiraAnalysis, setJiraAnalysis] = useState(initialJiraAnalysis);
  const [jiraProbe, setJiraProbe] = useState(initialJiraProbe);

  return (
    <SessionStateContext.Provider value={{ jiraAnalysis, setJiraAnalysis, jiraProbe, setJiraProbe }}>
      {children}
    </SessionStateContext.Provider>
  );
}

export function useSessionState() {
  const context = useContext(SessionStateContext);
  if (!context) throw new Error("useSessionState must be used inside SessionStateProvider");
  return context;
}
