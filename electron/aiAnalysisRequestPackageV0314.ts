import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AiAnalysisError, type AiPendingDataset, type AiRulesSnapshot, type AiAnalysisRequestPackage, type RequestPackageDocument, type RequestDocumentRole, type AiAnalysisErrorCode } from "../shared/aiAnalysisContract.js";
import { atomicExport } from "./aiAnalysisCore.js";
import { composeEffectiveInstruction, DEFAULT_ANALYSIS_INSTRUCTION, SYSTEM_SAFETY_WRAPPER } from "./aiAnalysisInstructionV0319.js";
import type { AiInstructionMode } from "../shared/analysisInstructionContract.js";

export const REQUEST_PACKAGE_VERSION = "ai-analysis-request-package-v4" as const;
export const CORE_INSTRUCTION_NAME = "jira-activity-analysis-local-workspace-instruction" as const;
export const CORE_INSTRUCTION_VERSION = "0.3.19-zh-TW-v2" as const;
export const PROVIDER_DELIVERY_MODE = "LOCAL_FILE_WORKSPACE" as const;

function sha256(value: Buffer | string) { return crypto.createHash("sha256").update(value).digest("hex"); }
function requestPackageError(message: string): never {
  const code = message.split(":")[0] as AiAnalysisErrorCode;
  const supported = new Set<AiAnalysisErrorCode>(["AI_REQUIRED_INPUT_FILE_MISSING", "AI_INPUT_FILE_HASH_MISMATCH", "AI_INPUT_PACKAGE_INVALID"]);
  throw new AiAnalysisError(supported.has(code) ? code : "AI_REQUEST_PACKAGE_FAILED", message);
}
type Source = { role: RequestDocumentRole; fileName: string; absolutePath: string; targetName: string; mimeType: string; bytes: Buffer };

export function buildCoreAnalysisInstruction(recordCount: number, supplementalInstruction?: string, runId = "analysis_run", sourceSha256 = "SOURCE_SHA256", rulesSnapshotId = "RULES_SNAPSHOT_ID") {
  return composeEffectiveInstruction({ mode: supplementalInstruction?.trim() ? "STANDARD_PLUS_USER_INSTRUCTION" : "STANDARD_FORMAL", runId, recordCount, sourceSha256, rulesSnapshotId, userAdditionalInstruction: supplementalInstruction }).effectiveInstruction;
}

function validateSourceFile(filePath: string, role: RequestDocumentRole) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) requestPackageError(`AI_INPUT_PACKAGE_INVALID:${role}:not_regular_file`);
  return { resolved: fs.realpathSync.native(resolved), bytes: fs.readFileSync(resolved) };
}

