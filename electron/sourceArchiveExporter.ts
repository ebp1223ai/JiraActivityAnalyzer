import path from "node:path";
import { canonicalJsonSha256 } from "./activityStreamRoundStability.js";

export type SourceArchiveSystem = "jira" | "confluence";

export type SourceArchiveEnvelope = {
  sourceSystem: SourceArchiveSystem;
  objectType: "issue" | "page";
  objectKey: string;
  sourceVersionNumber: number | null;
  sourceUpdatedAt: string | null;
  contentHash: string;
  rawPayload: Record<string, unknown>;
  sourceBundleName: string;
  sourceFileName: string;
  sourceJsonPath: string;
};

export type SourceArchiveInput = {
  jiraPayloads: unknown[];
  confluencePayloads?: unknown[];
  selectedUser?: string;
  sourceBundleName?: string;
  exportedAt?: string;
};

export type SourceArchivePackage = {
  fileName: string;
  files: Record<string, Buffer>;
  zip: Buffer;
  manifest: Record<string, unknown>;
  summary: Record<string, number>;
  errors: Array<Record<string, unknown>>;
  refs: Array<Record<string, unknown>>;
  logs: string[];
};

const sensitiveKey = /(^|_)(authorization|cookie|set-cookie|token|api[_-]?token|password|passwd|secret|credential)(_|$)/i;
const sensitiveValue = /\b(?:basic|bearer)\s+[A-Za-z0-9+/=_-]{8,}/i;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

