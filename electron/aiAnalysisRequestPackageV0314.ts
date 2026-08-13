import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AiAnalysisError, type AiPendingDataset, type AiRulesSnapshot, type AiAnalysisRequestPackage, type RequestPackageDocument, type RequestDocumentRole } from "../shared/aiAnalysisContract.js";
import { atomicExport } from "./aiAnalysisCore.js";

export const REQUEST_PACKAGE_VERSION = "ai-analysis-request-package-v1" as const;
export const CORE_INSTRUCTION_NAME = "jira-activity-analysis-core-instruction" as const;
export const CORE_INSTRUCTION_VERSION = "0.3.14-v1" as const;
export const PROVIDER_DELIVERY_MODE = "INLINE_EXACT_CONTENT" as const;
export const CORE_ANALYSIS_INSTRUCTION = [
  `Instruction: ${CORE_INSTRUCTION_NAME}/${CORE_INSTRUCTION_VERSION}`,
  "Use all three rule documents in this Request Package and analyze every Pending Analysis record exactly once.",
  "Do not omit, merge, reorder, re-identify, or invent records. Preserve recordIndex, Stable ID, activity/evidence identity, and source hash exactly.",
  "Use only exact Skill IDs from the supplied Catalog. Never infer an ID from group order, name similarity, or an _001 suffix.",
  "When Catalog detail is missing, do not invent detail and do not discard the candidate. Return CATALOG_DETAIL_MISSING with candidate identity, reason, evidence, and a failed Catalog-detail audit check.",
  "Use NEEDS_REVIEW for an evidence-backed candidate that cannot safely reach MATCHED, EXCLUDED, or CATALOG_DETAIL_MISSING.",
  "Use status-aware negativeChecks: MATCHED may be empty with positive evidence; EXCLUDED and UNKNOWN require record checks; CATALOG_DETAIL_MISSING and NEEDS_REVIEW require an auditable candidate or record check.",
  "Return the same number of records as the input and conform exactly to the supplied Strict Output Schema."
].join("\n");

function sha256(value: Buffer | string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function requestPackageError(message: string): never { throw new AiAnalysisError("AI_REQUEST_PACKAGE_FAILED", message); }
function safeName(value: string) { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 140) || "document"; }
function exactBlock(document: RequestPackageDocument, text: string) { return [`BEGIN_FILE role=${document.role} filename=${JSON.stringify(document.originalFileName)} sha256=${document.snapshotSha256} bytes=${document.snapshotByteLength} source=${document.sourceKind} complete=true`, text, `END_FILE role=${document.role}`].join("\n"); }
type Source = { role: RequestDocumentRole; fileName: string; absolutePath: string | null; targetName: string; mimeType: string; sourceKind: "USER_FILE" | "APP_GENERATED"; bytes: Buffer };

