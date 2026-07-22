import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { hashFile } from "./fileBackedJson.js";

export type StreamingZipEntry = { name: string; filePath?: string; data?: Buffer };
export type StreamingZipEntrySummary = { name: string; sizeBytes: number; crc32: number; sha256: string };

const IO_CHUNK_SIZE = 256 * 1024;
export class StreamingZipError extends Error {
  readonly code = "streaming_zip_failed";
  readonly stage = "streaming_zip_write";
  constructor(message: string, cause: unknown) { super(message, { cause }); this.name = "StreamingZipError"; }
}
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function updateCrc(crc: number, buffer: Buffer) {
  let value = crc;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function analyzeEntry(entry: StreamingZipEntry): StreamingZipEntrySummary {
  const name = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!name || name.includes("../") || name.includes("\0")) throw new Error(`Invalid ZIP entry name: ${entry.name}`);
  let crc = 0xffffffff;
  const hash = crypto.createHash("sha256");
  let sizeBytes = 0;
  if (entry.data) {
    crc = updateCrc(crc, entry.data);
    hash.update(entry.data);
    sizeBytes = entry.data.length;
  } else if (entry.filePath) {
    const descriptor = fs.openSync(entry.filePath, "r");
    const buffer = Buffer.allocUnsafe(IO_CHUNK_SIZE);
    try {
      for (;;) {
        const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
        if (!bytesRead) break;
        const chunk = buffer.subarray(0, bytesRead);
        crc = updateCrc(crc, chunk);
        hash.update(chunk);
        sizeBytes += bytesRead;
      }
    } finally { fs.closeSync(descriptor); }
  } else throw new Error(`ZIP entry has no source: ${name}`);
  if (sizeBytes > 0xffffffff) throw new Error(`ZIP32 entry exceeds 4 GiB: ${name}`);
  return { name, sizeBytes, crc32: (crc ^ 0xffffffff) >>> 0, sha256: hash.digest("hex") };
}

function writeAll(descriptor: number, buffer: Buffer) {
  let offset = 0;
  while (offset < buffer.length) offset += fs.writeSync(descriptor, buffer, offset, buffer.length - offset);
}

function copyEntryData(descriptor: number, entry: StreamingZipEntry) {
  if (entry.data) { writeAll(descriptor, entry.data); return; }
  const source = fs.openSync(entry.filePath!, "r");
  const buffer = Buffer.allocUnsafe(IO_CHUNK_SIZE);
  try {
    for (;;) {
      const bytesRead = fs.readSync(source, buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      writeAll(descriptor, buffer.subarray(0, bytesRead));
    }
  } finally { fs.closeSync(source); }
}

export function createStreamingZip(zipPath: string, entries: StreamingZipEntry[]) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  const temporaryPath = `${zipPath}.${process.pid}.${Date.now()}.tmp`;
  let summaries: StreamingZipEntrySummary[] = [];
  let descriptor: number | null = null;
  const centralParts: Buffer[] = [];
  let offset = 0;
  try {
    summaries = entries.map(analyzeEntry);
    descriptor = fs.openSync(temporaryPath, "w");
    const output = descriptor;
    entries.forEach((entry, index) => {
      const summary = summaries[index];
      const nameBuffer = Buffer.from(summary.name, "utf8");
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
      local.writeUInt32LE(summary.crc32, 14); local.writeUInt32LE(summary.sizeBytes, 18); local.writeUInt32LE(summary.sizeBytes, 22); local.writeUInt16LE(nameBuffer.length, 26);
      writeAll(output, local); writeAll(output, nameBuffer); copyEntryData(output, entry);
      const central = Buffer.alloc(46);
      central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
      central.writeUInt32LE(summary.crc32, 16); central.writeUInt32LE(summary.sizeBytes, 20); central.writeUInt32LE(summary.sizeBytes, 24); central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt32LE(offset, 42);
      centralParts.push(central, nameBuffer);
      offset += local.length + nameBuffer.length + summary.sizeBytes;
    });
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    for (const part of centralParts) writeAll(descriptor, part);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
    writeAll(descriptor, end);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = null;
    try { fs.renameSync(temporaryPath, zipPath); }
    catch { try { fs.rmSync(zipPath, { force: true }); } catch { /* Windows replace fallback. */ } fs.renameSync(temporaryPath, zipPath); }
  } catch (error) {
    if (descriptor !== null) try { fs.closeSync(descriptor); } catch { /* best effort */ }
    try { fs.rmSync(temporaryPath, { force: true }); } catch { /* best effort */ }
    throw new StreamingZipError(`Failed to create streaming ZIP ${path.basename(zipPath)}: ${error instanceof Error ? error.message : String(error)}`, error);
  }
  return { zipPath, entries: summaries, ...hashFile(zipPath) };
}

