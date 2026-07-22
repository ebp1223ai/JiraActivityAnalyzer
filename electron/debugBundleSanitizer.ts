import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { createSanitizationContext, sanitizeTextForBundle, type SanitizationContext } from "./export/sanitizeExport.js";
import { hashFile } from "./fileBackedJson.js";
import type { StreamingZipEntry } from "./streamingZip.js";

const CHUNK_SIZE = 256 * 1024;
const SANITIZE_OVERLAP = 16 * 1024;

export type SanitizedFileManifestEntry = {
  path: string;
  source: { sha256: string; size: number };
  sanitized: { sha256: string; size: number };
  transformation: { sanitized: true; profile: "debug-bundle-v1" };
};

export function sanitizeFileForBundle(sourcePath: string, destinationPath: string, context: SanitizationContext = createSanitizationContext("jira-activity-analyzer-compat-context")) {
  const sourceHash = hashFile(sourcePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const temporaryPath = `${destinationPath}.${process.pid}.${Date.now()}.tmp`;
  const source = fs.openSync(sourcePath, "r");
  const destination = fs.openSync(temporaryPath, "w");
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
  let pending = "";
  let failure: unknown = null;
  try {
    for (;;) {
      const bytesRead = fs.readSync(source, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      pending += decoder.write(buffer.subarray(0, bytesRead));
      if (pending.length <= SANITIZE_OVERLAP * 2) continue;
      const splitAt = pending.length - SANITIZE_OVERLAP;
      fs.writeSync(destination, sanitizeTextForBundle(pending.slice(0, splitAt), context), null, "utf8");
      pending = pending.slice(splitAt);
    }
    pending += decoder.end();
    fs.writeSync(destination, sanitizeTextForBundle(pending, context), null, "utf8");
    fs.fsyncSync(destination);
  } catch (error) { failure = error; }
  finally { fs.closeSync(source); fs.closeSync(destination); }
  if (failure) { try { fs.rmSync(temporaryPath, { force: true }); } catch { /* best effort */ } throw failure; }
  try { fs.renameSync(temporaryPath, destinationPath); }
  catch { try { fs.rmSync(destinationPath, { force: true }); } catch { /* Windows replace fallback */ } fs.renameSync(temporaryPath, destinationPath); }
  const sanitizedHash = hashFile(destinationPath);
  return {
    source: { sha256: sourceHash.sha256, size: sourceHash.sizeBytes },
    sanitized: { sha256: sanitizedHash.sha256, size: sanitizedHash.sizeBytes },
    transformation: { sanitized: true as const, profile: "debug-bundle-v1" as const }
  };
}

export function sanitizedCopyTree(sourceDir: string, destinationDir: string, context: SanitizationContext = createSanitizationContext("jira-activity-analyzer-compat-context"), prefix = "") {
  const manifest: SanitizedFileManifestEntry[] = [];
  if (!fs.existsSync(sourceDir)) return manifest;
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);
    const relativePath = path.join(prefix, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) manifest.push(...sanitizedCopyTree(source, destination, context, relativePath));
    else if (entry.isFile()) manifest.push({ path: relativePath, ...sanitizeFileForBundle(source, destination, context) });
  }
  return manifest;
}

export function verifySanitizedFiles(rootDir: string, entries: SanitizedFileManifestEntry[]) {
  for (const entry of entries) {
    const filePath = path.resolve(rootDir, entry.path);
    if (filePath !== path.resolve(rootDir) && !filePath.startsWith(`${path.resolve(rootDir)}${path.sep}`)) throw new Error(`Sanitized bundle entry escapes root: ${entry.path}`);
    const actual = hashFile(filePath);
    if (actual.sha256 !== entry.sanitized.sha256 || actual.sizeBytes !== entry.sanitized.size) throw new Error(`Sanitized bundle hash mismatch: ${entry.path}`);
    if (entry.path.endsWith(".json")) JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (entry.path.endsWith(".ndjson")) for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean)) JSON.parse(line);
  }
  return { verified: true, verifiedCount: entries.length };
}

export function directoryZipEntries(rootDir: string, prefix = "debug-bundle/") {
  const entries: StreamingZipEntry[] = [];
  const pending = [rootDir];
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) entries.push({ name: `${prefix}${path.relative(rootDir, target).replace(/\\/g, "/")}`, filePath: target });
    }
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}