export function buildRequestPackage(input: { runId: string; runDirectory: string; dataset: AiPendingDataset; rules: AiRulesSnapshot; supplementalInstruction?: string; instructionMode?: AiInstructionMode; userAdditionalInstruction?: string; userCustomInstruction?: string; selectedRecordCount: number; outputSchemaCanonicalJson: string }) {
  if (!input.dataset.sourceFilePath) requestPackageError("AI_REQUIRED_INPUT_FILE_MISSING:PENDING_ANALYSIS_JSON");
  const rule = (kind: "manifest" | "catalog" | "rules") => { const file = input.rules.files.find((item) => item.kind === kind); if (!file?.fullPath) requestPackageError(`AI_REQUIRED_INPUT_FILE_MISSING:${kind.toUpperCase()}`); return file; };
  const manifest = rule("manifest"); const catalog = rule("catalog"); const common = rule("rules");
  const pending = validateSourceFile(input.dataset.sourceFilePath, "PENDING_ANALYSIS_JSON");
  const pendingSourceSha256 = sha256(pending.bytes);
  if (pendingSourceSha256 !== input.dataset.sourceFileSha256) requestPackageError("AI_INPUT_FILE_HASH_MISMATCH:PENDING_ANALYSIS_JSON");
  let pendingDocument: { records?: Array<{ reference?: { sourceRecordStableId?: string; evidenceId?: string } }> };
  try { pendingDocument = JSON.parse(pending.bytes.toString("utf8")); } catch { requestPackageError("AI_INPUT_PACKAGE_INVALID:PENDING_ANALYSIS_JSON"); }
  const pendingRecords = Array.isArray(pendingDocument.records) ? pendingDocument.records : [];
  const stableIds = pendingRecords.map((record) => record.reference?.sourceRecordStableId || record.reference?.evidenceId || "");
  if (pendingRecords.length !== input.dataset.eventCount || input.selectedRecordCount !== pendingRecords.length) requestPackageError("AI_INPUT_PACKAGE_INVALID:RECORD_COUNT_MISMATCH");
  if (stableIds.some((id) => !id) || new Set(stableIds).size !== stableIds.length) requestPackageError("AI_INPUT_PACKAGE_INVALID:STABLE_ID_SET");
  const datasetStableIds = input.dataset.diffs.map((record) => record.sourceDiffId);
  if (datasetStableIds.length !== stableIds.length || stableIds.some((id) => !datasetStableIds.includes(id))) requestPackageError("AI_INPUT_PACKAGE_INVALID:STABLE_ID_MISMATCH");
  const inputStableIdSetSha256 = sha256([...stableIds].sort().join("\n"));
  const commonSource = validateSourceFile(common.fullPath!, "COMMON_RULES");
  const catalogSource = validateSourceFile(catalog.fullPath!, "SKILL_CATALOG");
  const manifestSource = validateSourceFile(manifest.fullPath!, "RULE_SET_MANIFEST_OR_SCORING_RULES");
  const sources: Source[] = [
    { role: "PENDING_ANALYSIS_JSON", fileName: path.basename(pending.resolved), absolutePath: pending.resolved, targetName: "pending-analysis.json", mimeType: "application/json", bytes: pending.bytes },
    { role: "COMMON_RULES", fileName: common.fileName, absolutePath: commonSource.resolved, targetName: "common-rules.md", mimeType: "text/markdown", bytes: commonSource.bytes },
    { role: "SKILL_CATALOG", fileName: catalog.fileName, absolutePath: catalogSource.resolved, targetName: "skill-catalog.md", mimeType: "text/markdown", bytes: catalogSource.bytes },
    { role: "RULE_SET_MANIFEST_OR_SCORING_RULES", fileName: manifest.fileName, absolutePath: manifestSource.resolved, targetName: "rule-set-manifest.md", mimeType: "text/markdown", bytes: manifestSource.bytes }
  ];
  const workspace = path.join(input.runDirectory, "input-workspace");
  const control = path.join(input.runDirectory, "control");
  fs.mkdirSync(workspace, { recursive: false }); fs.mkdirSync(control, { recursive: false });
  const documents: RequestPackageDocument[] = sources.map((source) => {
    const originalHash = sha256(source.bytes); const destination = path.join(workspace, source.targetName);
    fs.writeFileSync(destination, source.bytes, { flag: "wx" }); const snapshot = fs.readFileSync(destination); const snapshotHash = sha256(snapshot);
    if (!snapshot.equals(source.bytes) || originalHash !== snapshotHash) requestPackageError(`AI_INPUT_FILE_HASH_MISMATCH:${source.role}`);
    return { role: source.role, originalFileName: source.fileName, originalAbsolutePath: source.absolutePath, snapshotRelativePath: path.relative(input.runDirectory, destination).replace(/\\/g, "/"), mimeType: source.mimeType, encoding: "utf-8", originalByteLength: source.bytes.length, snapshotByteLength: snapshot.length, originalSha256: originalHash, snapshotSha256: snapshotHash, byteIdentical: true, sourceKind: "USER_FILE", modelVisible: true, complete: true, truncated: false, transformationName: null };
  });
  const output = path.join(input.runDirectory, "ai-output");
  fs.mkdirSync(output, { recursive: false });
  for (const document of documents) try { fs.chmodSync(path.join(input.runDirectory, document.snapshotRelativePath), 0o444); } catch { /* Hash verification remains authoritative on Windows. */ }
  const instructionMode = input.instructionMode ?? "STANDARD_FORMAL";
  const additional = (input.userAdditionalInstruction ?? input.supplementalInstruction ?? "").trim();
  const custom = (input.userCustomInstruction ?? "").trim();
  const composition = composeEffectiveInstruction({ mode: instructionMode, runId: input.runId, recordCount: pendingRecords.length, sourceSha256: pendingSourceSha256, rulesSnapshotId: input.rules.snapshotId ?? input.rules.ruleSetId, userAdditionalInstruction: additional, userCustomInstruction: custom });
  const prompt = composition.effectiveInstruction;
  const created = new Date(); const supplemental = instructionMode === "STANDARD_PLUS_USER_INSTRUCTION" ? additional : instructionMode === "CUSTOM_DIAGNOSTIC" ? custom : "";
  atomicExport(path.join(control, "analysis-instruction.md"), prompt);
  atomicExport(path.join(control, "instruction-mode.json"), JSON.stringify({ schemaVersion: "jaa-instruction-mode-v1", mode: instructionMode, formalArtifactEligible: composition.formalArtifactEligible, sqliteEligible: composition.sqliteEligible }, null, 2));
  atomicExport(path.join(control, "system-safety-wrapper.md"), SYSTEM_SAFETY_WRAPPER + "\n");
  atomicExport(path.join(control, "default-analysis-instruction.md"), instructionMode === "CUSTOM_DIAGNOSTIC" ? "applicable: false\n" : DEFAULT_ANALYSIS_INSTRUCTION + "\n");
  atomicExport(path.join(control, "user-additional-instruction.md"), instructionMode === "STANDARD_PLUS_USER_INSTRUCTION" ? additional + "\n" : "applicable: false\n");
  atomicExport(path.join(control, "user-custom-instruction.md"), instructionMode === "CUSTOM_DIAGNOSTIC" ? custom + "\n" : "applicable: false\n");
  atomicExport(path.join(control, "final-effective-instruction.md"), prompt);
  atomicExport(path.join(control, "final-effective-instruction.sha256"), composition.effectiveInstructionSha256 + "\n");
  atomicExport(path.join(control, "instruction-composition-manifest.json"), JSON.stringify(composition, null, 2));
  atomicExport(path.join(control, "input-transport-contract.json"), JSON.stringify({ schemaVersion: "jaa-input-transport-contract-v2", protocol: "bridge-resumable-v2", sourceReceipt: "progress/source-input-receipt.json", modelDeliveryReceipt: "progress/model-delivery-receipt.json", segmentByteLimit: 4096, maxSegmentAttempts: 3, utf8BoundarySafe: true, resumeMissingOnly: true }, null, 2));
  atomicExport(path.join(control, "output-schema.json"), input.outputSchemaCanonicalJson);
  atomicExport(path.join(control, "bridge-contract.json"), JSON.stringify({ schemaVersion: "jaa-analysis-bridge-contract-v1", version: "0.3.19-bridge-v2", transport: "codex_dynamic_tools_stdio", modelInputTransport: "bridge-resumable-v2", localOnly: true, tools: ["jaa_get_input_manifest", "jaa_read_input_segment", "jaa_ack_input_segment", "jaa_get_delivery_status", "jaa_finalize_input_delivery", "jaa_report_analysis_progress", "jaa_publish_analysis_artifacts"], arbitraryPath: false, arbitraryCommand: false, externalFallback: false }, null, 2));
  const requestPackage: AiAnalysisRequestPackage = {
    requestPackageVersion: REQUEST_PACKAGE_VERSION, instructionMode, instructionComposition: composition, modelInputTransport: "bridge-resumable-v2", promptLocale: "zh-TW", responseLocale: "zh-TW", promptTemplateVersion: CORE_INSTRUCTION_VERSION, runId: input.runId, createdAtLocal: created.toLocaleString("sv-SE", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), createdAtUtc: created.toISOString(), localTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deliveryMode: PROVIDER_DELIVERY_MODE, inputRecordCount: pendingRecords.length, inputStableIdSetSha256, pendingSourceSha256, documents,
    coreInstructionName: CORE_INSTRUCTION_NAME, coreInstructionVersion: CORE_INSTRUCTION_VERSION, coreInstructionSha256: sha256(prompt), supplementalInstructionSha256: supplemental ? sha256(supplemental) : null, outputSchemaSha256: sha256(input.outputSchemaCanonicalJson),
    finalProviderPayloadSha256: sha256(prompt), finalProviderPayloadBytes: Buffer.byteLength(prompt), inlineBlockCount: 0, nativeFileCount: 0, workspaceFileCount: 4, inlineFileContentCount: 0, nativeInputFileCount: 0
  };
  atomicExport(path.join(control, "request-package-manifest.json"), JSON.stringify(requestPackage, null, 2));
  atomicExport(path.join(control, "final-provider-request-sanitized.json"), JSON.stringify({ deliveryMode: PROVIDER_DELIVERY_MODE, cwd: ".", inputWorkspace: "input-workspace", outputWorkspace: "ai-output", workspaceFileCount: 4, inlineFileContentCount: 0, nativeInputFileCount: 0, instructionSha256: requestPackage.finalProviderPayloadSha256, outputSchemaSha256: requestPackage.outputSchemaSha256, promptLocale: "zh-TW", responseLocale: "zh-TW", promptTemplateVersion: CORE_INSTRUCTION_VERSION, authorization: "[masked]" }, null, 2));
  return { requestPackage, prompt, folder: control, workspace, output };
}

