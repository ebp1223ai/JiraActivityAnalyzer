import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { RUNTIME_CONTRACT_V0335, type RuntimeContractV0335 } from "./runtimeContractRegistryV0335.js";

type JsonObject = Record<string, unknown>;
type ManifestSegment = { segmentIndex: number; startByte: number; endByteExclusive: number; expectedBytes: number; sha256: string };
type ManifestFile = { fileId: string; role: string; fileName: string; expectedBytes: number; expectedSha256: string; segmentCount: number; segments: ManifestSegment[] };
export type ModelInputManifestV0335 = {
  schemaVersion: string;
  transportProtocol: string;
  segmentSchemaVersion: string;
  segmentPlannerVersion: string;
  boundaryReceiptVersion: string;
  runtimeContractRegistry: string;
  runtimeContractHash: string;
  manifestFactoryVersion: string;
  expectedFileCount: number;
  expectedRecordCount: number;
  segmentByteLimit: number;
  files: ManifestFile[];
  deliveryHandleContract: string;
  artifactSubmissionTokenContract: string;
  deliveryHandle: string;
  artifactSubmissionToken: string | null;
  hostOwnedIdentity: true;
};

export type RuntimeManifestReceiptV0335 = {
  schemaVersion: "jaa-runtime-manifest-receipt-v1";
  registryHash: string;
  factoryVersion: string;
  expectedSchema: string;
  observedSchema: string | null;
  expectedProtocol: string;
  observedProtocol: string | null;
  preSerializationHash: string;
  postSerializationHash: string;
  selfValidationPassed: boolean;
  providerDispatchAllowed: boolean;
  errorCode: string | null;
  checkedAtUtc: string;
};

const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const fail = (code: string, message: string): never => { throw Object.assign(new Error(`${code}:${message}`), { code }); };

function mapSegment(value: unknown): ManifestSegment {
  const source = object(value);
  return {
    segmentIndex: Number(source.segmentIndex),
    startByte: Number(source.startByte),
    endByteExclusive: Number(source.endByteExclusive),
    expectedBytes: Number(source.expectedBytes),
    sha256: String(source.sha256 ?? "")
  };
}

function mapFile(value: unknown): ManifestFile {
  const source = object(value);
  const segments = Array.isArray(source.segments) ? source.segments.map(mapSegment) : [];
  return {
    fileId: String(source.fileId ?? ""),
    role: String(source.role ?? ""),
    fileName: String(source.fileName ?? ""),
    expectedBytes: Number(source.expectedBytes),
    expectedSha256: String(source.expectedSha256 ?? ""),
    segmentCount: Number(source.segmentCount),
    segments
  };
}

export function createModelInputManifestV3(
  runtimeContract: RuntimeContractV0335,
  sourceManifest: unknown,
  handles: { deliveryHandle: string; artifactSubmissionToken: string | null }
): ModelInputManifestV0335 {
  const source = object(sourceManifest);
  const files = Array.isArray(source.files) ? source.files.map(mapFile) : [];
  return {
    schemaVersion: runtimeContract.modelInputManifestSchema,
    transportProtocol: runtimeContract.providerTransport,
    segmentSchemaVersion: runtimeContract.modelInputSegmentSchema,
    segmentPlannerVersion: runtimeContract.segmentPlanner,
    boundaryReceiptVersion: runtimeContract.segmentBoundaryReceipt,
    runtimeContractRegistry: runtimeContract.schemaVersion,
    runtimeContractHash: runtimeContract.registryHash,
    manifestFactoryVersion: runtimeContract.manifestFactoryVersion,
    expectedFileCount: Number(source.expectedFileCount),
    expectedRecordCount: Number(source.expectedRecordCount),
    segmentByteLimit: Number(source.segmentByteLimit),
    files,
    deliveryHandleContract: runtimeContract.modelDeliveryHandleContract,
    artifactSubmissionTokenContract: runtimeContract.artifactSubmissionTokenContract,
    deliveryHandle: handles.deliveryHandle,
    artifactSubmissionToken: handles.artifactSubmissionToken,
    hostOwnedIdentity: true
  };
}