function readExact(descriptor: number, length: number, position: number) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const bytesRead = fs.readSync(descriptor, buffer, offset, length - offset, position + offset);
    if (!bytesRead) throw new Error("ZIP entry is truncated.");
    offset += bytesRead;
  }
  return buffer;
}

export function verifyStreamingZip(zipPath: string, expected: StreamingZipEntrySummary[]) {
  const descriptor = fs.openSync(zipPath, "r");
  const actual: StreamingZipEntrySummary[] = [];
  let position = 0;
  try {
    for (;;) {
      const signature = readExact(descriptor, 4, position).readUInt32LE(0);
      if (signature === 0x02014b50) break;
      if (signature !== 0x04034b50) throw new Error("Unexpected ZIP local header signature.");
      const header = readExact(descriptor, 30, position);
      const flags = header.readUInt16LE(6);
      const compression = header.readUInt16LE(8);
      const expectedCrc = header.readUInt32LE(14);
      const size = header.readUInt32LE(18);
      const uncompressed = header.readUInt32LE(22);
      const nameLength = header.readUInt16LE(26);
      const extraLength = header.readUInt16LE(28);
      if ((flags & 0x0008) !== 0 || compression !== 0 || size !== uncompressed) throw new Error("Unsupported ZIP entry encoding.");
      const name = readExact(descriptor, nameLength, position + 30).toString("utf8");
      const dataStart = position + 30 + nameLength + extraLength;
      const hash = crypto.createHash("sha256");
      let crc = 0xffffffff;
      let remaining = size;
      let cursor = dataStart;
      while (remaining > 0) {
        const length = Math.min(IO_CHUNK_SIZE, remaining);
        const chunk = readExact(descriptor, length, cursor);
        hash.update(chunk); crc = updateCrc(crc, chunk); cursor += length; remaining -= length;
      }
      const crc32 = (crc ^ 0xffffffff) >>> 0;
      if (crc32 !== expectedCrc) throw new Error(`ZIP CRC mismatch: ${name}`);
      actual.push({ name, sizeBytes: size, crc32, sha256: hash.digest("hex") });
      position = cursor;
    }
    const fileSize = fs.fstatSync(descriptor).size;
    const end = readExact(descriptor, 22, fileSize - 22);
    if (end.readUInt32LE(0) !== 0x06054b50 || end.readUInt16LE(10) !== actual.length) throw new Error("ZIP central directory count mismatch.");
  } finally { fs.closeSync(descriptor); }
  const expectedByName = new Map(expected.map((entry) => [entry.name, entry]));
  if (actual.length !== expected.length || new Set(actual.map((entry) => entry.name)).size !== actual.length) throw new Error("ZIP entry count or uniqueness verification failed.");
  for (const entry of actual) {
    const match = expectedByName.get(entry.name);
    if (!match || match.sizeBytes !== entry.sizeBytes || match.sha256 !== entry.sha256 || match.crc32 !== entry.crc32) throw new Error(`ZIP entry verification failed: ${entry.name}`);
  }
  return actual;
}
