import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

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
  ? process.env.JAA_BUILD_TIME ?? formatTaipeiBuildTime(new Date())
  : "Development Mode";

const packageJson = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

function gitValue(command: string) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __GIT_COMMIT__: JSON.stringify(process.env.JAA_PACKAGED_SOURCE_COMMIT ?? gitValue("git rev-parse HEAD")),
    __GIT_BRANCH__: JSON.stringify(gitValue("git branch --show-current")),
    __BUILD_MACHINE__: JSON.stringify(os.hostname()),
    __BUILD_OS__: JSON.stringify(`${os.type()} ${os.release()} ${os.arch()}`)
  }
});