export function validateModelInputManifestV3(value: unknown, runtimeContract: RuntimeContractV0335 = RUNTIME_CONTRACT_V0335) {
  const manifest = object(value);
  if (manifest.schemaVersion !== runtimeContract.modelInputManifestSchema) fail("AI_RUNTIME_MANIFEST_SCHEMA_MISMATCH", `Expected ${runtimeContract.modelInputManifestSchema}, observed ${String(manifest.schemaVersion ?? "missing")}.`);
  if (manifest.segmentSchemaVersion !== runtimeContract.modelInputSegmentSchema || manifest.segmentPlannerVersion !== runtimeContract.segmentPlanner || manifest.boundaryReceiptVersion !== runtimeContract.segmentBoundaryReceipt) fail("AI_RUNTIME_CONTRACT_REGISTRY_MISMATCH", "Segment schema, planner, or boundary receipt identity mismatch.");
  if (manifest.transportProtocol !== runtimeContract.providerTransport) fail("AI_RUNTIME_MANIFEST_PROTOCOL_MISMATCH", `Expected ${runtimeContract.providerTransport}, observed ${String(manifest.transportProtocol ?? "missing")}.`);
  if (manifest.runtimeContractHash !== runtimeContract.registryHash || manifest.runtimeContractRegistry !== runtimeContract.schemaVersion || manifest.manifestFactoryVersion !== runtimeContract.manifestFactoryVersion) fail("AI_RUNTIME_CONTRACT_REGISTRY_MISMATCH", "Runtime Manifest registry or factory identity mismatch.");
  if (manifest.deliveryHandleContract !== runtimeContract.modelDeliveryHandleContract || manifest.artifactSubmissionTokenContract !== runtimeContract.artifactSubmissionTokenContract) fail("AI_RUNTIME_MANIFEST_HANDLE_CONTRACT_MISMATCH", "Delivery handle or artifact token contract mismatch.");
  const files = Array.isArray(manifest.files) ? manifest.files.map(mapFile) : [];
  if (Number(manifest.expectedFileCount) !== 4 || files.length !== 4) fail("AI_RUNTIME_MANIFEST_FILE_COUNT_MISMATCH", `Expected 4 files, observed ${files.length}.`);
  if (!Number.isInteger(Number(manifest.expectedRecordCount)) || Number(manifest.expectedRecordCount) < 1) fail("AI_RUNTIME_MANIFEST_RECORD_COUNT_MISMATCH", "Expected record count must be a positive integer.");
  if (!Number.isInteger(Number(manifest.segmentByteLimit)) || Number(manifest.segmentByteLimit) < 1) fail("AI_RUNTIME_MANIFEST_SEGMENT_MISMATCH", "Segment byte limit is invalid.");
  let totalSegments = 0;
  let totalBytes = 0;
  for (const file of files) {
    if (!file.fileId || !file.role || !file.fileName || !Number.isInteger(file.expectedBytes) || file.expectedBytes < 1 || !/^[a-f0-9]{64}$/i.test(file.expectedSha256)) fail("AI_RUNTIME_MANIFEST_FILE_HASH_MISMATCH", `Invalid file metadata for ${file.fileId || "unknown"}.`);
    if (file.segmentCount !== file.segments.length || file.segmentCount < 1) fail("AI_RUNTIME_MANIFEST_SEGMENT_MISMATCH", `Segment count mismatch for ${file.fileId}.`);
    let cursor = 0;
    for (const [segmentPosition, segment] of file.segments.entries()) {
      if (segment.segmentIndex !== segmentPosition || segment.startByte !== cursor || segment.endByteExclusive - segment.startByte !== segment.expectedBytes || !/^[a-f0-9]{64}$/i.test(segment.sha256)) fail("AI_RUNTIME_MANIFEST_SEGMENT_MISMATCH", `Invalid segment metadata for ${file.fileId}:${segment.segmentIndex}.`);
      cursor = segment.endByteExclusive;
      totalSegments += 1;
    }
    if (cursor !== file.expectedBytes) fail("AI_RUNTIME_MANIFEST_FILE_BYTES_MISMATCH", `File byte coverage mismatch for ${file.fileId}.`);
    totalBytes += file.expectedBytes;
  }
  if (typeof manifest.deliveryHandle !== "string" || manifest.deliveryHandle.length < 32) fail("AI_MODEL_DELIVERY_HANDLE_INVALID", "Manifest delivery handle is missing or invalid.");
  return { manifest: manifest as ModelInputManifestV0335, fileCount: files.length, recordCount: Number(manifest.expectedRecordCount), segmentCount: totalSegments, totalBytes };
}

