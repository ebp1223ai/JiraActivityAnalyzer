import fs from "node:fs";
import path from "node:path";
import { ensureDir, getExportsDir } from "../appPaths.js";
import { sanitizeExportData } from "./sanitizeExport.js";

type ExportCategory =
  | "jira-analysis"
  | "jira-probe"
  | "timeline"
  | "user-analysis"
  | "import-preview"
  | "connections"
  | "dashboard"
  | "raw-data"
  | "debug-bundles";

type SaveExportRequest = {
  category: ExportCategory;
  defaultFileName: string;
  data: unknown;
};

function safeFileName(name: string) {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/\s+/g, "-");
  return cleaned.endsWith(".json") ? cleaned : `${cleaned}.json`;
}

export function ensureExportFolders() {
  const root = ensureDir(getExportsDir());
  const folders: Record<ExportCategory, string> = {
    "jira-analysis": ensureDir(path.join(root, "jira-analysis")),
    "jira-probe": ensureDir(path.join(root, "jira-probe")),
    timeline: ensureDir(path.join(root, "timeline")),
    "user-analysis": ensureDir(path.join(root, "user-analysis")),
    "import-preview": ensureDir(path.join(root, "import-preview")),
    connections: ensureDir(path.join(root, "connections")),
    dashboard: ensureDir(path.join(root, "dashboard")),
    "raw-data": ensureDir(path.join(root, "raw-data")),
    "debug-bundles": ensureDir(path.join(root, "debug-bundles"))
  };
  return { root, folders };
}

export function saveExportJson(request: SaveExportRequest) {
  const { folders } = ensureExportFolders();
  const folderPath = folders[request.category];
  const filePath = path.join(folderPath, safeFileName(request.defaultFileName));
  const sanitized = sanitizeExportData(request.data);
  fs.writeFileSync(filePath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  return { canceled: false, filePath, folderPath };
}
