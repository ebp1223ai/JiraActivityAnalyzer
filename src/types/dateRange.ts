export type DateShortcut = "all" | "today" | "last7" | "last30" | "thisMonth" | "custom";

export type DateRangeState = {
  shortcut: DateShortcut;
  startDate: string;
  endDate: string;
};

export type DateRangeBounds = {
  startInclusive: string;
  endExclusive: string;
};

export const ALL_TIME_DATE_RANGE: DateRangeState = { shortcut: "all", startDate: "", endDate: "" };

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
  const next = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function dateRangeForShortcut(shortcut: DateShortcut, now = new Date()): DateRangeState {
  if (shortcut === "all") return ALL_TIME_DATE_RANGE;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (shortcut === "today") return { shortcut, startDate: localDate(today), endDate: localDate(today) };
  if (shortcut === "last7") return { shortcut, startDate: localDate(addDays(today, -6)), endDate: localDate(today) };
  if (shortcut === "last30") return { shortcut, startDate: localDate(addDays(today, -29)), endDate: localDate(today) };
  if (shortcut === "thisMonth") return { shortcut, startDate: localDate(new Date(today.getFullYear(), today.getMonth(), 1)), endDate: localDate(today) };
  return { shortcut, startDate: "", endDate: "" };
}

export function normalizeDateRange(value: unknown): DateRangeState {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const shortcut = ["all", "today", "last7", "last30", "thisMonth", "custom"].includes(String(source.shortcut)) ? String(source.shortcut) as DateShortcut : "all";
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.startDate ?? "")) ? String(source.startDate) : "";
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.endDate ?? "")) ? String(source.endDate) : "";
  if (shortcut !== "custom") return dateRangeForShortcut(shortcut);
  if (startDate && endDate && startDate > endDate) throw new Error("DATE_RANGE_INVALID");
  return { shortcut, startDate, endDate };
}

export function dateRangeBounds(value: unknown): DateRangeBounds {
  const range = normalizeDateRange(value);
  if (!range.startDate && !range.endDate) return { startInclusive: "", endExclusive: "" };
  const nextDay = range.endDate ? addDays(new Date(`${range.endDate}T00:00:00`), 1) : null;
  return {
    startInclusive: range.startDate ? `${range.startDate}T00:00:00` : "",
    endExclusive: nextDay ? `${localDate(nextDay)}T00:00:00` : ""
  };
}
