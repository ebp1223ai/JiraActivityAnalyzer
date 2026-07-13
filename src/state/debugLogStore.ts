import { debugLogs } from "../data/mockData";

export type DebugPage = keyof typeof debugLogs;
export type DebugLogState = Record<DebugPage, string[]>;

function localTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}/${value("month")}/${value("day")} ${value("hour")}:${value("minute")}:${value("second")}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

function timestampLine(line: string) {
  return /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}\.\d{3} /.test(line)
    ? line
    : `${localTimestamp()} ${line}`;
}

export function createInitialDebugLogState(): DebugLogState {
  return Object.fromEntries(
    Object.entries(debugLogs).map(([page, logs]) => [page, logs.map(timestampLine)])
  ) as DebugLogState;
}

export function appendDebugLogLines(state: DebugLogState, page: DebugPage, lines: string[]) {
  return {
    ...state,
    [page]: [...state[page], ...lines.map(timestampLine)].slice(-160)
  };
}

export function clearDebugLogPage(state: DebugLogState, page: DebugPage) {
  return {
    ...state,
    [page]: [timestampLine("[INFO] Debug log cleared")]
  };
}