export function findSensitiveData(value: unknown, currentPath = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findSensitiveData(item, `${currentPath}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => sensitiveKey.test(key) ? [`${currentPath}.${key}`] : findSensitiveData(child, `${currentPath}.${key}`));
  return typeof value === "string" && sensitiveValue.test(value) ? [currentPath] : [];
}

function payloadRecord(item: unknown, system: SourceArchiveSystem): { raw: Record<string, unknown>; key: string; fileName: string; jsonPath: string } {
  const wrapper = record(item);
  const issueWrapper = record(wrapper.issue);
  const raw = record(wrapper.rawPayload ?? wrapper.json ?? issueWrapper.json ?? wrapper.result ?? item);
  const fields = record(raw.fields);
  const key = system === "jira"
    ? text(wrapper.issueKey ?? issueWrapper.issueKey ?? raw.key ?? raw.id)
    : text(wrapper.pageId ?? wrapper.objectKey ?? raw.id ?? raw.contentId);
  const fileName = text(wrapper.sourceFileName) || `${key || "unknown"}.raw.json`;
  const jsonPath = text(wrapper.sourceJsonPath) || (wrapper.json ? "$.json" : wrapper.issue ? "$.issue.json" : "$");
  void fields;
  return { raw, key, fileName: path.basename(fileName), jsonPath };
}

function envelope(item: unknown, system: SourceArchiveSystem, sourceBundleName: string): { value?: SourceArchiveEnvelope; errors: Array<Record<string, unknown>> } {
  const parsed = payloadRecord(item, system);
  const errors: Array<Record<string, unknown>> = [];
  if (!parsed.key) errors.push({ sourceSystem: system, code: "missing_object_key", sourceFileName: parsed.fileName, message: "Object key is required. / 缺少物件編號。" });
  const sensitivePaths = findSensitiveData(parsed.raw);
  if (sensitivePaths.length) errors.push({ sourceSystem: system, objectKey: parsed.key, code: "sensitive_data_detected", paths: sensitivePaths, message: "Sensitive data was detected; payload excluded. / 偵測到敏感資料，已排除此 payload。" });
  if (!parsed.key || sensitivePaths.length) return { errors };
  const primaryRaw = system === "jira" ? record(parsed.raw.issue ?? parsed.raw) : parsed.raw;
  const fields = record(primaryRaw.fields);
  const version = record(primaryRaw.version);
  const sourceUpdatedAt = text(system === "jira" ? fields.updated ?? primaryRaw.updated : version.when ?? primaryRaw.updatedAt ?? primaryRaw.lastModified) || null;
  const sourceVersionNumber = Number(version.number ?? primaryRaw.versionNumber);
  if (!sourceUpdatedAt) errors.push({ sourceSystem: system, objectKey: parsed.key, code: "missing_updated_time", sourceFileName: parsed.fileName, message: "Source updated time is unavailable. / 缺少來源更新時間。" });
  let contentHash: string;
  try { contentHash = canonicalJsonSha256(parsed.raw); }
  catch (error) {
    errors.push({ sourceSystem: system, objectKey: parsed.key, code: "hash_error", sourceFileName: parsed.fileName, message: `Canonical JSON hash failed: ${error instanceof Error ? error.message : String(error)}` });
    return { errors };
  }
  return {
    value: {
      sourceSystem: system,
      objectType: system === "jira" ? "issue" : "page",
      objectKey: parsed.key,
      sourceVersionNumber: Number.isFinite(sourceVersionNumber) ? sourceVersionNumber : null,
      sourceUpdatedAt,
      contentHash,
      rawPayload: parsed.raw,
      sourceBundleName,
      sourceFileName: parsed.fileName,
      sourceJsonPath: parsed.jsonPath
    },
    errors
  };
}

function json(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function jsonl(values: unknown[]): Buffer {
  return Buffer.from(values.map((value) => JSON.stringify(value)).join("\n") + (values.length ? "\n" : ""), "utf8");
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(files: Record<string, Buffer>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name.replace(/\\/g, "/"), "utf8");
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

export function listZipEntries(zip: Buffer): string[] {
  const entries: string[] = [];
  let offset = 0;
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const size = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    entries.push(zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"));
    offset += 30 + nameLength + extraLength + size;
  }
  return entries;
}

export function buildSourceArchivePackage(input: SourceArchiveInput): SourceArchivePackage {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  const timestamp = exportedAt.replace(/[-:TZ.]/g, "").slice(0, 14);
  const safeUser = text(input.selectedUser).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60);
  const fileName = `source-archive-import-package-${safeUser ? `${safeUser}-` : ""}${timestamp}.zip`;
  const sourceBundleName = text(input.sourceBundleName) || fileName;
  const converted = [
    ...input.jiraPayloads.map((item) => envelope(item, "jira", sourceBundleName)),
    ...(input.confluencePayloads ?? []).map((item) => envelope(item, "confluence", sourceBundleName))
  ];
  const errors = converted.flatMap((item) => item.errors);
  const candidates = converted.flatMap((item) => item.value ? [item.value] : []);
  const seen = new Set<string>();
  const payloads = candidates.filter((item) => {
    const identity = `${item.sourceSystem}:${item.objectKey}:${item.contentHash}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  const jira = payloads.filter((item) => item.sourceSystem === "jira");
  const confluence = payloads.filter((item) => item.sourceSystem === "confluence");
  const duplicateContentCount = candidates.length - payloads.length;
  const summary = {
    jiraFullFetchObjectCount: jira.length,
    confluenceFullFetchObjectCount: confluence.length,
    uniquePayloadCount: payloads.length,
    duplicateContentCount,
    newObjectVersionCount: payloads.length,
    missingObjectKeyCount: errors.filter((item) => item.code === "missing_object_key").length,
    missingUpdatedTimeCount: errors.filter((item) => item.code === "missing_updated_time").length,
    hashErrorCount: errors.filter((item) => item.code === "hash_error").length,
    exportErrorCount: errors.filter((item) => item.code === "sensitive_data_detected").length
  };
  const refs = payloads.map(({ sourceSystem, objectType, objectKey, contentHash, sourceBundleName: bundle, sourceFileName, sourceJsonPath }) => ({ sourceSystem, objectType, objectKey, contentHash, sourceBundleName: bundle, sourceFileName, sourceJsonPath }));
  const manifest = { schemaVersion: "source_archive_import_package_v1", appVersion: "0.2.26", exportedAt, packageScope: "full_fetch_raw_json_only", jira: { count: jira.length, file: "jira-full-fetch-payloads.jsonl" }, confluence: { count: confluence.length, file: "confluence-full-fetch-payloads.jsonl" }, sensitiveDataScan: { passed: summary.exportErrorCount === 0, excludedPayloadCount: summary.exportErrorCount }, files: ["source-archive-import-manifest.json", "jira-full-fetch-payloads.jsonl", "confluence-full-fetch-payloads.jsonl", "source-import-refs.json", "source-archive-import-summary.json", "source-archive-import-errors.json", "README_Source_Archive_Import.txt"] };
  const prefix = "source-archive-import-package/";
  const files: Record<string, Buffer> = {
    [`${prefix}source-archive-import-manifest.json`]: json(manifest),
    [`${prefix}jira-full-fetch-payloads.jsonl`]: jsonl(jira),
    [`${prefix}confluence-full-fetch-payloads.jsonl`]: jsonl(confluence),
    [`${prefix}source-import-refs.json`]: json(refs),
    [`${prefix}source-archive-import-summary.json`]: json(summary),
    [`${prefix}source-archive-import-errors.json`]: json(errors),
    [`${prefix}README_Source_Archive_Import.txt`]: Buffer.from("Source Archive Import Package / 來源封存匯入套件\n\nContains Jira and Confluence Full Fetch raw JSON only.\n僅包含 Jira 與 Confluence Full Fetch 原始 JSON。\n\nIt does not contain Activity Stream, probe, timeline, evidence, UI state, debug logs, credentials, or attachment files.\n不包含 Activity Stream、Probe、Timeline、Evidence、UI 狀態、Debug Log、憑證或附件檔案。\n", "utf8")
  };
  const logs = payloads.map((item) => `[INFO] Source Archive export sourceSystem=${item.sourceSystem} objectKey=${item.objectKey} contentHash=${item.contentHash} status=included`);
  return { fileName, files, zip: createZip(files), manifest, summary, errors, refs, logs };
}
