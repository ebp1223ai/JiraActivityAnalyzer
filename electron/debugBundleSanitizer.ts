import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { sanitizeTextForBundle } from "./export/sanitizeExport.js";
import { hashFile } from "./fileBackedJson.js";
import type { StreamingZipEntry } from "./streamingZip.js";

const CHUNK_SIZE = 256 * 1024;
const SANITIZE_OVERLAP = 16 * 1024;

export function sanitizeFileForBundle(sourcePath: string, destinationPath: string) {
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
      fs.writeSync(destination, sanitizeTextForBundle(pending.slice(0, splitAt)), null, "utf8");
      pending = pending.slice(splitAt);
    }
    pending += decoder.end();
    fs.writeSync(destination, sanitizeTextForBundle(pending), null, "utf8");
    fs.fsyncSync(destination);
  } catch (error) { failure = error; }
  finally { fs.closeSync(source); fs.closeSync(destination); }
  if (failure) { try { fs.rmSync(temporaryPath, { force: true }); } catch { /* best effort */ } throw failure; }
  try { fs.renameSync(temporaryPath, destinationPath); }
  catch { try { fs.rmSync(destinationPath, { force: true }); } catch { /* Windows replace fallback */ } fs.renameSync(temporaryPath, destinationPath); }
  return hashFile(destinationPath);
}

export function sanitizedCopyTree(sourceDir: string, destinationDir: string) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) sanitizedCopyTree(source, destination);
    else if (entry.isFile()) sanitizeFileForBundle(source, destination);
  }
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
