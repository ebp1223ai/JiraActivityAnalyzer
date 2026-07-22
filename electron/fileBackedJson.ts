import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

export type FileReference = {
  path: string;
  sha256: string;
  sizeBytes: number;
  recordCount: number;
};

const WRITE_CHUNK_SIZE = 64 * 1024;
const HASH_CHUNK_SIZE = 256 * 1024;

export class FileBackedWriteError extends Error {
  readonly code: string;
  readonly stage = "canonical_write";

  constructor(code: string, message: string, cause: unknown) {
    super(message, { cause });
    this.name = "FileBackedWriteError";
    this.code = code;
  }
}

function writeError(error: unknown, filePath: string) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof TypeError && /BigInt/.test(message)
    ? "unsupported_json_value"
    : error instanceof RangeError
      ? "json_value_range_error"
      : "canonical_file_write_failed";
  return new FileBackedWriteError(code, `Failed to write canonical file ${path.basename(filePath)}: ${message}`, error);
}

class HashingWriter {
  private readonly descriptor: number;
  private readonly hash = crypto.createHash("sha256");
  private sizeBytes = 0;

  constructor(private readonly temporaryPath: string) {
    fs.mkdirSync(path.dirname(temporaryPath), { recursive: true });
    this.descriptor = fs.openSync(temporaryPath, "w");
  }

  write(text: string) {
    for (let offset = 0; offset < text.length; offset += WRITE_CHUNK_SIZE) {
      const chunk = Buffer.from(text.slice(offset, offset + WRITE_CHUNK_SIZE), "utf8");
      fs.writeSync(this.descriptor, chunk);
      this.hash.update(chunk);
      this.sizeBytes += chunk.length;
    }
  }

  finish() {
    fs.fsyncSync(this.descriptor);
    fs.closeSync(this.descriptor);
    return { sha256: this.hash.digest("hex"), sizeBytes: this.sizeBytes };
  }

  abort() {
    try { fs.closeSync(this.descriptor); } catch { /* already closed */ }
    try { fs.rmSync(this.temporaryPath, { force: true }); } catch { /* best effort */ }
  }
}

function replaceFile(temporaryPath: string, filePath: string) {
  try { fs.renameSync(temporaryPath, filePath); }
  catch {
    try { fs.rmSync(filePath, { force: true }); } catch { /* Windows replace fallback. */ }
    fs.renameSync(temporaryPath, filePath);
  }
}

function writeJsonString(writer: HashingWriter, value: string) {
  writer.write('"');
  for (let offset = 0; offset < value.length;) {
    let end = Math.min(value.length, offset + WRITE_CHUNK_SIZE);
    if (end < value.length) {
      const last = value.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) end -= 1;
    }
    const encoded = JSON.stringify(value.slice(offset, end));
    writer.write(encoded.slice(1, -1));
    offset = end;
  }
  writer.write('"');
}

function writeJsonValue(writer: HashingWriter, value: unknown, inArray = false): boolean {
  if (value === null) { writer.write("null"); return true; }
  if (typeof value === "string") { writeJsonString(writer, value); return true; }
  if (typeof value === "number") { writer.write(Number.isFinite(value) ? String(value) : "null"); return true; }
  if (typeof value === "boolean") { writer.write(value ? "true" : "false"); return true; }
  if (typeof value === "bigint") throw new TypeError("BigInt cannot be serialized to JSON.");
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    if (inArray) writer.write("null");
    return inArray;
  }
  if (Array.isArray(value)) {
    writer.write("[");
    value.forEach((item, index) => {
      if (index > 0) writer.write(",");
      writeJsonValue(writer, item, true);
    });
    writer.write("]");
    return true;
  }
  if (typeof value === "object") {
    const serializable = value as Record<string, unknown> & { toJSON?: () => unknown };
    if (typeof serializable.toJSON === "function") return writeJsonValue(writer, serializable.toJSON(), inArray);
    writer.write("{");
    let written = 0;
    for (const [key, child] of Object.entries(serializable)) {
      if (child === undefined || typeof child === "function" || typeof child === "symbol") continue;
      if (written > 0) writer.write(",");
      writeJsonString(writer, key);
      writer.write(":");
      writeJsonValue(writer, child);
      written += 1;
    }
    writer.write("}");
    return true;
  }
  return false;
}

