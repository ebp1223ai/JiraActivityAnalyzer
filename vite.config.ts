import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function formatTaipeiBuildTime(date: Date) {
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
  return `${value("year")}/${value("month")}/${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}

const buildTime = process.env.NODE_ENV === "production"
  ? formatTaipeiBuildTime(new Date())
  : "Development Mode";

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime)
  }
});
