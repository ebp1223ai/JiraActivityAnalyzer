export function formatDisplayTime(value: unknown, timeZone?: string) {
  if (value === undefined || value === null || value === "") return "-";
  const raw = String(value).trim();
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.valueOf())) return raw;
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}/${part("month")}/${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}
