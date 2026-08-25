import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const sha256BytesV0337 = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");

export function durableWriteBytesV0337(targetPath: string, bytes: Buffer) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporaryPath, "wx", 0o600);
  try { fs.writeFileSync(descriptor, bytes); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  fs.renameSync(temporaryPath, targetPath);
  try { const parent = fs.openSync(path.dirname(targetPath), "r"); try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); } } catch { /* Directory fsync is not available on every Windows filesystem. */ }
  return verifyFileV0337(targetPath, bytes.length, sha256BytesV0337(bytes));
}

export function durableWriteJsonV0337(targetPath: string, value: unknown) {
  return durableWriteBytesV0337(targetPath, Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8"));
}

export function verifyFileV0337(filePath: string, expectedBytes: number, expectedSha256: string) {
  const reopened = fs.readFileSync(filePath);
  const observedSha256 = sha256BytesV0337(reopened);
  if (reopened.length !== expectedBytes || observedSha256 !== expectedSha256) {
    throw Object.assign(new Error(`DURABLE_FILE_VERIFY_FAILED:${filePath}`), { code: "DURABLE_FILE_VERIFY_FAILED", expectedBytes, observedBytes: reopened.length, expectedSha256, observedSha256 });
  }
  return Object.freeze({ filePath, bytes: reopened.length, sha256: observedSha256 });
}
