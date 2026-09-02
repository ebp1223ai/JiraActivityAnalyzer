import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ViewerTableQuery, ViewerTableResult } from "../types/activityViewerQuery";
import type { ViewerTableSessionState } from "../types/databaseViewer";

export type AiViewerRouteKey = "ai-results" | "integrated-results";
export type AiViewerRouteState = {
  query: ViewerTableQuery;
  result: ViewerTableResult;
  session: ViewerTableSessionState;
  rawDatabaseIdentity: string;
  aiDatabaseIdentity: string;
  latestRequestId: string;
  lastSuccessfulRequestId: string;
};

const fresh = (): AiViewerRouteState => ({
  query: { page: 1, pageSize: 50, sort: { field: "eventTime", direction: "desc" }, filters: {}, revision: 0 },
  result: { rows: [], filteredCount: 0, totalCount: 0, page: 1, pageSize: 50, pageCount: 1 },
  session: { scrollLeft: 0, scrollTop: 0, expandedRowIds: [] },
  rawDatabaseIdentity: "", aiDatabaseIdentity: "", latestRequestId: "", lastSuccessfulRequestId: ""
});

type Value = {
  routes: Record<AiViewerRouteKey, AiViewerRouteState>;
  patch: (route: AiViewerRouteKey, next: Partial<AiViewerRouteState> | ((current: AiViewerRouteState) => Partial<AiViewerRouteState>)) => void;
};
const Context = createContext<Value | null>(null);

export function AiViewerStateProvider({ children }: { children: ReactNode }) {
  const [routes, setRoutes] = useState<Record<AiViewerRouteKey, AiViewerRouteState>>({ "ai-results": fresh(), "integrated-results": fresh() });
  const value = useMemo<Value>(() => ({ routes, patch: (route, next) => setRoutes((current) => { const update = typeof next === "function" ? next(current[route]) : next; return { ...current, [route]: { ...current[route], ...update } }; }) }), [routes]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAiViewerState(route: AiViewerRouteKey) {
  const context = useContext(Context);
  if (!context) throw new Error("AiViewerStateProvider missing");
  return { state: context.routes[route], patch: (next: Partial<AiViewerRouteState> | ((current: AiViewerRouteState) => Partial<AiViewerRouteState>)) => context.patch(route, next) };
}