export function buildRequestPackage(input: { runId: string; runDirectory: string; dataset: AiPendingDataset; rules: AiRulesSnapshot; supplementalInstruction?: string; selectedRecordCount: number; outputSchemaCanonicalJson: string }) {
  if (!input.dataset.sourceFilePath) requestPackageError("REQUEST_PACKAGE_PENDING_SOURCE_UNAVAILABLE");
  const rule = (kind: "manifest" | "catalog" | "rules") => { const file = input.rules.files.find((item) => item.kind === kind); if (!file?.fullPath) requestPackageError(`REQUEST_PACKAGE_${kind.toUpperCase()}_SOURCE_UNAVAILABLE`); return file; };
  const manifest = rule("manifest"); const catalog = rule("catalog"); const common = rule("rules");
  const pendingBytes = fs.readFileSync(input.dataset.sourceFilePath);
  const pendingSourceSha256 = sha256(pendingBytes);
  if (pendingSourceSha256 !== input.dataset.sourceFileSha256) requestPackageError("REQUEST_PACKAGE_PENDING_SOURCE_HASH_MISMATCH");
  const pendingDocument = JSON.parse(pendingBytes.toString("utf8")) as { records?: Array<{ reference?: { sourceRecordStableId?: string; evidenceId?: string } }> };
  const pendingRecords = Array.isArray(pendingDocument.records) ? pendingDocument.records : [];
  const stableIds = pendingRecords.map((record) => record.reference?.sourceRecordStableId || record.reference?.evidenceId || "");
  if (pendingRecords.length !== input.dataset.eventCount || input.selectedRecordCount !== pendingRecords.length) requestPackageError("REQUEST_PACKAGE_RECORD_COUNT_MISMATCH");
  if (stableIds.some((id) => !id) || new Set(stableIds).size !== stableIds.length) requestPackageError("REQUEST_PACKAGE_STABLE_ID_SET_INVALID");
  const datasetStableIds = input.dataset.diffs.map((record) => record.sourceDiffId);
  if (datasetStableIds.length !== stableIds.length || stableIds.some((id) => !datasetStableIds.includes(id))) requestPackageError("REQUEST_PACKAGE_STABLE_ID_SET_MISMATCH");
  const inputStableIdSetSha256 = sha256([...stableIds].sort().join("\n"));
  const supplemental = input.supplementalInstruction?.trim() ?? "";
  const instruction = `${CORE_ANALYSIS_INSTRUCTION}\n\n[SUPPLEMENTAL_INSTRUCTION]\n${supplemental || "None"}\n[/SUPPLEMENTAL_INSTRUCTION]\n`;
  const sources: Source[] = [
    { role: "PENDING_ANALYSIS_JSON", fileName: path.basename(input.dataset.sourceFilePath), absolutePath: input.dataset.sourceFilePath, targetName: "pending-analysis.json", mimeType: "application/json", sourceKind: "USER_FILE", bytes: pendingBytes },
    { role: "COMMON_RULES", fileName: common.fileName, absolutePath: common.fullPath ?? null, targetName: "common-rules.md", mimeType: "text/markdown", sourceKind: "USER_FILE", bytes: fs.readFileSync(common.fullPath!) },
    { role: "SKILL_CATALOG", fileName: catalog.fileName, absolutePath: catalog.fullPath ?? null, targetName: "skill-catalog.md", mimeType: "text/markdown", sourceKind: "USER_FILE", bytes: fs.readFileSync(catalog.fullPath!) },
    { role: "RULE_SET_MANIFEST_OR_SCORING_RULES", fileName: manifest.fileName, absolutePath: manifest.fullPath ?? null, targetName: "rule-set-manifest-or-scoring-rules.md", mimeType: "text/markdown", sourceKind: "USER_FILE", bytes: fs.readFileSync(manifest.fullPath!) },
    { role: "ANALYSIS_INSTRUCTION", fileName: `${CORE_INSTRUCTION_NAME}-${CORE_INSTRUCTION_VERSION}.md`, absolutePath: null, targetName: "analysis-instruction.md", mimeType: "text/markdown", sourceKind: "APP_GENERATED", bytes: Buffer.from(instruction, "utf8") },
    { role: "OUTPUT_SCHEMA", fileName: "jira-activity-analysis-output-schema.json", absolutePath: null, targetName: "output-schema.json", mimeType: "application/schema+json", sourceKind: "APP_GENERATED", bytes: Buffer.from(input.outputSchemaCanonicalJson, "utf8") }
  ];
  const folder = path.join(input.runDirectory, "request-package"); fs.mkdirSync(folder, { recursive: false });
  const documents: RequestPackageDocument[] = sources.map((source) => {
    const originalHash = sha256(source.bytes); const destination = path.join(folder, safeName(source.targetName)); fs.writeFileSync(destination, source.bytes, { flag: "wx" }); const snapshot = fs.readFileSync(destination); const snapshotHash = sha256(snapshot);
    if (!snapshot.equals(source.bytes) || originalHash !== snapshotHash) requestPackageError(`REQUEST_PACKAGE_SNAPSHOT_MISMATCH:${source.role}`);
    return { role: source.role, originalFileName: source.fileName, originalAbsolutePath: source.absolutePath, snapshotRelativePath: path.relative(input.runDirectory, destination).replace(/\\/g, "/"), mimeType: source.mimeType, encoding: "utf-8", originalByteLength: source.bytes.length, snapshotByteLength: snapshot.length, originalSha256: originalHash, snapshotSha256: snapshotHash, byteIdentical: true, sourceKind: source.sourceKind, modelVisible: source.role !== "OUTPUT_SCHEMA", complete: true, truncated: false, transformationName: null };
  });
  const visibleSources = sources.filter((source) => source.role !== "OUTPUT_SCHEMA"); const visibleDocuments = documents.filter((document) => document.modelVisible);
  const prompt = visibleSources.map((source, index) => exactBlock(visibleDocuments[index], source.bytes.toString("utf8"))).join("\n\n"); const created = new Date();
  const requestPackage: AiAnalysisRequestPackage = { requestPackageVersion: REQUEST_PACKAGE_VERSION, runId: input.runId, createdAtLocal: created.toLocaleString("sv-SE", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), createdAtUtc: created.toISOString(), localTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, deliveryMode: PROVIDER_DELIVERY_MODE, inputRecordCount: pendingRecords.length, inputStableIdSetSha256, pendingSourceSha256, documents, coreInstructionName: CORE_INSTRUCTION_NAME, coreInstructionVersion: CORE_INSTRUCTION_VERSION, coreInstructionSha256: sha256(CORE_ANALYSIS_INSTRUCTION), supplementalInstructionSha256: supplemental ? sha256(supplemental) : null, outputSchemaSha256: documents.find((item) => item.role === "OUTPUT_SCHEMA")!.snapshotSha256, finalProviderPayloadSha256: sha256(prompt), finalProviderPayloadBytes: Buffer.byteLength(prompt), inlineBlockCount: visibleDocuments.length, nativeFileCount: 0 };
  atomicExport(path.join(folder, "request-package-manifest.json"), JSON.stringify(requestPackage, null, 2));
  atomicExport(path.join(folder, "final-provider-request-sanitized.json"), JSON.stringify({ deliveryMode: PROVIDER_DELIVERY_MODE, documents: documents.map(({ originalAbsolutePath: _path, ...document }) => document), authorization: "[masked]" }, null, 2));
  atomicExport(path.join(folder, "final-provider-payload.sha256"), `${requestPackage.finalProviderPayloadSha256}\n`);
  return { requestPackage, prompt, folder };
}

export function loadRequestPackage(runDirectory: string) {
  const folder = path.join(runDirectory, "request-package");
  const requestPackage = JSON.parse(fs.readFileSync(path.join(folder, "request-package-manifest.json"), "utf8")) as AiAnalysisRequestPackage;
  const visibleDocuments = requestPackage.documents.filter((document) => document.modelVisible);
  const prompt = visibleDocuments.map((document) => {
    const bytes = fs.readFileSync(path.join(runDirectory, document.snapshotRelativePath));
    if (bytes.length !== document.snapshotByteLength || sha256(bytes) !== document.snapshotSha256 || document.truncated || !document.complete) requestPackageError(`REQUEST_PACKAGE_REOPEN_MISMATCH:${document.role}`);
    return exactBlock(document, bytes.toString("utf8"));
  }).join("\n\n");
  if (Buffer.byteLength(prompt) !== requestPackage.finalProviderPayloadBytes || sha256(prompt) !== requestPackage.finalProviderPayloadSha256) requestPackageError("REQUEST_PACKAGE_PAYLOAD_HASH_MISMATCH");
  return { requestPackage, prompt, folder };
}