export function loadRequestPackage(runDirectory: string) {
  const folder = path.join(runDirectory, "control"); const workspace = path.join(runDirectory, "input-workspace");
  const requestPackage = JSON.parse(fs.readFileSync(path.join(folder, "request-package-manifest.json"), "utf8")) as AiAnalysisRequestPackage;
  if (requestPackage.deliveryMode !== PROVIDER_DELIVERY_MODE || requestPackage.documents.length !== 4 || requestPackage.inlineBlockCount !== 0) requestPackageError("AI_INPUT_PACKAGE_INVALID:MANIFEST");
  for (const document of requestPackage.documents) { const bytes = fs.readFileSync(path.join(runDirectory, document.snapshotRelativePath)); if (bytes.length !== document.snapshotByteLength || sha256(bytes) !== document.snapshotSha256 || document.truncated || !document.complete || !document.byteIdentical) requestPackageError(`AI_INPUT_FILE_HASH_MISMATCH:${document.role}`); }
  const prompt = fs.readFileSync(path.join(folder, "analysis-instruction.md"), "utf8");
  if (Buffer.byteLength(prompt) !== requestPackage.finalProviderPayloadBytes || sha256(prompt) !== requestPackage.finalProviderPayloadSha256) requestPackageError("AI_INPUT_PACKAGE_INVALID:INSTRUCTION_HASH");
  const output = path.join(runDirectory, "ai-output");
  if (!fs.existsSync(output)) requestPackageError("AI_INPUT_PACKAGE_INVALID:OUTPUT_WORKSPACE_MISSING");
  return { requestPackage, prompt, folder, workspace, output };
}
