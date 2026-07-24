import fs from "node:fs";
import path from "node:path";
import { isPathInsideRoot } from "./appRoot.js";

export function buildPathAudit(input: {
  appRoot: string;
  executablePath: string;
  isPackaged: boolean;
  paths: Record<string, string>;
  checkedAt?: string;
}) {
  const appRoot = path.resolve(input.appRoot);
  const resolvedPaths = Object.fromEntries(Object.entries(input.paths).map(([key, value]) => [key, path.resolve(value)]));
  const violations = Object.entries(resolvedPaths)
    .filter(([, value]) => !isPathInsideRoot(appRoot, value))
    .map(([name, value]) => ({ name, path: value, reason: "outside_app_root" }));
  let writableStatus: "passed" | "failed" = "passed";
  let writableError = "";
  const marker = path.join(appRoot, `.path-audit-${process.pid}-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(marker, "path-audit", "utf8");
    fs.unlinkSync(marker);
  } catch (error) {
    writableStatus = "failed";
    writableError = error instanceof Error ? error.message : String(error);
  }
  return {
    schemaVersion: "app_root_path_audit_v1",
    appRoot,
    executablePath: path.resolve(input.executablePath),
    isPackaged: input.isPackaged,
    paths: resolvedPaths,
    containment: { allInsideAppRoot: violations.length === 0, violations },
    writablePreflight: { status: writableStatus, checkedAt: input.checkedAt ?? new Date().toISOString(), error: writableError }
  };
}
