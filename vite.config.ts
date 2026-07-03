import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const buildTime = process.env.NODE_ENV === "production"
  ? new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }).format(new Date())
  : "Development Mode";

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime)
  }
});