export function serializeAndValidateManifestResponseV0335(value: unknown, runtimeContract: RuntimeContractV0335 = RUNTIME_CONTRACT_V0335) {
  const before = validateModelInputManifestV3(value, runtimeContract);
  const text = JSON.stringify(value);
  let decoded: unknown;
  try { decoded = JSON.parse(text); } catch { fail("AI_RUNTIME_MANIFEST_SERIALIZATION_MISMATCH", "Serialized Manifest response cannot be decoded."); }
  const after = validateModelInputManifestV3(decoded, runtimeContract);
  if (sha256(JSON.stringify(before.manifest)) !== sha256(JSON.stringify(after.manifest))) fail("AI_RUNTIME_MANIFEST_SERIALIZATION_MISMATCH", "Manifest changed during serialization.");
  return { contentItems: [{ type: "inputText", text }], success: true as const, decoded: after.manifest };
}

export function createRuntimeManifestReceiptV0335(value: unknown, providerDispatchAllowed: boolean, runtimeContract: RuntimeContractV0335 = RUNTIME_CONTRACT_V0335): RuntimeManifestReceiptV0335 {
  const source = object(value);
  const preHash = sha256(JSON.stringify(value));
  try {
    const response = serializeAndValidateManifestResponseV0335(value, runtimeContract);
    return { schemaVersion: runtimeContract.manifestReceiptVersion, registryHash: runtimeContract.registryHash, factoryVersion: runtimeContract.manifestFactoryVersion, expectedSchema: runtimeContract.modelInputManifestSchema, observedSchema: String(source.schemaVersion ?? "") || null, expectedProtocol: runtimeContract.providerTransport, observedProtocol: String(source.transportProtocol ?? "") || null, preSerializationHash: preHash, postSerializationHash: sha256(response.contentItems[0].text), selfValidationPassed: true, providerDispatchAllowed, errorCode: null, checkedAtUtc: new Date().toISOString() };
  } catch (error) {
    const code = String((error as { code?: unknown })?.code ?? "AI_RUNTIME_MANIFEST_SERIALIZATION_MISMATCH");
    return { schemaVersion: runtimeContract.manifestReceiptVersion, registryHash: runtimeContract.registryHash, factoryVersion: runtimeContract.manifestFactoryVersion, expectedSchema: runtimeContract.modelInputManifestSchema, observedSchema: String(source.schemaVersion ?? "") || null, expectedProtocol: runtimeContract.providerTransport, observedProtocol: String(source.transportProtocol ?? "") || null, preSerializationHash: preHash, postSerializationHash: sha256(JSON.stringify(JSON.parse(JSON.stringify(value)))), selfValidationPassed: false, providerDispatchAllowed: false, errorCode: code, checkedAtUtc: new Date().toISOString() };
  }
}

export function writeRuntimeManifestReceiptV0335(runDirectory: string, fileName: string, receipt: RuntimeManifestReceiptV0335) {
  const target = path.join(runDirectory, "progress", fileName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  return target;
}