export function atomicWriteJsonStream(filePath: string, value: unknown, relativePath: string, recordCount = 1): FileReference {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const writer = new HashingWriter(temporaryPath);
  try {
    writeJsonValue(writer, value);
    writer.write("\n");
    const metadata = writer.finish();
    replaceFile(temporaryPath, filePath);
    return { path: relativePath.replace(/\\/g, "/"), ...metadata, recordCount };
  } catch (error) {
    writer.abort();
    throw writeError(error, filePath);
  }
}

export function atomicWriteNdjsonStream(filePath: string, values: Iterable<unknown>, relativePath: string): FileReference {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const writer = new HashingWriter(temporaryPath);
  let recordCount = 0;
  try {
    for (const value of values) {
      writeJsonValue(writer, value);
      writer.write("\n");
      recordCount += 1;
    }
    const metadata = writer.finish();
    replaceFile(temporaryPath, filePath);
    return { path: relativePath.replace(/\\/g, "/"), ...metadata, recordCount };
  } catch (error) {
    writer.abort();
    throw writeError(error, filePath);
  }
}

export function hashFile(filePath: string) {
  const descriptor = fs.openSync(filePath, "r");
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_SIZE);
  let sizeBytes = 0;
  try {
    for (;;) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      sizeBytes += bytesRead;
    }
  } finally { fs.closeSync(descriptor); }
  return { sha256: hash.digest("hex"), sizeBytes };
}

export function verifyFileReference(rootDir: string, reference: FileReference) {
  const filePath = resolveInside(rootDir, reference.path);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return { ok: false, filePath, errorCode: "canonical_file_missing" };
  const actual = hashFile(filePath);
  if (actual.sizeBytes !== reference.sizeBytes) return { ok: false, filePath, errorCode: "canonical_size_mismatch" };
  if (actual.sha256 !== reference.sha256) return { ok: false, filePath, errorCode: "canonical_hash_mismatch" };
  return { ok: true, filePath, errorCode: "" };
}

export function validateGeneratedJsonFile(filePath: string, allowEmpty = false) {
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(HASH_CHUNK_SIZE);
  const decoder = new StringDecoder("utf8");
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let unicodeRemaining = 0;
  let hasToken = false;
  const consume = (text: string) => {
    for (const character of text) {
      if (inString) {
        if (unicodeRemaining > 0) {
          if (!/[0-9a-f]/i.test(character)) return false;
          unicodeRemaining -= 1;
        } else if (escaped) {
          if (character === "u") unicodeRemaining = 4;
          else if (!/["\\/bfnrt]/.test(character)) return false;
          escaped = false;
        } else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        else if (character.charCodeAt(0) < 0x20) return false;
        continue;
      }
      if (character === '"') { inString = true; hasToken = true; continue; }
      if (character === "{" || character === "[") { stack.push(character); hasToken = true; continue; }
      if (character === "}" || character === "]") {
        const expected = character === "}" ? "{" : "[";
        if (stack.pop() !== expected) return false;
        continue;
      }
      if (!/\s/.test(character)) hasToken = true;
    }
    return true;
  };
  try {
    for (;;) {
      const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      if (!consume(decoder.write(buffer.subarray(0, bytesRead)))) return false;
    }
    if (!consume(decoder.end())) return false;
    return (hasToken || allowEmpty) && !inString && !escaped && unicodeRemaining === 0 && stack.length === 0;
  } finally { fs.closeSync(descriptor); }
}

export function directorySize(rootDir: string) {
  if (!fs.existsSync(rootDir)) return 0;
  let total = 0;
  const pending = [rootDir];
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) total += fs.statSync(target).size;
    }
  }
  return total;
}

export function readSmallJson<T>(filePath: string, maxBytes = 16 * 1024 * 1024): T {
  const size = fs.statSync(filePath).size;
  if (size > maxBytes) throw new Error(`Refusing to load non-index JSON larger than ${maxBytes} bytes: ${path.basename(filePath)}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function safeIssueDirectoryName(issueKey: string) {
  const normalized = issueKey.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,59}-[1-9][0-9]{0,19}$/.test(normalized)) throw new Error(`Invalid Jira issue key: ${issueKey}`);
  return normalized;
}

export function resolveInside(rootDir: string, relativePath: string) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("\0")) throw new Error("Invalid relative file reference.");
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relativePath);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error("File reference escapes the staging root.");
  return target;
}
