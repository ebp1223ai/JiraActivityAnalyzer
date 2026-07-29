export const USER_ANALYSIS_DEFAULTS = {
  projectScope: "COPGEN1",
  startDate: "2026-01-01",
  requestWindow: "calendar_month" as const,
  roundExecutionMode: "force_all_rounds" as const,
  fullScanRoundCount: 3,
  delayBetweenRoundsMs: 5000,
  fetchRemoteLinks: false
};

export function dateInTimeZone(date: Date, timeZone = "Asia/Taipei") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function userAnalysisInitialDates(openedAt = new Date()) {
  return { startDate: USER_ANALYSIS_DEFAULTS.startDate, endDate: dateInTimeZone(openedAt, "Asia/Taipei") };
}
