export type ActivityTimelineRunContext = Readonly<{
  sessionId: string;
  runId: string;
  selectedUser: string;
  selectedStartDate: string;
  selectedEndDate: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  requestWindows: ReadonlyArray<Readonly<{ windowId: string; start: string; end: string }>>;
  createdAt: string;
  requestWindow: Readonly<{ type: "calendar_month"; customDays: null }>;
  roundExecutionMode: "force_all_rounds";
  fullScanRounds: 3;
  delayBetweenRounds: 5000;
  mergeStrategy: "union";
}>;

type CreateInput = {
  sessionId: string;
  runId: string;
  selectedUser: string;
  selectedStartDate: string;
  selectedEndDate: string;
  createdAt?: string;
};

function dateOnly(value: string, field: string) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error(`RUN_CONTEXT_INVALID_DATE:${field}`);
  }
  return text;
}

function calendarMonthWindows(startDate: string, endDate: string) {
  const windows: Array<{ windowId: string; start: string; end: string }> = [];
  let cursor = startDate;
  let index = 1;
  while (cursor <= endDate) {
    const [year, month] = cursor.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const end = monthEnd < endDate ? monthEnd : endDate;
    windows.push({ windowId: `month-${String(index).padStart(3, "0")}`, start: cursor, end });
    const next = new Date(`${end}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
    index += 1;
  }
  return windows;
}

export function createActivityTimelineRunContext(input: CreateInput): ActivityTimelineRunContext {
  const selectedStartDate = dateOnly(input.selectedStartDate, "selectedStartDate");
  const selectedEndDate = dateOnly(input.selectedEndDate, "selectedEndDate");
  if (selectedStartDate > selectedEndDate) throw new Error("RUN_CONTEXT_DATE_RANGE_REVERSED");
  const selectedUser = String(input.selectedUser ?? "").trim();
  const sessionId = String(input.sessionId ?? "").trim();
  const runId = String(input.runId ?? "").trim();
  if (!selectedUser) throw new Error("RUN_CONTEXT_USER_REQUIRED");
  if (!sessionId || !runId) throw new Error("RUN_CONTEXT_ID_REQUIRED");
  const requestWindows = calendarMonthWindows(selectedStartDate, selectedEndDate)
    .map((window) => Object.freeze({ windowId: window.windowId, start: window.start, end: window.end }));
  return Object.freeze({
    sessionId,
    runId,
    selectedUser,
    selectedStartDate,
    selectedEndDate,
    effectiveStartDate: selectedStartDate,
    effectiveEndDate: selectedEndDate,
    requestWindows: Object.freeze(requestWindows),
    createdAt: input.createdAt ?? new Date().toISOString(),
    requestWindow: Object.freeze({ type: "calendar_month" as const, customDays: null }),
    roundExecutionMode: "force_all_rounds" as const,
    fullScanRounds: 3 as const,
    delayBetweenRounds: 5000 as const,
    mergeStrategy: "union" as const
  });
}

export function validateActivityTimelineRunContext(value: ActivityTimelineRunContext) {
  const expected = createActivityTimelineRunContext({
    sessionId: value.sessionId,
    runId: value.runId,
    selectedUser: value.selectedUser,
    selectedStartDate: value.selectedStartDate,
    selectedEndDate: value.selectedEndDate,
    createdAt: value.createdAt
  });
  const mismatches: string[] = [];
  for (const field of ["effectiveStartDate", "effectiveEndDate", "roundExecutionMode", "fullScanRounds", "delayBetweenRounds", "mergeStrategy"] as const) {
    if (value[field] !== expected[field]) mismatches.push(field);
  }
  if (JSON.stringify(value.requestWindow) !== JSON.stringify(expected.requestWindow)) mismatches.push("requestWindow");
  if (JSON.stringify(value.requestWindows) !== JSON.stringify(expected.requestWindows)) mismatches.push("requestWindows");
  if (mismatches.length) throw new Error(`RUN_CONTEXT_MISMATCH:${mismatches.join(",")}`);
  return expected;
}
