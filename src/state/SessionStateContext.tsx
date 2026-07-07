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

export type UserAnalysisCandidateIssue = {
  id: string;
  key: string;
  summary: string;
  status: string;
  assignee: string;
  reporter: string;
  creator: string;
  updated: string;
  created: string;
  issueType: string;
  priority: string;
  project: string;
  matchedReason: string;
};

export type UserAnalysisSessionState = {
  selectedUsersText: string;
  startDate: string;
  endDate: string;
  searchMode: "standard";
  generatedJql: string;
  candidateSafetyLimit: number;
  fetchLimit: number;
  candidateIssues: UserAnalysisCandidateIssue[];
  selectedForFetch: string[];
  excludedIssues: string[];
  activeTab: "candidates" | "queue";
  page: number;
  pageSize: number;
  search: string;
  warnings: string[];
  errors: string[];
  lastDiscoveryAt: string;
  rawSearchMetadata: unknown | null;
  saving: boolean;
  loading: boolean;
  notice: string;
};

type SessionStateContextValue = {
  jiraAnalysis: JiraAnalysisSessionState;
  setJiraAnalysis: Dispatch<SetStateAction<JiraAnalysisSessionState>>;
  jiraProbe: JiraProbeSessionState;
  setJiraProbe: Dispatch<SetStateAction<JiraProbeSessionState>>;
  userAnalysis: UserAnalysisSessionState;
  setUserAnalysis: Dispatch<SetStateAction<UserAnalysisSessionState>>;
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

const initialUserAnalysis: UserAnalysisSessionState = {
  selectedUsersText: "roger_hsieh\nch_kao",
  startDate: "2026-07-01",
  endDate: "2026-07-07",
  searchMode: "standard",
  generatedJql: "",
  candidateSafetyLimit: 1000,
  fetchLimit: 40,
  candidateIssues: [],
  selectedForFetch: [],
  excludedIssues: [],
  activeTab: "candidates",
  page: 1,
  pageSize: 40,
  search: "",
  warnings: [],
  errors: [],
  lastDiscoveryAt: "",
  rawSearchMetadata: null,
  saving: false,
  loading: false,
  notice: ""
};

const SessionStateContext = createContext<SessionStateContextValue | null>(null);

export function SessionStateProvider({ children }: { children: ReactNode }) {
  const [jiraAnalysis, setJiraAnalysis] = useState(initialJiraAnalysis);
  const [jiraProbe, setJiraProbe] = useState(initialJiraProbe);
  const [userAnalysis, setUserAnalysis] = useState(initialUserAnalysis);

  return (
    <SessionStateContext.Provider value={{ jiraAnalysis, setJiraAnalysis, jiraProbe, setJiraProbe, userAnalysis, setUserAnalysis }}>
      {children}
    </SessionStateContext.Provider>
  );
}

export function useSessionState() {
  const context = useContext(SessionStateContext);
  if (!context) throw new Error("useSessionState must be used inside SessionStateProvider");
  return context;
}
