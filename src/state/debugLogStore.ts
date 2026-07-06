import { debugLogs } from "../data/mockData";

export type DebugPage = keyof typeof debugLogs;
export type DebugLogState = Record<DebugPage, string[]>;

export function createInitialDebugLogState(): DebugLogState {
  return Object.fromEntries(
    Object.entries(debugLogs).map(([page, logs]) => [page, [...logs]])
  ) as DebugLogState;
}

export function appendDebugLogLines(state: DebugLogState, page: DebugPage, lines: string[]) {
  return {
    ...state,
    [page]: [...state[page], ...lines].slice(-160)
  };
}

export function clearDebugLogPage(state: DebugLogState, page: DebugPage) {
  return {
    ...state,
    [page]: ["[INFO] Debug log cleared"]
  };
}
