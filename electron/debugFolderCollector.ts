import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isPathInsideRoot } from "./appRoot.js";

export type DebugFolderSource = { sourcePath: string; relativePath: string };
export type DebugFolderEntry = { sourcePath: string; relativePath: string; size: number; status: "copied" | "copy_failed"; reason: string; sourceSha256?: string; destinationSha256?: string; hashMatch?: boolean };
export type DebugEvidenceStatus = "copied" | "not_observed" | "not_run" | "source_missing" | "copy_failed";
export type DebugEvidenceEntry = { id: string; status: DebugEvidenceStatus; sourcePath?: string; relativePath?: string; reason: string };

function safeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe debug folder relative path: ${value}`);
  }
  return normalized;
}

function sha256File(filePath: string) { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }

function copyFile(outputRoot: string, sourcePath: string, relativePath: string): DebugFolderEntry {
  try {
    const stat = fs.lstatSync(sourcePath);
    if (stat.isSymbolicLink()) throw new Error("symbolic links are not copied");
    if (!stat.isFile()) throw new Error("source is not a regular file");
    const target = path.resolve(outputRoot, ...relativePath.split("/"));
    const root = path.resolve(outputRoot);
    if (!isPathInsideRoot(root, target)) throw new Error("destination escapes debug folder");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const sourceSha256 = sha256File(sourcePath);
    fs.copyFileSync(sourcePath, target);
    const destinationSha256 = sha256File(target);
    if (sourceSha256 !== destinationSha256) throw new Error("copied file hash mismatch");
    return { sourcePath, relativePath, size: stat.size, status: "copied", reason: "", sourceSha256, destinationSha256, hashMatch: true };
  } catch (error) {
    return { sourcePath, relativePath, size: 0, status: "copy_failed", reason: error instanceof Error ? error.message : String(error) };
  }
}

function collectDirectory(outputRoot: string, sourceRoot: string, relativeRoot: string, entries: DebugFolderEntry[]) {
  let children: fs.Dirent[];
  try { children = fs.readdirSync(sourceRoot, { withFileTypes: true }); }
  catch (error) {
    entries.push({ sourcePath: sourceRoot, relativePath: relativeRoot, size: 0, status: "copy_failed", reason: error instanceof Error ? error.message : String(error) });
    return;
  }
  for (const child of children) {
    const sourcePath = path.join(sourceRoot, child.name);
    const relativePath = `${relativeRoot}/${child.name}`;
    if (child.isSymbolicLink()) entries.push({ sourcePath, relativePath, size: 0, status: "copy_failed", reason: "symbolic links are not copied" });
    else if (child.isDirectory()) collectDirectory(outputRoot, sourcePath, relativePath, entries);
    else entries.push(copyFile(outputRoot, sourcePath, relativePath));
  }
}

export function collectDebugFolderSources(outputRoot: string, sources: DebugFolderSource[]) {
  const entries: DebugFolderEntry[] = [];
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const source of sources) {
    let relativePath: string;
    try { relativePath = safeRelativePath(source.relativePath); }
    catch (error) {
      entries.push({ sourcePath: source.sourcePath, relativePath: source.relativePath, size: 0, status: "copy_failed", reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    try {
      const stat = fs.lstatSync(source.sourcePath);
      if (stat.isDirectory()) collectDirectory(outputRoot, source.sourcePath, relativePath, entries);
      else entries.push(copyFile(outputRoot, source.sourcePath, relativePath));
    } catch (error) {
      entries.push({ sourcePath: source.sourcePath, relativePath, size: 0, status: "copy_failed", reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    entries,
    successful: entries.filter((entry) => entry.status === "copied"),
    failed: entries.filter((entry) => entry.status === "copy_failed")
  };
}

export function listDebugFolderFiles(outputRoot: string) {
  const files: Array<{ relativePath: string; size: number; status: "copied" }> = [];
  const visit = (directory: string, prefix = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relativePath = path.join(prefix, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) visit(absolute, relativePath);
      else if (entry.isFile()) files.push({ relativePath, size: fs.statSync(absolute).size, status: "copied" });
    }
  };
  visit(outputRoot);
  return files;
}

export function summarizeDebugEvidence(entries: DebugEvidenceEntry[], placeholderFilesCreated = 0) {
  const count = (status: DebugEvidenceStatus) => entries.filter((entry) => entry.status === status).length;
  return {
    filesCopied: count("copied"),
    sourcesNotObserved: count("not_observed"),
    featuresNotRun: count("not_run"),
    sourcesMissing: count("source_missing"),
    copyFailures: count("copy_failed"),
    placeholderFilesCreated
  };
}

export function describeFullFetchFailureEvidence(wasRun: boolean, failedCount: number) {
  return wasRun
    ? { runStatus: "executed" as const, failedCount, hasFailedIssuesFile: true }
    : { runStatus: "not_run" as const, failedCount: null, hasFailedIssuesFile: false };
}
