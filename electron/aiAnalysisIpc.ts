import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import {
  AI_ANALYSIS_IPC_VERSION,
  AI_ANALYZED_FILE_SCHEMA_VERSION,
  AI_ANALYZED_LEGACY_FILE_SCHEMA_VERSIONS,
  AiAnalysisError,
  emptyTokenUsage,
  type AiAnalysisRun,
  type AiAnalysisErrorCode,
  type AiAnalysisSnapshot,
  type AiAnalyzerMode,
  type AiDiagnosticRun,
  type AiDiagnosticStep,
  type AiExportFormat,
  type AiPendingDataset,
  type AiRulesSnapshot,
  type AiServiceKey,
  type AiSettingsUpdate
} from "../shared/aiAnalysisContract.js";
import type { AiInstructionMode } from "../shared/analysisInstructionContract.js";
import {
  analyzedDocument,
  atomicExport,
  callAiNexus,
  classifyOffline,
  initializeAiDatabase,
  loadAiEnvironment,
  loadPendingDataset,
  loadRulesSnapshot,
  loadV0322RulesSnapshot,
  persistCompletedRun,
  persistReview,
  saveAiSettings,
  sha256Text
} from "./aiAnalysisCore.js";
import { ensureDir, getAppDataDir, getAppRuntimeDir, getBundledAnalysisRulesDir, getExportsDir } from "./appPaths.js";
import { RuleSelectionTransactionServiceV0333, normalizeRuleSelectionErrorV0333 } from "./aiAnalysisRulesV0333.js";
import { ActiveResultRegistryV0325, AnalysisAttemptStoreV0325, navigationDecisionV0325 } from "./aiAnalysisResultStateV0325.js";
import { buildEvidenceSegmentCatalogV0324, EVIDENCE_SEGMENTER_VERSION, type EvidenceSegmentCatalogV0324 } from "./aiAnalysisEvidenceSegmenterV0324.js";
import { buildEvidenceQuoteCatalog, quoteCatalogJsonl } from "./evidenceQuoteCatalogV0326.js";
import { buildModelVisibleEvidenceQuoteMapV0329, projectModelPayloadV0329, validateModelVisibleQuoteCoverageV0329 } from "./modelVisibleEvidenceQuoteMapV0329.js";
import { evaluateSystemicNoResultGateV0329 } from "./systemicNoResultGateV0329.js";
import { parseAndValidateDecisionsV0324, type ValidationFindingV0324 } from "./aiAnalysisDecisionContractV0324.js";
import { evaluateDecisionQualityV0333 } from "./aiAnalysisQualityV0333.js";
import { assembleCanonicalResultsV0324 } from "./aiAnalysisArtifactsV0324.js";
import { buildIssueSnapshotProfilesV0324, buildReportDataPackageV0324, durableJsonWriteV0324 } from "./aiAnalysisReportDataPackageV0324.js";
import { renderReportDataPackageHtmlV0333, HTML_RENDERER_VERSION_V0333 } from "./aiAnalysisHtmlRendererV0333.js";
import { getChatGptService } from "./chatGptService.js";
import { preflightAnalysisBridgeV0331 } from "./analysisBridgeLoaderV0319.js";
import { ProviderDispatchLedgerV0330 } from "./providerDispatchLedgerV0330.js";
import { firstFailedValidationStageV0331 } from "./analysisLifecycleV0331.js";
import { convergeTerminalLifecycleV0333, persistTerminalLifecycleV0333 } from "./analysisLifecycleV0333.js";
import { loadPersistedSubmissionV0332, writeArtifactSubmissionResultV0332, type ValidationStageV0332 } from "./analysisValidationTruthV0332.js";
import { writeValidationStageReceiptsV0333 } from "./analysisValidationTruthV0333.js";
import { RUNTIME_CONTRACT_V0333, validateDispatchIdentityV0333 } from "./runtimeContractRegistryV0333.js";
import { redactChatGptText, redactChatGptTextComplete, sanitizeChatGptValueComplete } from "./chatGptRedactor.js";
import { normalizeJaaError } from "./jaaErrorNormalizerV0327.js";
import { buildRequestPackage, loadRequestPackage } from "./aiAnalysisRequestPackageV0324.js";
import { AiAnalysisRunArchive, deleteRunArchive, loadArchivedRuns, readConversationPage, updateArchivedLifecycle } from "./aiAnalysisRunArchiveV0314.js";
import { validateCanonicalResponseSemantics } from "./aiAnalysisResponseContractV0314.js";
import { freezeBoundHtmlTemplate, HTML_RENDERER_VERSION, renderCanonicalHtml } from "./aiAnalysisHtmlRendererV0322.js";
import { persistCompletedRunV0322, type DatabaseCommitFailure } from "./aiAnalysisSqliteV0322.js";
import { EVIDENCE_NORMALIZER_VERSION, normalizeEvidenceSet } from "./aiAnalysisEvidenceNormalizerV0322.js";
import { buildRunIssueSnapshots, calculateIssueStatistics, loadRunIssueSnapshotsFromSqlite } from "./aiAnalysisIssueSnapshotV0322.js";
import { evaluateDecisionQuality } from "./aiAnalysisQualityV0322.js";
import {
  adaptLegacyAnalyzedRun,
  buildCompactPayload,
  buildDistributionDiagnostics,
  buildSingleRunPrompt,
  goldenHtmlForRun,
  parseSingleRunResponse,
  SINGLE_RUN_PROMPT_VERSION,
  stageVisibleProviderResponse,
  validateGoldenHtml
} from "./aiAnalysisSingleRunV0311.js";
import {
  PROVIDER_HARD_TIMEOUT_MS,
  PROVIDER_PERFORMANCE_WARNING_MS,
  assembleCanonicalResults,
  atomicWriteCanonical,
  buildCompletionManifest,
  compareAnalysisReportCounts,
  createArtifactWorkspaces,
  parseAndValidateDecisions,
  readPublishedArtifacts,
  stableJson,
  verifyInputWorkspaceUnchanged,
  warningPersistenceGate
} from "./aiAnalysisArtifactsV0322.js";
import {
  AnalysisDispatchGuard,
  AnalysisErrorDeduplicator,
  buildCapacityCalculationSnapshot,
  capacitySnapshotHash,
  capacityWarning,
  evaluateFormalPersistenceGate
} from "./aiAnalysisV0312.js";

declare const __MAIN_APP_VERSION__: string;
declare const __MAIN_BUILD_TIME__: string;
declare const __MAIN_GIT_COMMIT__: string;
type Environment = ReturnType<typeof loadAiEnvironment>;
const handlers = [
  "ai-analysis:snapshot", "ai-analysis:reload-env", "ai-analysis:save-settings", "ai-analysis:test-connection",
  "ai-analysis:diagnose", "ai-analysis:cancel-diagnostic", "ai-analysis:chat", "ai-analysis:choose-rules", "ai-analysis:choose-rule-role", "ai-analysis:cancel-rule-draft", "ai-analysis:use-bundled-rules", "ai-analysis:load-rules",
  "ai-analysis:choose-pending", "ai-analysis:verify-pending", "ai-analysis:select-pending", "ai-analysis:choose-analyzed", "ai-analysis:select-run", "ai-analysis:activate-result", "ai-analysis:start", "ai-analysis:accept-warnings", "ai-analysis:cancel-capacity-warning", "ai-analysis:cancel", "ai-analysis:review",
  "ai-analysis:export", "ai-analysis:open-folder", "ai-analysis:open-html", "ai-analysis:rerender-html", "ai-analysis:render-external-package", "ai-analysis:retry-database", "ai-analysis:conversation", "ai-analysis:delete-run", "ai-analysis:chatgpt-start", "ai-analysis:chatgpt-login",
  "ai-analysis:chatgpt-cancel-login", "ai-analysis:chatgpt-logout", "ai-analysis:chatgpt-refresh", "ai-analysis:chatgpt-select-model", "ai-analysis:cancel-chat"
];

function now() { return new Date().toISOString(); }
function asAnalysisError(error: unknown) {
  if (error instanceof AiAnalysisError) return error;
  const normalized = normalizeJaaError(error, { stage: "IPC", source: "aiAnalysisIpc", fallbackCode: "AI_RESPONSE_INVALID" });
  return new AiAnalysisError(normalized.errorCode as AiAnalysisErrorCode, normalized.messageZhTw);
}
function errorPayload(error: unknown) {
  const normalized = normalizeJaaError(error, { stage: "IPC", source: "aiAnalysisIpc", fallbackCode: "AI_RESPONSE_INVALID" });
  return { ok: false, errorCode: normalized.errorCode, message: normalized.messageZhTw, normalizedError: normalized };
}
function publicEnv(environment: Environment) {
  const { values: _values, ...summary } = environment;
  return summary;
}

function resolveConfiguredPath(value: string | undefined, fallback: string) {
  if (!value?.trim()) return fallback;
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(getAppRuntimeDir(), value);
}

function safeAnalyzedFileName(sourceFileName: string, runId: string) {
  const stem = sourceFileName.replace(/^分析-/u, "").replace(/^pending-analysis[-_]?/i, "").replace(/\.json$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 110) || "activity-events";
  return `分析-${stem}-${runId.slice(-8)}.json`;
}

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, "\"\"")}"`; }
function csvForRun(run: AiAnalysisRun) {
  const header = ["run_id", "source_diff_id", "status", "skill_id", "skill_name", "score", "confidence", "reason"];
  const rows = run.results.flatMap((result) => result.candidates.length
    ? result.candidates.map((candidate) => [run.runId, result.sourceDiffId, result.status, candidate.skillId, candidate.skillName, candidate.score, candidate.confidence, candidate.reason])
    : [[run.runId, result.sourceDiffId, result.status, "", "", "", "", ""]]);
  return "\ufeff" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function renderExistingCanonical(run: AiAnalysisRun, templatePath?: string) {
  if (!run.runDirectory || !run.reportDataPackagePath || !(templatePath ?? run.htmlTemplateSnapshotPath)) throw new AiAnalysisError("AI_HTML_RENDER_FAILED", "Report Data Package and verified HTML Template are required. Canonical JSON is not a renderer input in v0.3.24.");
  run.htmlRenderStatus = "rendering"; getChatGptService().setBridgeHtmlRenderStatus(run.runId, "rendering"); if (run.lifecycle) run.lifecycle.htmlRenderStatus = "rendering";
  try {
    const result = renderReportDataPackageHtmlV0333({ reportDataPackagePath: run.reportDataPackagePath, templatePath: templatePath ?? run.htmlTemplateSnapshotPath!, outputDirectory: path.join(run.runDirectory, "canonical-output"), renderTrigger: "MANUAL_RESULTS_REGENERATE" });
    run.reportFilePath = result.receipt.outputHtmlPath; run.reportFileSizeBytes = result.receipt.outputHtmlSizeBytes; run.reportFileSha256 = result.receipt.outputHtmlSha256; run.htmlRenderReceiptPath = result.receiptPath; run.htmlRenderDiagnosticsPath = null; run.htmlRendererVersion = HTML_RENDERER_VERSION_V0333; run.htmlRenderStatus = "completed"; getChatGptService().setBridgeHtmlRenderStatus(run.runId, "completed"); if (run.lifecycle) run.lifecycle.htmlRenderStatus = "completed";
    return result;
  } catch (error) { const failure = error as { failureReceiptPath?: string }; run.htmlRenderStatus = "failed"; run.htmlRenderReceiptPath = failure.failureReceiptPath ?? null; run.htmlRenderDiagnosticsPath = failure.failureReceiptPath ?? (error instanceof Error ? error.message : String(error)); getChatGptService().setBridgeHtmlRenderStatus(run.runId, "failed"); if (run.lifecycle) run.lifecycle.htmlRenderStatus = "failed"; throw error; }
}
function commitExistingCanonical(databasePath: string, dataset: AiPendingDataset, run: AiAnalysisRun) {
  if (!run.runDirectory) throw new AiAnalysisError("AI_SQLITE_BLOCKED", "Run archive is required for database evidence.");
  if (run.reportPackageMode !== "FORMAL_CANONICAL" || !run.reportDataPackagePath || run.diagnosticReportDataPackagePath && !run.analyzedFilePath) throw new AiAnalysisError("AI_SQLITE_BLOCKED", "Only a validated FORMAL_CANONICAL Report Data Package bound to Canonical v5 is SQLite eligible. Diagnostic and external packages are view/render-only.");
  const receiptPath = path.join(run.runDirectory, "progress", "database-commit-receipt.json");
  const failurePath = path.join(run.runDirectory, "progress", "database-commit-failure.json");
  let attemptNumber = 1;
  for (const candidate of [receiptPath, failurePath]) try { attemptNumber = Math.max(attemptNumber, Number(JSON.parse(fs.readFileSync(candidate, "utf8")).attemptNumber ?? 0) + 1); } catch { /* No prior evidence. */ }
  try {
    const warningAcceptance = run.warningAcceptance?.accepted && run.warningAcceptance.acceptedAt && run.analyzedFileSha256 ? { accepted: true, runId: run.runId, acceptedAt: run.warningAcceptance.acceptedAt, canonicalSha256: run.analyzedFileSha256 } : undefined;
    const receipt = persistCompletedRunV0322(databasePath, dataset, run, { attemptNumber, qualityReport: run.qualityGate as any, warningAcceptance });
    atomicExport(receiptPath, JSON.stringify(receipt, null, 2) + "\n");
    run.databasePath = databasePath; run.databaseCommitReceiptPath = receiptPath; run.databaseCommitFailurePath = null; run.databaseWriteStatus = receipt.status === "already_committed" ? "Already committed - " + receipt.committedRecordCount + " validated records" : "Written - " + receipt.committedRecordCount + " validated records"; run.sqliteCommittedRecordCount = receipt.committedRecordCount; getChatGptService().setBridgeSqliteStatus(run.runId, "committed"); if (run.lifecycle) run.lifecycle.sqliteStatus = "committed";
    return { ok: true as const, receipt };
  } catch (error) {
    const failure = (error as { databaseFailure?: DatabaseCommitFailure }).databaseFailure ?? { schemaVersion: "jaa-database-commit-failure-v1", runId: run.runId, attemptNumber, rolledBack: true, errorCode: error instanceof AiAnalysisError ? error.code : "AI_SQLITE_COMMIT_FAILED", message: error instanceof Error ? error.message : String(error) };
    atomicExport(failurePath, JSON.stringify(failure, null, 2) + "\n");
    run.databaseCommitFailurePath = failurePath; run.databaseWriteStatus = "Commit failed - " + failure.errorCode; run.sqliteCommittedRecordCount = 0; getChatGptService().setBridgeSqliteStatus(run.runId, "commit_failed", failure.errorCode); if (run.lifecycle) { run.lifecycle.sqliteStatus = "commit_failed"; run.lifecycle.overallStatus = "completed_with_persistence_error"; run.lifecycle.rootErrorCode = failure.errorCode; }
    return { ok: false as const, failure };
  }
}

function persistRunDebugEvidence(stagingFolder: string, run: AiAnalysisRun, requestSanitized: unknown, responseSanitized: unknown, events: unknown[], actions: string[]) {
  const folder = ensureDir(path.join(stagingFolder, "debug"));
  const writeJson = (name: string, value: unknown) => fs.writeFileSync(path.join(folder, name), JSON.stringify(sanitizeChatGptValueComplete(value), null, 2), "utf8");
  writeJson("run-manifest.json", { run, artifacts: { formalJson: run.analyzedFilePath ? "written" : run.databaseWriteStatus ?? "not_written", goldenHtml: run.reportFilePath ? "written" : run.databaseWriteStatus ?? "not_written", sqlite: run.databaseWriteStatus ?? "not_started" } });
  if (["failed", "failed_validation", "provider_failed", "provider_timeout"].includes(run.status)) writeJson("failed-run-manifest.json", { runId: run.runId, status: run.status, errorCode: run.progress.errorCode, message: run.progress.message });
  if (run.capacitySnapshot) writeJson("capacity-snapshot.json", run.capacitySnapshot);
  const runtimeDiagnostics = { provider: run.provider, model: run.model, runtimeSource: run.runtimeSource ?? "bundled", runtimeIntegrity: run.runtimeIntegrity ?? null, runtimeVersion: run.providerRuntimeVersion ?? null, requestCount: run.progress.requestCount, providerDispatchCount: run.progress.providerDispatchCount ?? run.progress.requestCount, threadStartAttemptCount: run.progress.threadStartAttemptCount ?? 0, threadCreatedCount: run.progress.threadCreatedCount ?? run.progress.threadCount ?? 0, turnStartAttemptCount: run.progress.turnStartAttemptCount ?? 0, acceptedTurnCount: run.progress.acceptedTurnCount ?? run.progress.turnCount ?? 0, turnCompletedCount: run.progress.turnCompletedCount ?? 0, retryCount: run.progress.retryCount, repairTurnCount: run.progress.repairTurnCount ?? 0, fallbackRequestCount: run.progress.fallbackRequestCount ?? 0, outputSchemaSha256: run.outputSchemaSha256 ?? null, hostRuntimeContract: RUNTIME_CONTRACT_V0333 };
  writeJson("provider-diagnostics.json", runtimeDiagnostics);
  writeJson("runtime-diagnostics.json", runtimeDiagnostics);
  const roleManifestPath = path.join(folder, "rule-template-role-manifest.json");
  writeJson("rule-template-role-manifest.json", { schemaVersion: "jaa-rule-template-role-manifest-v1", runId: run.runId, selectionMode: run.rules.selectionMode ?? "LEGACY", roles: run.rules.roleDocuments?.map((document) => ({ role: document.role, fileName: document.fileName, version: document.version, sha256: document.sha256, sizeBytes: document.sizeBytes, providerVisible: document.providerVisible, status: document.status })) ?? [] }); run.ruleRoleManifestPath = roleManifestPath;
  if (requestSanitized !== undefined) writeJson("request-sanitized.json", requestSanitized);
  if (responseSanitized !== undefined) writeJson("response-sanitized.json", responseSanitized);
  writeJson("validation-result.json", run.validationGate ?? { passed: false, status: "not_run", reason: run.progress.message });
  writeJson("token-usage.json", run.progress.usage);
  writeJson("execution-time.json", { startedAt: run.startedAt, completedAt: run.completedAt, durationMs: run.progress.elapsedMs });
  fs.writeFileSync(path.join(folder, "event-log.jsonl"), events.map((item) => redactChatGptText(JSON.stringify(item))).join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(folder, "user-action-log.txt"), actions.map((item) => redactChatGptText(item)).join("\n") + "\n", "utf8");
  if (run.providerResponseRawPath && fs.existsSync(run.providerResponseRawPath)) {
    const debugCopy = path.join(folder, "provider-response.raw.json");
    fs.copyFileSync(run.providerResponseRawPath, debugCopy);
    const debugCopyResponseSha256 = sha256Text(fs.readFileSync(debugCopy, "utf8"));
    if (debugCopyResponseSha256 !== run.providerResponseSha256) throw new AiAnalysisError("AI_PROVIDER_RESPONSE_EVIDENCE_MISMATCH", "Debug response copy does not match canonical raw response hash.");
    writeJson("response-evidence.json", { manifestResponseSha256: run.providerResponseSha256, debugCopyResponseSha256, canonicalResponseSha256: run.providerResponseCanonicalSha256 ?? null, gzipResponseSha256: run.providerResponseGzipSha256 ?? null });
  }
  for (const name of ["output-schema-sanitized.json", "output-schema-canonical.json", "output-schema-validation.json", "output-schema.sha256", "provider-response.canonical.json", "semantic-validation.json"]) {
    const source = path.join(stagingFolder, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(folder, name));
  }
  const modelDeliveryObserved = run.lifecycle?.modelInputStatus === "delivered" || Boolean(run.bridgeEvidence?.modelDeliveryReceipt);
  const submissionObserved = ["submitting", "submission_rejected", "published", "failed"].includes(run.lifecycle?.artifactStatus ?? "not_started");
  const canonicalEvidence: Array<{ source: string | null | undefined; target: string; role: string; expected: boolean; reason: string }> = [
    { source: run.qualityGateReportPath, target: "quality-gate-report.json", role: "quality_gate", expected: Boolean(run.canonicalRecordCount), reason: "canonical validation completed" },
    { source: run.ruleRoleManifestPath, target: "rule-template-role-manifest.json", role: "rule_template_role_manifest", expected: Boolean(run.requestPackage), reason: "four explicit roles frozen" },
    { source: run.evidenceSegmentCatalogPath, target: "evidence-segment-catalog.json", role: "evidence_segment_catalog", expected: Boolean(run.requestPackage), reason: "segmented model package prepared" },
    { source: run.reportDataPackagePath ?? run.diagnosticReportDataPackagePath, target: run.reportDataPackagePath ? "report-data-package.json" : "diagnostic-report-data-package.json", role: run.reportDataPackagePath ? "formal_report_data_package" : "diagnostic_report_data_package", expected: run.reportDataPackagePath ? run.lifecycle?.canonicalStatus === "created" : submissionObserved, reason: run.reportDataPackagePath ? "formal package produced after canonical validation" : "diagnostic package is expected only after a decodable AI submission" },
    { source: run.evidenceNormalizationReceiptPath, target: "evidence-normalization-receipt.json", role: "normalization_receipt", expected: Boolean(run.requestPackage), reason: "formal input prepared" },
    { source: run.issueSnapshotPath, target: "issue-snapshots.json", role: "issue_snapshot", expected: Boolean(run.requestPackage), reason: "formal input prepared" },
    { source: run.issueSnapshotReceiptPath, target: "issue-snapshot-receipt.json", role: "issue_snapshot_receipt", expected: Boolean(run.requestPackage), reason: "formal input prepared" },
    { source: run.htmlTemplateSnapshotPath, target: run.htmlTemplateSnapshotPath ? path.basename(run.htmlTemplateSnapshotPath) : "html-template.md", role: "html_template", expected: Boolean(run.requestPackage), reason: "template frozen before dispatch" },
    { source: run.htmlRenderReceiptPath, target: "html-render-receipt.json", role: "html_receipt", expected: run.lifecycle?.canonicalStatus === "created", reason: "canonical created" },
    { source: run.reportFilePath, target: run.reportFilePath ? path.basename(run.reportFilePath) : "analysis-result.html", role: run.reportPackageMode === "DIAGNOSTIC_NON_CANONICAL" ? "diagnostic_rendered_html" : "formal_rendered_html", expected: run.htmlRenderStatus === "completed", reason: run.htmlRenderStatus === "completed" ? "Package-only HTML completed" : "not produced due to render lifecycle" },
    { source: run.databaseCommitReceiptPath ?? run.databaseCommitFailurePath, target: run.databaseCommitReceiptPath ? "database-commit-receipt.json" : "database-commit-failure.json", role: "sqlite_evidence", expected: run.lifecycle?.sqliteStatus === "committed" || run.lifecycle?.sqliteStatus === "commit_failed", reason: "SQLite attempted" }
  ];
  const v0326Evidence: Array<{ source: string; target: string; role: string }> = [];
  const collectFile = (source: string, target: string, role: string) => { if (fs.existsSync(source) && fs.lstatSync(source).isFile()) v0326Evidence.push({ source, target, role }); };
  const collectDirectory = (sourceDirectory: string, targetDirectory: string, role: string) => { if (!fs.existsSync(sourceDirectory)) return; for (const entry of fs.readdirSync(sourceDirectory, { withFileTypes: true })) { const source = path.join(sourceDirectory, entry.name); const target = path.join(targetDirectory, entry.name); if (entry.isDirectory()) collectDirectory(source, target, role); else if (entry.isFile()) collectFile(source, target, role); } };
  collectDirectory(path.join(stagingFolder, "artifact-attempts"), "artifact-attempts", "ai_submission_and_identity");
  collectDirectory(path.join(stagingFolder, "validation-stage-receipts"), "validation-stage-receipts", "layered_validation_receipt");
  collectDirectory(path.join(stagingFolder, "rule-selection-receipts"), "rule-selection-receipts", "rule_selection_receipt");
  collectFile(path.join(stagingFolder, "derived", "evidence-quote-catalog.jsonl"), "evidence-quote-catalog.jsonl", "evidence_quote_catalog");
  collectFile(path.join(stagingFolder, "derived", "evidence-quote-catalog-receipt.json"), "evidence-quote-catalog-receipt.json", "evidence_quote_catalog_receipt");
  collectFile(path.join(stagingFolder, "validation-findings.jsonl"), "validation-findings.jsonl", "validation_findings");
  collectFile(path.join(stagingFolder, "diagnostic-report-data-package.json"), "diagnostic-report-data-package.json", "diagnostic_report_data_package");
  collectFile(path.join(stagingFolder, "diagnostic-analysis-report.html"), "diagnostic-analysis-report.html", "diagnostic_html");
  collectFile(path.join(stagingFolder, "progress", "model-delivery-receipt.json"), "model-delivery-receipt.json", "model_delivery_receipt");
  collectFile(path.join(stagingFolder, "progress", "bridge-execution-context-receipt.json"), "bridge-execution-context-receipt.json", "bridge_execution_context");
  collectFile(path.join(stagingFolder, "progress", "model-delivery-handle-receipt.json"), "model-delivery-handle-receipt.json", "model_delivery_handle");
  collectFile(path.join(stagingFolder, "progress", "bridge-tool-calls.jsonl"), "bridge-tool-calls.jsonl", "bridge_tool_calls");
  collectFile(path.join(stagingFolder, "progress", "artifact-submission-token-receipt.json"), "artifact-submission-token-receipt.json", "artifact_submission_token");
  collectFile(path.join(stagingFolder, "conversation.jsonl"), "conversation.jsonl", "conversation");
  collectFile(path.join(stagingFolder, "provider-stream.jsonl"), "provider-stream.jsonl", "provider_stream");
  if (run.navigationDecision?.receiptPath) collectFile(run.navigationDecision.receiptPath, "navigation-decisions.jsonl", "navigation_decision");
  for (const evidence of v0326Evidence) canonicalEvidence.push({ source: evidence.source, target: evidence.target, role: evidence.role, expected: true, reason: "v0.3.26 durable Run evidence" });
  const completeness = canonicalEvidence.map((entry) => {
    const present = Boolean(entry.source && fs.existsSync(entry.source));
    if (present) { const target = path.join(folder, entry.target); fs.mkdirSync(path.dirname(target), { recursive: true }); if (path.resolve(entry.source!) !== path.resolve(target)) fs.copyFileSync(entry.source!, target); }
    const classification = present ? "expected_and_present" : entry.expected ? "expected_but_missing" : entry.role.includes("diagnostic") ? modelDeliveryObserved ? "not_applicable_no_submission" : "not_applicable_no_model_delivery" : run.instructionMode === "CUSTOM_DIAGNOSTIC" ? "not_applicable_instruction_mode" : "not_produced_due_to_prior_failure";
    return { relativePath: entry.target, role: entry.role, classification, expectedReason: entry.reason, bytes: present ? fs.statSync(entry.source!).size : 0, sha256: present ? crypto.createHash("sha256").update(fs.readFileSync(entry.source!)).digest("hex") : null, flushStatus: "flushed", collectionSource: entry.source ?? null };
  });
  writeJson("debug-completeness.json", { schemaVersion: "jaa-debug-completeness-v2", runId: run.runId, entries: completeness, flushStatus: "completed" });
  writeJson("flush-completeness.json", { schemaVersion: "jaa-debug-flush-completeness-v1", runId: run.runId, flushStatus: "completed", completedAt: now() });
  writeJson("debug-file-manifest.json", { schemaVersion: "jaa-debug-file-manifest-v2", runId: run.runId, generatedAt: now(), files: completeness });
  return folder;
}
let selectedCanonicalAiRunDirectory: string | null = null;
let selectedAiAnalysisAttemptDirectory: string | null = null;
export function getSelectedCanonicalAiRunDirectory() { return selectedCanonicalAiRunDirectory; }
export function getSelectedAiAnalysisAttemptDirectory() { return selectedAiAnalysisAttemptDirectory; }
export function registerAiAnalysisIpc() {
  handlers.forEach((channel) => ipcMain.removeHandler(channel));
  const envPath = path.join(getAppRuntimeDir(), ".env");
  const templatePath = path.join(getAppRuntimeDir(), ".env.version");
  let environment = loadAiEnvironment(envPath, templatePath);
  const chatgpt = getChatGptService();
  chatgpt.subscribeStatus(() => BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("ai-analysis:snapshot-changed", snapshot())));
  const bundledRulesDirectory = getBundledAnalysisRulesDir();
  const aiStateDirectory = ensureDir(path.join(getAppDataDir(), "ai-analysis", "v0.3.26-state"));
  const ruleSelection = new RuleSelectionTransactionServiceV0333(bundledRulesDirectory, path.join(aiStateDirectory, "rule-selection"));
  let rules: AiRulesSnapshot | null = ruleSelection.rules;
  const attemptStore = new AnalysisAttemptStoreV0325(path.join(aiStateDirectory, "attempts"));
  const startupBridgeReceipt = preflightAnalysisBridgeV0331("startup", null).receipt;
  const resultRegistry = new ActiveResultRegistryV0325(path.join(aiStateDirectory, "results"));
  let lastNavigationDecision = null as import("../shared/aiAnalysisContract.js").AiNavigationDecisionV0325 | null;
  const pendingDatasets: AiPendingDataset[] = [];
  const runs: AiAnalysisRun[] = loadArchivedRuns();
  const runArchives = new Map<string, AiAnalysisRunArchive>(runs.filter((run) => run.runDirectory && run.progress.errorCode !== "AI_RUN_ARCHIVE_FAILED").map((run) => [run.runId, AiAnalysisRunArchive.reopen(run.runId, run.runDirectory!)]));
  let selectedPendingDatasetId: string | null = null;
  let selectedRunId: string | null = null;
  let activeRunId: string | null = null;
  const abortControllers = new Map<string, AbortController>();
  const dispatchGuard = new AnalysisDispatchGuard();
  const errorDeduplicator = new AnalysisErrorDeduplicator();
  const analysisUserActions: string[] = [];
  const providerFailureEvidence = new Map<string, { visibleText: string; usage: ReturnType<typeof emptyTokenUsage>; errorCode: string; message: string }>();
  const observedWorkspaceFiles = new Map<string, Set<string>>();
  const dispatchLedgers = new Map<string, ProviderDispatchLedgerV0330>();
  const preparedProviderMessages = new Map<string, { prompt: string; payloadSha256: string; deliveryMode: string }>();
  const requiredWorkspaceFiles = ["pending-analysis.json", "common-rules.md", "skill-catalog.md", "rule-set-manifest.md"] as const;
  const lastProviderUiNotifyAt = new Map<string, number>();
  let activeChatController: AbortController | null = null;
  let activeDiagnosticController: AbortController | null = null;

  const snapshot = (): AiAnalysisSnapshot => ({
    ipcVersion: AI_ANALYSIS_IPC_VERSION, env: publicEnv(environment), rules,
    pendingDatasets, selectedPendingDatasetId, runs, selectedRunId, activeRunId, chatgpt: chatgpt.getStatus(),
    ruleSelection: ruleSelection.transaction, analysisAttempts: attemptStore.attempts, activeResult: resultRegistry.active && !runs.some((run) => run.runId === resultRegistry.active?.runId && run.quarantineStatus === "QUARANTINED_SYSTEMIC_NO_RESULT") ? resultRegistry.active : null,
    successfulResults: resultRegistry.successful.filter((result) => !runs.some((run) => run.runId === result.runId && run.quarantineStatus === "QUARANTINED_SYSTEMIC_NO_RESULT")), lastNavigationDecision, analysisBridge: startupBridgeReceipt
  });
  const notify = (event: IpcMainInvokeEvent) => event.sender.send("ai-analysis:snapshot-changed", snapshot());
  chatgpt.subscribeRun((providerEvent) => {
    const run = runs.find((item) => item.runId === providerEvent.runId);
    if (!run || activeRunId !== run.runId || run.status !== "running") return;
    const archive = runArchives.get(run.runId);
    const dispatchLedger = dispatchLedgers.get(run.runId);
    try {
      if (providerEvent.type === "provider_event") archive?.appendProviderEvent(providerEvent);
      else if (providerEvent.type === "bridge_tool") archive?.append("system_event", "APP_ONLY", `Analysis Bridge tool ${providerEvent.tool} ${providerEvent.success ? "completed" : "failed"}.`, { tool: providerEvent.tool, callId: providerEvent.callId, success: providerEvent.success, result: providerEvent.result });
      else if (providerEvent.type === "completed") archive?.append("assistant_message", "CHATGPT_VISIBLE", providerEvent.text, { elapsedMs: providerEvent.elapsedMs });
      else if (providerEvent.type === "failed" && providerEvent.visibleText.trim()) { const persisted = run.runDirectory ? atomicExport(path.join(run.runDirectory, "ai-output", "final-assistant-message.txt"), redactChatGptTextComplete(providerEvent.visibleText) + "\n") : null; run.finalAssistantMessage = redactChatGptTextComplete(providerEvent.visibleText); run.finalAssistantMessagePath = persisted?.filePath ?? null; archive?.append("assistant_message", "CHATGPT_VISIBLE", run.finalAssistantMessage, { persistedPath: persisted?.filePath ?? null, persistedSha256: persisted?.sha256 ?? null, providerFailedAfterResponse: true }); }
      else if (providerEvent.type !== "delta") archive?.append("provider_event", "APP_ONLY", providerEvent.type, { ...providerEvent, ...(providerEvent.type === "failed" ? { visibleText: "[persisted-separately]" } : {}) });
      if (providerEvent.type === "provider_event") {
        const serialized = JSON.stringify(providerEvent.params); const observed = observedWorkspaceFiles.get(run.runId);
        run.telemetry = { ...(run.telemetry ?? {}), firstProviderEventAt: run.telemetry?.firstProviderEventAt ?? now(), lastProviderActivityAt: now(), firstAiOutputActivityAt: run.telemetry?.firstAiOutputActivityAt ?? (serialized.includes("ai-output") ? now() : null) };
        for (const fileName of requiredWorkspaceFiles) if (serialized.includes(fileName)) observed?.add(fileName);
        run.observedFileAccess = [...(observed ?? [])].sort();
      }
    } catch (error) {
      run.progress.errorCode = "AI_RUN_ARCHIVE_FAILED"; run.progress.message = `Run archive persistence failed: ${error instanceof Error ? error.message : String(error)}`;
      abortControllers.get(run.runId)?.abort(); return;
    }
    if (providerEvent.type === "preflight_completed") {
      run.codexPreflight = providerEvent.evidence;
      run.progress.message = "Bundled Codex write probe passed with matching Probe / Thread / Turn policy.";
    } else if (providerEvent.type === "thread_starting") {
      dispatchLedger?.append("dispatch_attempted", { at: providerEvent.at, idempotencyKey: "single_provider_dispatch_attempt" });
      run.telemetry = { ...(run.telemetry ?? {}), providerDispatchAttemptedAt: providerEvent.at };
      run.progress.providerDispatchCount = (run.progress.providerDispatchCount ?? 0) + 1;
      run.progress.requestCount = run.progress.providerDispatchCount;
      run.progress.stage = "starting_thread";
      run.progress.threadStartAttemptCount = (run.progress.threadStartAttemptCount ?? 0) + 1;
      run.progress.message = "Starting the single dedicated provider thread.";
    } else if (providerEvent.type === "thread_created") {
      dispatchLedger?.append("provider_contacted", { at: providerEvent.at, idempotencyKey: "provider_contacted" });
      dispatchLedger?.append("thread_created", { at: providerEvent.at, threadId: providerEvent.threadId, idempotencyKey: "thread_created:" + providerEvent.threadId });
      run.telemetry = { ...(run.telemetry ?? {}), providerContactedAt: providerEvent.at, threadCreatedAt: providerEvent.at };
      run.threadId = providerEvent.threadId;
      run.progress.threadCreatedCount = (run.progress.threadCreatedCount ?? 0) + 1;
      run.progress.threadCount = run.progress.threadCreatedCount;
      run.progress.message = "Dedicated thread created; preparing the single analysis turn.";
    } else if (providerEvent.type === "turn_starting") {
      dispatchLedger?.append("turn_start_attempted", { at: providerEvent.at, threadId: providerEvent.threadId, idempotencyKey: "turn_start_attempted" });
      run.telemetry = { ...(run.telemetry ?? {}), turnStartAttemptedAt: providerEvent.at };
      run.progress.stage = "starting_turn";
      run.progress.turnStartAttemptCount = (run.progress.turnStartAttemptCount ?? 0) + 1;
    } else if (providerEvent.type === "turn_started") {
      dispatchLedger?.append("turn_accepted", { at: providerEvent.at, threadId: providerEvent.threadId, turnId: providerEvent.turnId, idempotencyKey: "turn_accepted:" + providerEvent.turnId });
      run.telemetry = { ...(run.telemetry ?? {}), turnAcceptedAt: providerEvent.at };
      const prepared = preparedProviderMessages.get(run.runId);
      if (prepared) { archive?.append("user_message", "CHATGPT_VISIBLE", prepared.prompt, { dispatchStatus: "sent", providerRequestId: run.runId, threadId: providerEvent.threadId, turnId: providerEvent.turnId, deliveryMode: prepared.deliveryMode, payloadSha256: prepared.payloadSha256 }); preparedProviderMessages.delete(run.runId); }
      run.turnId = providerEvent.turnId;
      run.progress.acceptedTurnCount = (run.progress.acceptedTurnCount ?? 0) + 1;
      run.progress.turnCount = run.progress.acceptedTurnCount;
      run.progress.stage = "waiting_response";
      run.progress.message = "Provider accepted the single analysis turn.";
    } else if (providerEvent.type === "delta") {
      run.progress.stage = "receiving_response";
      run.progress.message = "Provider is active; waiting for Decision JSON and Analysis Report publication.";
    } else if (providerEvent.type === "usage") {
      run.progress.usage = {
        inputTokens: providerEvent.inputTokens,
        cachedInputTokens: providerEvent.cachedInputTokens,
        outputTokens: providerEvent.outputTokens,
        reasoningTokens: providerEvent.reasoningTokens,
        totalTokens: providerEvent.totalTokens,
        availability: "actual",
        estimatedInputTokens: run.progress.usage.estimatedInputTokens
      };
    } else if (providerEvent.type === "provider_turn_completed") {
      dispatchLedger?.append("turn_completed", { at: providerEvent.at, threadId: providerEvent.threadId, turnId: providerEvent.turnId, idempotencyKey: "turn_completed:" + providerEvent.turnId });
      run.telemetry = { ...(run.telemetry ?? {}), turnCompletedAt: providerEvent.at };
      run.progress.turnCompletedCount = (run.progress.turnCompletedCount ?? 0) + 1;
      run.progress.usage = { ...run.progress.usage, ...providerEvent.tokenTelemetry.turnCumulative, availability: providerEvent.tokenTelemetry.availability, turnCumulative: providerEvent.tokenTelemetry.turnCumulative, lastModelCall: providerEvent.tokenTelemetry.lastModelCall, usageEventCount: providerEvent.tokenTelemetry.usageEventCount };
      run.progress.message = "Provider turn completed; validating model delivery and analysis evidence.";
    } else if (providerEvent.type === "failed") {
      dispatchLedger?.append("failed", { rootErrorCode: providerEvent.errorCode, rootErrorMessage: providerEvent.message, lastSuccessfulState: dispatchLedger.projection.lastState, idempotencyKey: "failed:" + providerEvent.errorCode });
      providerFailureEvidence.set(providerEvent.runId, { visibleText: providerEvent.visibleText, usage: { ...providerEvent.usage, availability: "partial", estimatedInputTokens: run.progress.usage.estimatedInputTokens }, errorCode: providerEvent.errorCode, message: providerEvent.message });
    } else if (providerEvent.type === "completed") {
      run.progress.stage = "validating_response_schema";
      run.progress.message = "Provider turn completed; validating the canonical response schema.";
    }
    const highVolume = providerEvent.type === "provider_event" || providerEvent.type === "delta" || providerEvent.type === "usage";
    const current = Date.now(); const lastUi = lastProviderUiNotifyAt.get(run.runId) ?? 0;
    if (!highVolume || current - lastUi >= 250) { lastProviderUiNotifyAt.set(run.runId, current); BrowserWindow.getAllWindows().forEach((window) => window.webContents.send("ai-analysis:snapshot-changed", snapshot())); }
    if (!highVolume) archive?.writeManifest(run);
  });
  const settingsAndSecret = (service: AiServiceKey) => {
    if (service !== "ai_nexus") throw new AiAnalysisError("AI_NOT_CONFIGURED", "ChatGPT credentials and settings are managed by Codex App Server.");
    return { settings: environment.aiNexus, secret: environment.values.AI_NEXUS_TOKEN ?? "" };
  };

  ipcMain.handle("ai-analysis:chatgpt-start", async () => { try { return { ok: true, status: await chatgpt.start() }; } catch (error) { return { ...errorPayload(error), status: chatgpt.getStatus() }; } });
  ipcMain.handle("ai-analysis:chatgpt-login", async () => { try { return { ok: true, status: await chatgpt.login() }; } catch (error) { return { ...errorPayload(error), status: chatgpt.getStatus() }; } });
  ipcMain.handle("ai-analysis:chatgpt-cancel-login", async () => ({ ok: true, status: await chatgpt.cancelLogin() }));
  ipcMain.handle("ai-analysis:chatgpt-logout", async () => ({ ok: true, status: await chatgpt.logout() }));
  ipcMain.handle("ai-analysis:chatgpt-refresh", async () => { try { return { ok: true, status: await chatgpt.start() }; } catch (error) { return { ...errorPayload(error), status: chatgpt.getStatus() }; } });
  ipcMain.handle("ai-analysis:chatgpt-select-model", async (_event, model: string | null) => { try { return { ok: true, status: chatgpt.selectModel(model) }; } catch (error) { return { ...errorPayload(error), status: chatgpt.getStatus() }; } });
  ipcMain.handle("ai-analysis:snapshot", async () => snapshot());
  ipcMain.handle("ai-analysis:reload-env", async () => {
    environment = loadAiEnvironment(envPath, templatePath);
    return snapshot();
  });
  ipcMain.handle("ai-analysis:save-settings", async (_event, update: AiSettingsUpdate) => {
    try { environment = saveAiSettings(envPath, update); return { ok: true, snapshot: snapshot() }; }
    catch (error) { return errorPayload(error); }
  });
  ipcMain.handle("ai-analysis:test-connection", async (_event, service: AiServiceKey) => {
    try {
      if (service === "chatgpt") {
        const started = Date.now(); const status = await chatgpt.start();
        if (status.state !== "connected") throw new AiAnalysisError("CHATGPT_SIGN_IN_REQUIRED", "Sign in with ChatGPT before running a test chat.");
        return { ok: true, service, testedFingerprint: status.runtimeSha256 ?? "", statusCode: null, requestId: null, elapsedMs: Date.now() - started, errorCode: null, message: "ChatGPT runtime, account, model list, and rate limits are ready.", usage: emptyTokenUsage(), sanitizedResponse: { runtimeVersion: status.runtimeVersion, modelCount: status.models.length, state: status.state } };
      }
      const { settings, secret } = settingsAndSecret(service);
      const result = await callAiNexus(settings, secret, "Reply with exactly: OK");
      settings.connectionStatus = "passed"; settings.testedFingerprint = settings.configFingerprint; return result;
    } catch (error) { return errorPayload(error); }
  });
  ipcMain.handle("ai-analysis:diagnose", async (_event, service: AiServiceKey) => {
    analysisUserActions.push(`${now()} Provider diagnostics requested: ${service}`);
    if (activeDiagnosticController) throw new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Another diagnostic is active.");
    const diagnosticController = new AbortController();
    activeDiagnosticController = diagnosticController;
    const startedAt = now();
    const stepNames: Array<[AiDiagnosticStep["id"], string]> = [
      ["configuration", "Configuration"], ["network", "Network and runtime transport"], ["authentication", "Authentication"],
      ["model", "Model availability"], ["minimal_request", "Minimal non-secret request"], ["contract", "Response contract"], ["persistence", "Diagnostic persistence"]
    ];
    const steps: AiDiagnosticStep[] = stepNames.map(([id, name]) => ({ id, name, status: "pending", startedAt: null, completedAt: null, durationMs: null, errorCode: null, message: "Pending", requestSummary: {}, responseSummary: {} }));
    const diagnostic: AiDiagnosticRun = { runId: `diag_${crypto.randomUUID()}`, service, status: "running", startedAt, completedAt: null, testedFingerprint: service === "chatgpt" ? (chatgpt.getStatus().runtimeSha256 ?? "") : settingsAndSecret(service).settings.configFingerprint, steps, folderPath: null, copySummary: "" };
    const folder = ensureDir(path.join(getAppDataDir(), "ai-analysis", "diagnostics", diagnostic.runId));
    try {
      if (service === "chatgpt") {
        const status = await chatgpt.start();
        if (status.state !== "connected") throw new AiAnalysisError("CHATGPT_SIGN_IN_REQUIRED", "ChatGPT sign-in is required; account/model/quota checks were skipped.");
        const completedAt = now(); diagnostic.steps = steps.map((step) => ({ ...step, status: step.id === "persistence" ? "skipped" : "passed", startedAt, completedAt, durationMs: Date.now() - Date.parse(startedAt), message: step.id === "persistence" ? "No credential data is persisted by Jira Activity Analyzer." : "Passed", requestSummary: { runtimeVersion: status.runtimeVersion }, responseSummary: { state: status.state, modelCount: status.models.length } }));
        diagnostic.status = "passed"; diagnostic.completedAt = completedAt; diagnostic.folderPath = folder; diagnostic.copySummary = `Service: ChatGPT\nStatus: passed\nRuntime: ${status.runtimeVersion}\nAccount: ${status.accountEmailMasked ?? "signed out"}`;
        throw Object.assign(new Error("CHATGPT_DIAGNOSTIC_COMPLETE"), { diagnosticComplete: true });
      }
      const { settings, secret } = settingsAndSecret(service);
      if (!environment.found || !environment.supported) throw new AiAnalysisError(environment.errorCode ?? "ENV_PARSE_ERROR", environment.message);
      const result = await callAiNexus(settings, secret, "Reply with exactly: DIAGNOSTIC_OK", diagnosticController.signal);
      const completedAt = now();
      diagnostic.steps = steps.map((step) => ({ ...step, status: step.id === "network" && !settings.endpoint.startsWith("https:") ? "skipped" : "passed", startedAt, completedAt, durationMs: result.elapsedMs, message: "Passed", requestSummary: { endpoint: settings.endpoint, model: settings.model, authorization: "[masked]" }, responseSummary: result.sanitizedResponse }));
      diagnostic.status = "passed"; diagnostic.completedAt = completedAt; diagnostic.folderPath = folder;
      diagnostic.copySummary = `Service: ${service}\nStatus: passed\nModel: ${settings.model}\nAuthorization: [masked]\nRequest ID: ${result.requestId ?? "unavailable"}`;
    } catch (error) {
      if ((error as { diagnosticComplete?: boolean }).diagnosticComplete) { /* finalized above */ } else {
      const value = error instanceof AiAnalysisError ? error : new AiAnalysisError("AI_RESPONSE_INVALID", String(error));
      const completedAt = now();
      diagnostic.steps = steps.map((step, index) => ({ ...step, status: index === 0 && value.code.startsWith("ENV_") ? "failed" : index < 6 ? "failed" : "passed", startedAt, completedAt, durationMs: Date.now() - Date.parse(startedAt), errorCode: index < 6 ? value.code : null, message: index < 6 ? value.message : "Failure diagnostics persisted.", requestSummary: { authorization: "[masked]" }, responseSummary: {} }));
      diagnostic.status = "failed"; diagnostic.completedAt = completedAt; diagnostic.folderPath = folder;
      diagnostic.copySummary = `Service: ${service}\nStatus: failed\nError: ${value.code}\nAuthorization: [masked]`;
      }
    }
    atomicExport(path.join(folder, "diagnostic-summary.json"), JSON.stringify(diagnostic, null, 2));
    atomicExport(path.join(folder, "event-log.jsonl"), diagnostic.steps.map((step) => JSON.stringify({ time: step.completedAt, step: step.id, status: step.status, errorCode: step.errorCode })).join("\n") + "\n");
    atomicExport(path.join(folder, "request-sanitized.json"), JSON.stringify({ service, authorization: "[masked]", fingerprint: diagnostic.testedFingerprint }, null, 2));
    atomicExport(path.join(folder, "response-sanitized.json"), JSON.stringify({ status: diagnostic.status, steps: diagnostic.steps.map((step) => step.responseSummary) }, null, 2));
    atomicExport(path.join(folder, "environment.txt"), `ENV_FORMAT_VERSION=${environment.formatVersion ?? "missing"}\nSecret=[masked]\n`);
    if (activeDiagnosticController === diagnosticController) activeDiagnosticController = null;
    return diagnostic;
  });
  ipcMain.handle("ai-analysis:cancel-diagnostic", async () => { if (!activeDiagnosticController) return { ok: false, message: "No diagnostic is active." }; activeDiagnosticController.abort(); return { ok: true }; });
  ipcMain.handle("ai-analysis:chat", async (_event, payload: { service: AiServiceKey; sessionId: string; messages: Array<{ role: "user" | "assistant"; text: string }> }) => {
    if (activeChatController) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Another test conversation request is active."));
    const chatController = new AbortController();
    activeChatController = chatController;
    try {
      const prompt = payload.messages.slice(-12).map((item) => `${item.role.toUpperCase()}: ${item.text}`).join("\n") + "\nASSISTANT:";
      if (payload.service === "chatgpt") {
        const result = await chatgpt.runAnalysis({ prompt, requestPurpose: "MANUAL_CHAT" }, chatController.signal);
        const traceFolderPath = ensureDir(path.join(getAppDataDir(), "ai-analysis", "diagnostics", "manual-chat", payload.sessionId, crypto.randomUUID()));
        atomicExport(path.join(traceFolderPath, "request-sanitized.json"), JSON.stringify({ service: payload.service, messages: payload.messages, authorization: "[masked]" }, null, 2));
        atomicExport(path.join(traceFolderPath, "response-sanitized.json"), JSON.stringify({ model: result.model, text: result.text, usage: result.usage }, null, 2));
        return { ok: true, message: { id: crypto.randomUUID(), sessionId: payload.sessionId, role: "assistant", service: payload.service, provider: "chatgpt_codex", model: result.model, createdAt: now(), elapsedMs: result.elapsedMs, usage: { ...result.usage, availability: "actual", estimatedInputTokens: null }, text: result.text, traceFolderPath } };
      }
      const { settings, secret } = settingsAndSecret(payload.service); const result = await callAiNexus(settings, secret, prompt, chatController.signal);
      const traceFolderPath = ensureDir(path.join(getAppDataDir(), "ai-analysis", "diagnostics", "manual-chat", payload.sessionId, crypto.randomUUID()));
      atomicExport(path.join(traceFolderPath, "request-sanitized.json"), JSON.stringify({ service: payload.service, messages: payload.messages, endpoint: settings.endpoint, model: settings.model, authorization: "[masked]" }, null, 2));
      atomicExport(path.join(traceFolderPath, "response-sanitized.json"), JSON.stringify({ model: settings.model, text: result.text, usage: result.usage, requestId: result.requestId }, null, 2));
      return { ok: true, message: { id: crypto.randomUUID(), sessionId: payload.sessionId, role: "assistant", service: payload.service, provider: "ai_nexus", model: settings.model, createdAt: now(), elapsedMs: result.elapsedMs, usage: result.usage, text: result.text, traceFolderPath } };
    } catch (error) { return errorPayload(error); }
    finally { if (activeChatController === chatController) activeChatController = null; }
  });
  ipcMain.handle("ai-analysis:cancel-chat", async () => { if (!activeChatController) return { ok: false, message: "No test conversation request is active." }; activeChatController.abort(); return { ok: true }; });
  ipcMain.handle("ai-analysis:choose-rules", async () => ({ ...errorPayload(new AiAnalysisError("AI_RULE_SELECTION_TRANSACTION_INCOMPLETE", "v0.3.26 請使用四個角色各自的選取按鈕。")), canceled: false, snapshot: snapshot() }));
  ipcMain.handle("ai-analysis:choose-rule-role", async (event, role: import("../shared/aiAnalysisContract.js").AiRuleDocumentRole) => {
    const labels = { manifest: "Rule Set Manifest", common_rules: "Classification Common Rules", catalog: "Skill Catalog", html_template: "HTML Report Template" } as const;
    if (!(role in labels)) return { ...errorPayload(new AiAnalysisError("AI_RULE_FILE_NOT_SELECTED", "未知的 Rule role。")), canceled: false, snapshot: snapshot() };
    analysisUserActions.push(`${now()} Rule role selection requested: ${role}`);
    const owner = BrowserWindow.fromWebContents(event.sender); const options = { title: `Select ${labels[role]}`, buttonLabel: `Select ${labels[role]}`, properties: ["openFile"] as Array<"openFile">, filters: [{ name: "Markdown", extensions: ["md"] }] };
    const choice = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (choice.canceled || !choice.filePaths[0]) return { canceled: true, snapshot: snapshot() };
    const result = ruleSelection.selectRole(role, choice.filePaths[0]); rules = ruleSelection.rules;
    notify(event);
    return result.error ? { canceled: false, ...errorPayload(result.error), activated: false, snapshot: snapshot() } : { canceled: false, ok: true, activated: result.activated, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:cancel-rule-draft", async (event) => { ruleSelection.cancelDraft(); rules = ruleSelection.rules; notify(event); return { ok: true, snapshot: snapshot() }; });
  ipcMain.handle("ai-analysis:use-bundled-rules", async (event) => { try { ruleSelection.useBundled(); rules = ruleSelection.rules; notify(event); return { ok: true, snapshot: snapshot() }; } catch (error) { return { ...errorPayload(normalizeRuleSelectionErrorV0333(error)), snapshot: snapshot() }; } });
  ipcMain.handle("ai-analysis:load-rules", async (event) => { try { rules = ruleSelection.revalidate(); notify(event); return { ok: true, snapshot: snapshot() }; } catch (error) { return { ...errorPayload(normalizeRuleSelectionErrorV0333(error)), snapshot: snapshot() }; } });  ipcMain.handle("ai-analysis:choose-pending", async () => {
    analysisUserActions.push(`${now()} Select Pending JSON requested`);
    const choice = await dialog.showOpenDialog({ title: "Open pending-analysis JSON", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
    if (choice.canceled || !choice.filePaths[0]) return { canceled: true, snapshot: snapshot() };
    try {
      const dataset = loadPendingDataset(choice.filePaths[0]);
      const existing = pendingDatasets.findIndex((item) => item.sourceFileSha256 === dataset.sourceFileSha256);
      if (existing >= 0) pendingDatasets.splice(existing, 1);
      pendingDatasets.unshift(dataset); selectedPendingDatasetId = dataset.datasetId;
      return { ok: true, canceled: false, snapshot: snapshot() };
    } catch (error) { return { canceled: false, ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:verify-pending", async (_event, datasetId: string) => {
    try {
      const current = pendingDatasets.find((item) => item.datasetId === datasetId);
      if (!current?.sourceFilePath) throw new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Pending dataset source path is unavailable.");
      const refreshed = loadPendingDataset(current.sourceFilePath);
      const index = pendingDatasets.indexOf(current);
      pendingDatasets.splice(index, 1, refreshed);
      selectedPendingDatasetId = refreshed.datasetId;
      return { ok: true, snapshot: snapshot() };
    } catch (error) { return { ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:select-pending", async (_event, datasetId: string) => {
    if (!pendingDatasets.some((item) => item.datasetId === datasetId)) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Pending dataset was not found."));
    selectedPendingDatasetId = datasetId;
    return { ok: true, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:choose-analyzed", async () => {
    const choice = await dialog.showOpenDialog({ title: "Open analyzed Activity Events JSON", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
    if (choice.canceled || !choice.filePaths[0]) return { canceled: true, snapshot: snapshot() };
    try {
      const filePath = fs.realpathSync.native(path.resolve(choice.filePaths[0]));
      const stat = fs.statSync(filePath);
      if (stat.size > 128 * 1024 * 1024) throw new AiAnalysisError("INPUT_TOO_LARGE", "Analyzed dataset exceeds 128 MiB.");
      const raw = fs.readFileSync(filePath, "utf8");
      const document = JSON.parse(raw) as { schemaName?: string; schemaVersion?: string; fileType?: string; run?: AiAnalysisRun };
      if (document.schemaName !== "jira-activity-analyzer.analyzed-analysis" || !document.schemaVersion || (document.schemaVersion !== AI_ANALYZED_FILE_SCHEMA_VERSION && !(AI_ANALYZED_LEGACY_FILE_SCHEMA_VERSIONS as readonly string[]).includes(document.schemaVersion)) || document.fileType !== "ANALYZED" || !document.run || !["completed", "completed_with_quality_warnings", "completed_with_persistence_error"].includes(document.run.status) || document.run.results.length === 0 || document.run.results.length !== document.run.selectedDiffIds.length) {
        throw new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Only completed analyzed Activity Events datasets are supported.");
      }
      const imported = document.schemaVersion === AI_ANALYZED_FILE_SCHEMA_VERSION ? structuredClone(document.run) : adaptLegacyAnalyzedRun(document.run, document.schemaVersion);
      imported.analyzedFilePath = filePath;
      imported.analyzedFileName = path.basename(filePath);
      imported.analyzedFileSizeBytes = stat.size;
      imported.analyzedFileSha256 = sha256Text(raw);
      imported.importedFromFile = true;
      const existing = runs.findIndex((item) => item.runId === imported.runId);
      if (existing >= 0) runs.splice(existing, 1);
      runs.unshift(imported);
      const importId = `import_${crypto.randomUUID()}`;
      const activeResult = resultRegistry.activateRun(imported, "MANUAL_IMPORT", importId);
      selectedRunId = imported.runId;
      selectedCanonicalAiRunDirectory = null;
      return { canceled: false, ok: true, activeResult, snapshot: snapshot() };
    } catch (error) { return { canceled: false, ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:select-run", async (_event, runId: string) => {
    if (!runs.some((item) => item.runId === runId)) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Analyzed run was not found."));
    selectedRunId = runId;
    selectedCanonicalAiRunDirectory = runs.find((item) => item.runId === runId)?.runDirectory ?? null;
    return { ok: true, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:activate-result", async (event, activeResultId: string) => {
    try { const activeResult = resultRegistry.activateExisting(activeResultId); if (activeResult.runId) { selectedRunId = activeResult.runId; selectedCanonicalAiRunDirectory = runs.find((item) => item.runId === activeResult.runId)?.runDirectory ?? null; } notify(event); return { ok: true, activeResult, snapshot: snapshot() }; }
    catch (error) { return { ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:start", async (event, payload: { mode: AiAnalyzerMode; datasetId: string; selectedDiffIds: string[]; service?: AiServiceKey; supplementalInstruction?: string; instructionMode?: AiInstructionMode; userAdditionalInstruction?: string; userCustomInstruction?: string; analysisRunId?: string; capacityConfirmation?: boolean }) => {
    const resumedRun = payload.analysisRunId ? runs.find((item) => item.runId === payload.analysisRunId) ?? null : null;
    const requestedDataset = pendingDatasets.find((item) => item.datasetId === payload.datasetId) ?? null;
    const attempt = resumedRun?.analysisAttemptId
      ? attemptStore.find(resumedRun.analysisAttemptId) ?? attemptStore.begin({ pendingDatasetSha256: requestedDataset?.sourceFileSha256 ?? null, activeRuleSetId: ruleSelection.transaction.activeSet?.activeSetId ?? null, instructionMode: payload.instructionMode ?? "STANDARD_FORMAL" })
      : attemptStore.begin({ pendingDatasetSha256: requestedDataset?.sourceFileSha256 ?? null, activeRuleSetId: ruleSelection.transaction.activeSet?.activeSetId ?? null, instructionMode: payload.instructionMode ?? "STANDARD_FORMAL" });
    selectedCanonicalAiRunDirectory = null;
    selectedAiAnalysisAttemptDirectory = attempt.archivePath;
    const rejectAttempt = (error: unknown) => {
      const normalized = asAnalysisError(error);
      attemptStore.preflightFailed(attempt, normalized.code, normalized.message);
      lastNavigationDecision = attemptStore.navigation(attempt, navigationDecisionV0325({ attempt, run: null, active: resultRegistry.active }));
      notify(event);
      return { ...errorPayload(normalized), analysisAttemptId: attempt.analysisAttemptId, navigationDecision: lastNavigationDecision, snapshot: snapshot() };
    };
    if (activeRunId) {
      if (payload.analysisRunId === activeRunId && resumedRun) return { ok: false, run: resumedRun, snapshot: snapshot(), alreadyDispatching: true };
      return rejectAttempt(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Another analysis run is active."));
    }
    if (payload.analysisRunId && (!resumedRun || resumedRun.progress.stage !== "waiting_capacity_confirmation")) {
      if (resumedRun) {
        const navigationDecision = attemptStore.navigation(attempt, navigationDecisionV0325({ attempt, run: resumedRun, active: resultRegistry.active }));
        lastNavigationDecision = navigationDecision;
        return { ok: resumedRun.status === "completed", run: resumedRun, navigationDecision, snapshot: snapshot(), alreadyTerminal: true };
      }
      return rejectAttempt(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Prepared analysis run was not found."));
    }
    let dataset = requestedDataset;
    if (!dataset || !rules?.valid || !payload.selectedDiffIds.length) return rejectAttempt(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "A verified dataset, Active Rule Set, and at least one diff are required."));
    const selectedDataset = dataset;
    if (payload.selectedDiffIds.some((id) => !selectedDataset.diffs.some((diff) => diff.sourceDiffId === id))) return rejectAttempt(new AiAnalysisError("SOURCE_MISMATCH", "Selected diff does not belong to the selected dataset."));
    try {
      if (!dataset.sourceFilePath) throw new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Dataset source path is required for preflight.");
      const refreshedRules = ruleSelection.revalidate();
      const refreshedDataset = loadPendingDataset(dataset.sourceFilePath);
      if (!refreshedRules.valid) throw new AiAnalysisError("ANALYSIS_RULES_INVALID", refreshedRules.errors.join(" ") || "Rules validation failed.");
      if (refreshedDataset.sourceFileSha256 !== dataset.sourceFileSha256) throw new AiAnalysisError("SOURCE_MISMATCH", "Pending Dataset changed after selection; import it again.");
      rules = refreshedRules; dataset = refreshedDataset;
    } catch (error) { return rejectAttempt(normalizeRuleSelectionErrorV0333(error)); }
    const service = payload.service ?? (payload.mode === "CHATGPT" ? "chatgpt" : "ai_nexus");
    const provider = payload.mode === "OFFLINE_RULE" ? "offline_rule" : payload.mode === "CHATGPT" ? "chatgpt_codex" : "ai_nexus";
    if (payload.mode === "CHATGPT" && chatgpt.getStatus().state !== "connected") return rejectAttempt(new AiAnalysisError("CHATGPT_SIGN_IN_REQUIRED", "ChatGPT must be connected before analysis."));
    if (payload.mode === "AI_NEXUS") { const current = settingsAndSecret("ai_nexus").settings; if (current.connectionStatus !== "passed" || current.testedFingerprint !== current.configFingerprint) return rejectAttempt(new AiAnalysisError("AI_NOT_CONFIGURED", "AI Nexus settings must pass connection testing before analysis.")); }
    let bridgePreflightReceipt: ReturnType<typeof preflightAnalysisBridgeV0331>["receipt"] | null = null;
    if (payload.mode === "CHATGPT") {
      const bridgeResolution = preflightAnalysisBridgeV0331("analysis_start", attempt.analysisAttemptId);
      bridgePreflightReceipt = bridgeResolution.receipt;
      fs.writeFileSync(path.join(attempt.archivePath, "bridge-preflight-receipt.json"), JSON.stringify(bridgeResolution.receipt, null, 2) + "\n", "utf8");
      const attemptLedger = new ProviderDispatchLedgerV0330(path.join(attempt.archivePath, "provider-dispatch-ledger.jsonl"));
      if (bridgeResolution.receipt.status !== "ready") {
        attemptLedger.append("failed", { rootErrorCode: bridgeResolution.receipt.rootErrorCode, rootErrorMessage: bridgeResolution.receipt.rootErrorMessage, lastSuccessfulState: null, idempotencyKey: "bridge_preflight_failed" });
        return rejectAttempt(Object.assign(new Error(`${bridgeResolution.receipt.rootErrorCode}:${bridgeResolution.receipt.rootErrorMessage}`), { code: bridgeResolution.receipt.rootErrorCode }));
      }
    }
    const dbPath = resolveConfiguredPath(environment.values.AI_ANALYSIS_DB_PATH, path.join(getAppDataDir(), "ai-analysis", "ai-analysis.sqlite3"));
    if (payload.mode !== "CHATGPT") try { initializeAiDatabase(dbPath); } catch (error) { return rejectAttempt(new AiAnalysisError("AI_DB_MIGRATION_FAILED", error instanceof Error ? error.message : String(error))); }
    const model = payload.mode === "OFFLINE_RULE" ? rules.classificationEngineVersion : payload.mode === "CHATGPT" ? (chatgpt.getStatus().selectedModel ?? "auto") : settingsAndSecret(service).settings.model;
    const runId = resumedRun?.runId ?? `analysis_${crypto.randomUUID()}`;
    analysisUserActions.push(`${now()} ${resumedRun ? "Capacity confirmation resumed" : "Start analysis requested"}: ${runId}`);
    const startedAt = resumedRun?.startedAt ?? now();
    const run: AiAnalysisRun = resumedRun ?? {
      runId, revision: runs.filter((item) => item.sourceDatasetId === dataset.datasetId).length + 1, status: "running", analyzerMode: payload.mode,
      sourceDatasetId: dataset.datasetId, sourceFileName: dataset.fileName, sourceFilePath: dataset.sourceFilePath, sourceFileSha256: dataset.sourceFileSha256,
      sourceDatabaseId: dataset.sourceDatabaseId, jiraServerFingerprint: dataset.jiraServerFingerprint, selectedDiffIds: [...payload.selectedDiffIds],
      provider, model, apiContract: payload.mode === "OFFLINE_RULE" ? "offline" : payload.mode === "CHATGPT" ? "responses" : settingsAndSecret(service).settings.apiContract,
      configFingerprint: payload.mode === "OFFLINE_RULE" ? null : payload.mode === "CHATGPT" ? chatgpt.getStatus().runtimeSha256 : settingsAndSecret(service).settings.configFingerprint,
      rules: structuredClone(rules), startedAt, completedAt: null, appVersion: __MAIN_APP_VERSION__, buildTime: __MAIN_BUILD_TIME__, packagedSourceCommit: __MAIN_GIT_COMMIT__, runtimeSource: payload.mode === "CHATGPT" ? "bundled" : null, runtimeIntegrity: payload.mode === "CHATGPT" ? chatgpt.getStatus().runtimeIntegrity : null, providerRuntimeVersion: payload.mode === "CHATGPT" ? chatgpt.getStatus().runtimeVersion : null,
      progress: { runId, status: "running", stage: "validating_source", totalBatches: payload.mode === "AI_NEXUS" ? payload.selectedDiffIds.length : payload.mode === "CHATGPT" ? 0 : 1, completedBatches: 0, failedBatches: 0, currentBatch: 1, totalDiffs: payload.selectedDiffIds.length, completedDiffs: 0, requestCount: 0, providerDispatchCount: 0, threadStartAttemptCount: 0, threadCreatedCount: 0, turnStartAttemptCount: 0, acceptedTurnCount: 0, turnCompletedCount: 0, retryCount: 0, repairTurnCount: 0, fallbackRequestCount: 0, threadCount: 0, turnCount: 0, mainPayloadCount: 0, rulesTransmissionCount: 0, payloadRecordCount: 0, resultRecordCount: 0, elapsedMs: 0, usage: emptyTokenUsage(payload.mode === "OFFLINE_RULE" ? "not_applicable" : "unavailable"), message: "Analysis started.", errorCode: null },
      results: [], supplementalInstruction: payload.supplementalInstruction?.trim() || null, instructionMode: payload.instructionMode ?? "STANDARD_FORMAL", userAdditionalInstruction: payload.userAdditionalInstruction?.trim() || payload.supplementalInstruction?.trim() || null, userCustomInstruction: payload.userCustomInstruction?.trim() || null, instructionComposition: null, providerReturnedRecordCount: 0, parsedRecordCount: 0, schemaValidRecordCount: 0, semanticValidRecordCount: 0, formalArtifactRecordCount: 0, sqliteCommittedRecordCount: 0, analyzedFileName: safeAnalyzedFileName(dataset.fileName, runId), plannedAnalyzedFilePath: null, analyzedFilePath: null, analyzedFileSizeBytes: null, analyzedFileSha256: null, databasePath: null
    };
    run.analysisAttemptId = attempt.analysisAttemptId;
    if (!resumedRun) {
      try { const archive = new AiAnalysisRunArchive(runId, new Date(startedAt)); runArchives.set(runId, archive); run.runDirectory = archive.directory; archive.append("system_event", "APP_ONLY", "Analysis Run created after Bridge preflight passed.", { runId, localTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); if (bridgePreflightReceipt) { const debugDirectory = ensureDir(path.join(archive.directory, "debug")); fs.writeFileSync(path.join(debugDirectory, "bridge-preflight-receipt.json"), JSON.stringify(bridgePreflightReceipt, null, 2) + "\n", "utf8"); dispatchLedgers.set(runId, new ProviderDispatchLedgerV0330(path.join(archive.directory, "logs", "provider-dispatch-ledger.jsonl"))); } archive.writeManifest(run); }
      catch (error) { return rejectAttempt(new AiAnalysisError("AI_RUN_ARCHIVE_FAILED", error instanceof Error ? error.message : String(error))); }
    }
    attemptStore.linkRun(attempt, runId);
    const outputDir = ensureDir(path.join(getExportsDir(), "ai-analysis"));
    run.plannedAnalyzedFilePath = path.join(outputDir, run.analyzedFileName);
    if (!resumedRun) runs.unshift(run);
    run.status = "running"; run.progress.status = "running"; activeRunId = runId; selectedRunId = runId; selectedCanonicalAiRunDirectory = run.runDirectory ?? null;
    if (payload.mode === "CHATGPT") observedWorkspaceFiles.set(runId, new Set());
    const controller = new AbortController(); abortControllers.set(runId, controller); notify(event);
    let providerVisibleResponse: string | null = null;
    let runStagingFolder: string | null = null;
    let requestEvidence: Record<string, unknown> | undefined;
    try {
      if (payload.mode === "OFFLINE_RULE") {
        run.progress.stage = "validating_response";
        run.results = classifyOffline(dataset, payload.selectedDiffIds, run.rules);
        run.progress.mainPayloadCount = 1;
        run.progress.payloadRecordCount = payload.selectedDiffIds.length;
        run.progress.resultRecordCount = run.results.length;
      } else if (payload.mode === "CHATGPT") {
        run.progress.stage = "building_payload";
        run.progress.message = "Preparing the run-scoped read-only local file workspace.";
        notify(event);
        const compact = buildCompactPayload(dataset, payload.selectedDiffIds, run.rules);
        const normalization = normalizeEvidenceSet(compact.payload.records.map((record) => ({ evidenceRef: record.evidenceId, rawText: [...record.addedText, ...record.removedText].join("\n"), sourceProvenance: record.sourceProvenance, fieldName: record.fieldName })));
        run.decisionContractVersion = "jaa-ai-analysis-decisions-v5";
        run.evidenceNormalizerVersion = EVIDENCE_NORMALIZER_VERSION;
        if (!run.runDirectory) throw new AiAnalysisError("AI_RUN_ARCHIVE_FAILED", "Canonical Run directory is unavailable.");
        const stagingFolder = ensureDir(run.runDirectory); const derivedFolder = ensureDir(path.join(stagingFolder, "derived"));
        const normalizationReceipt = fs.existsSync(path.join(derivedFolder, "evidence-normalization-receipt.json")) ? { filePath: path.join(derivedFolder, "evidence-normalization-receipt.json") } : atomicExport(path.join(derivedFolder, "evidence-normalization-receipt.json"), JSON.stringify(normalization.receipt, null, 2) + "\n");
        run.evidenceNormalizationReceiptPath = normalizationReceipt.filePath;
        const segmentCatalog: EvidenceSegmentCatalogV0324 = buildEvidenceSegmentCatalogV0324(runId, dataset, compact.payload);
        const segmentCatalogPath = path.join(derivedFolder, "evidence-segment-catalog.json");
        if (!fs.existsSync(segmentCatalogPath)) durableJsonWriteV0324(segmentCatalogPath, segmentCatalog);
        run.evidenceSegmentCatalogPath = segmentCatalogPath; run.evidenceSegmentCatalogSha256 = segmentCatalog.catalogSha256;
        const quoteCatalog = buildEvidenceQuoteCatalog(segmentCatalog.segments); const quoteCatalogPath = path.join(derivedFolder, "evidence-quote-catalog.jsonl"); if (!fs.existsSync(quoteCatalogPath)) fs.writeFileSync(quoteCatalogPath, quoteCatalogJsonl(quoteCatalog), "utf8"); if (!fs.existsSync(path.join(derivedFolder, "evidence-quote-catalog-receipt.json"))) durableJsonWriteV0324(path.join(derivedFolder, "evidence-quote-catalog-receipt.json"), { schemaVersion: "jaa-evidence-quote-catalog-receipt-v1", catalogVersion: quoteCatalog.catalogVersion, quoteCount: quoteCatalog.quoteCount, catalogSha256: quoteCatalog.catalogSha256, createdAtUtc: now() });
        const quoteMap = buildModelVisibleEvidenceQuoteMapV0329(compact.payload.eventCount, segmentCatalog, quoteCatalog);
        const modelPayload = projectModelPayloadV0329(compact.payload, segmentCatalog, quoteMap); const modelPayloadPath = path.join(derivedFolder, "model-analysis-payload.json");
        if (!fs.existsSync(modelPayloadPath)) durableJsonWriteV0324(modelPayloadPath, modelPayload);
        const quoteMapPath = path.join(derivedFolder, "model-visible-evidence-quote-map.json"); if (!fs.existsSync(quoteMapPath)) durableJsonWriteV0324(quoteMapPath, quoteMap);
        const quoteCoverage = validateModelVisibleQuoteCoverageV0329({ runId, payload: modelPayload, quoteMap, segments: segmentCatalog, catalog: quoteCatalog });
        const quoteCoveragePath = path.join(ensureDir(path.join(stagingFolder, "progress")), "model-visible-evidence-quote-receipt.json"); durableJsonWriteV0324(quoteCoveragePath, quoteCoverage);
        run.modelVisibleQuoteMapPath = quoteMapPath; run.modelVisibleQuoteCoverageReceiptPath = quoteCoveragePath; run.modelVisibleQuoteCount = quoteCoverage.modelVisibleQuoteCount; run.modelVisibleQuoteCoveragePassed = quoteCoverage.coveragePassed;
        const enrichmentFolder = ensureDir(path.join(stagingFolder, "report-enrichment")); const issueKeys = compact.payload.records.map((record) => record.issueKey);
        const currentStateSetting = environment.values.LOCAL_DB_PATH || environment.values.LOCAL_DATABASE_PATH;
        let enrichment = buildRunIssueSnapshots(issueKeys, () => null, { sourceDatabaseIdentity: null });
        if (currentStateSetting) try { enrichment = loadRunIssueSnapshotsFromSqlite(resolveConfiguredPath(currentStateSetting, ""), issueKeys); }
        catch (snapshotError) { enrichment.receipt.diagnostics.push(`ISSUE_SNAPSHOT_DATABASE_READ_FAILED:${snapshotError instanceof Error ? snapshotError.message : String(snapshotError)}`); }
        const snapshotProfiles = buildIssueSnapshotProfilesV0324({ jiraServerIdentity: dataset.jiraServerFingerprint || dataset.jiraServerHost, issueKeys, snapshots: enrichment.snapshots, capturedAt: enrichment.receipt.capturedAt, sourceDatabaseIdentity: enrichment.receipt.sourceDatabaseIdentity });
        const issueSnapshotPath = path.join(enrichmentFolder, "issue-snapshot-profile.json"); if (!fs.existsSync(issueSnapshotPath)) durableJsonWriteV0324(issueSnapshotPath, { schemaVersion: "jaa-issue-snapshot-profile-collection-v1", snapshots: snapshotProfiles });
        const issueSnapshotReceiptPath = path.join(enrichmentFolder, "issue-snapshot-profile-receipt.json"); if (!fs.existsSync(issueSnapshotReceiptPath)) durableJsonWriteV0324(issueSnapshotReceiptPath, { schemaVersion: "jaa-issue-snapshot-profile-receipt-v1", contractVersion: "jaa-issue-snapshot-profile-v1", uniqueIssueCount: snapshotProfiles.length, sourceDatabaseIdentity: enrichment.receipt.sourceDatabaseIdentity, capturedAt: enrichment.receipt.capturedAt, fieldStateCounts: snapshotProfiles.flatMap((snapshot) => [snapshot.issueId, snapshot.project, snapshot.issueType, snapshot.priority, snapshot.status, snapshot.summary, snapshot.resolution, snapshot.created, snapshot.updated, snapshot.resolved, snapshot.startDate, snapshot.dueDate, snapshot.labels, snapshot.components, snapshot.fixVersions, snapshot.affectedVersions, snapshot.assigneeRef, snapshot.reporterRef, snapshot.creatorRef, snapshot.snapshotFields.rootCause]).reduce((counts, field) => ({ ...counts, [field.state]: ((counts as Record<string, number>)[field.state] ?? 0) + 1 }), {} as Record<string, number>) });
        run.issueSnapshotPath = issueSnapshotPath; run.issueSnapshotReceiptPath = issueSnapshotReceiptPath; run.uniqueIssueCount = snapshotProfiles.length; run.reportEnrichmentWarnings = enrichment.warning ? [enrichment.warning] : [];
        runStagingFolder = stagingFolder;
        const compactArtifact = resumedRun && run.compactPayloadPath && run.compactPayloadSha256 && run.compactPayloadSizeBytes !== null && run.compactPayloadSizeBytes !== undefined ? { filePath: run.compactPayloadPath, sha256: run.compactPayloadSha256, sizeBytes: run.compactPayloadSizeBytes } : atomicExport(path.join(derivedFolder, "compact-analysis-payload.json"), compact.json);
        run.compactPayloadPath = compactArtifact.filePath; run.compactPayloadSha256 = compactArtifact.sha256; run.compactPayloadSizeBytes = compactArtifact.sizeBytes;
        run.progress.payloadRecordCount = compact.payload.eventCount; run.progress.mainPayloadCount = 1; run.progress.rulesTransmissionCount = 1; run.progress.stage = "preparing_artifacts"; run.progress.message = "Preparing Decision v4, Evidence Segments, and Report Data Package contracts.";
        const templateSource = run.rules.htmlReportTemplate?.fullPath; if (!templateSource) throw new AiAnalysisError("AI_HTML_TEMPLATE_MISSING", "Verified v0.3.24 HTML Template is required.");
        const templateFolder = ensureDir(path.join(stagingFolder, "template-snapshots")); const frozenTemplatePath = path.join(templateFolder, path.basename(templateSource));
        if (!fs.existsSync(frozenTemplatePath)) { const sourceBytes = fs.readFileSync(templateSource); fs.writeFileSync(frozenTemplatePath, sourceBytes, { flag: "wx" }); if (!fs.readFileSync(frozenTemplatePath).equals(sourceBytes)) throw new AiAnalysisError("AI_HTML_TEMPLATE_HASH_MISMATCH", "Frozen Template bytes changed."); }
        run.htmlTemplateSnapshotPath = frozenTemplatePath; run.htmlRendererVersion = HTML_RENDERER_VERSION_V0333; run.htmlRenderStatus = "not_started";
        const request = resumedRun ? loadRequestPackage(stagingFolder) : buildRequestPackage({ runId, runDirectory: stagingFolder, dataset, rules: run.rules, selectedRecordCount: compact.payload.eventCount, modelInputJsonPath: modelPayloadPath, supplementalInstruction: run.supplementalInstruction ?? undefined, instructionMode: run.instructionMode, userAdditionalInstruction: run.userAdditionalInstruction ?? undefined, userCustomInstruction: run.userCustomInstruction ?? undefined });        const artifactPaths = createArtifactWorkspaces(stagingFolder);
        run.artifactPaths = { input: artifactPaths.input, output: artifactPaths.output, canonical: artifactPaths.canonical, logs: artifactPaths.logs };
        run.expectedDecisionCount = compact.payload.eventCount; run.receivedDecisionCount = 0; run.canonicalRecordCount = 0; run.finalAcceptedRecordCount = 0;
        run.requestPackage = request.requestPackage; run.instructionComposition = request.requestPackage.instructionComposition ?? null; run.promptTemplateVersion = request.requestPackage.coreInstructionVersion; run.promptSha256 = request.requestPackage.finalProviderPayloadSha256; run.outputSchemaName = request.requestPackage.decisionContractVersion ?? "unknown"; run.outputSchemaSha256 = request.requestPackage.outputSchemaSha256; run.outputSchemaBytesUtf8 = Buffer.byteLength(fs.readFileSync(path.join(stagingFolder, "control", "output-schema.json"))); run.outputSchemaValidation = null;
        const archive = runArchives.get(runId); if (!resumedRun) archive?.append("system_event", "APP_ONLY", "Artifact Request Package prepared before Provider dispatch.", { deliveryMode: request.requestPackage.deliveryMode, documentCount: request.requestPackage.documents.length, outputWorkspace: "ai-output", finalResponseMode: "brief_text" }); archive?.writeManifest(run);
        run.progress.stage = "preflighting_capacity";
        const capability = run.capacitySnapshot ? null : await chatgpt.readSelectedModelCapacity();
        const rulesBytes = request.requestPackage.documents.filter((item) => ["COMMON_RULES", "SKILL_CATALOG", "RULE_SET_MANIFEST_OR_SCORING_RULES"].includes(item.role)).reduce((sum, item) => sum + item.snapshotByteLength, 0);
        const pendingBytes = request.requestPackage.documents.find((item) => item.role === "PENDING_ANALYSIS_JSON")?.snapshotByteLength ?? compact.sizeBytes;
        const capacitySnapshot = run.capacitySnapshot ?? buildCapacityCalculationSnapshot({ capacity: { providerId: capability!.providerId, providerDisplayName: capability!.providerDisplayName, modelId: capability!.modelId, modelDisplayName: capability!.modelDisplayName, source: capability!.capacitySource, status: capability!.capacitySourceStatus, tokens: capability!.capacityTokens, rawSanitized: capability!.capacityRawResponseSanitized }, rulesBytesUtf8: rulesBytes, pendingPayloadBytesUtf8: pendingBytes, wrapperInstructionsBytesUtf8: request.requestPackage.finalProviderPayloadBytes, finalSerializedPromptBytesUtf8: request.requestPackage.finalProviderPayloadBytes, recordCount: compact.payload.eventCount });
        const warningCode = capacityWarning(capacitySnapshot); const snapshotHash = capacitySnapshotHash(capacitySnapshot);
        if (!resumedRun) atomicExport(path.join(stagingFolder, "capacity-snapshot.json"), JSON.stringify(capacitySnapshot, null, 2));
        run.capacitySnapshot = capacitySnapshot; run.capacityWarningCode = warningCode; run.capacitySnapshotHash = snapshotHash;
        run.capacityPreflight = { inputEstimateTokens: capacitySnapshot.estimatedFinalInputTokens, modelCapacityTokens: capacitySnapshot.capacityTokens, reservedOutputTokens: capacitySnapshot.estimatedVisibleOutputReserveTokens, safetyMarginTokens: capacitySnapshot.safetyMarginTokens, requiredContextTokens: capacitySnapshot.estimatedRequiredTotalTokens };
        run.progress.usage.estimatedInputTokens = capacitySnapshot.estimatedFinalInputTokens; dispatchGuard.register(runId, Boolean(warningCode));
        if (warningCode && !payload.capacityConfirmation) {
          run.status = "queued"; run.progress.status = "queued"; run.progress.stage = "waiting_capacity_confirmation"; run.progress.message = "Capacity telemetry requires one explicit confirmation before the single artifact-producing turn.";
          run.capacityConfirmation = { analysisRunId: runId, warningCode, capacitySnapshotHash: snapshotHash, confirmedAt: null, confirmationAction: "pending" }; analysisUserActions.push(`${now()} Capacity warning shown: ${runId} ${warningCode}`); archive?.writeManifest(run); return { ok: false, requiresCapacityConfirmation: true, warningCode, capacitySnapshot, capacitySnapshotHash: snapshotHash, run, snapshot: snapshot() };
        }
        if (warningCode) { dispatchGuard.confirm(runId); run.capacityConfirmation = { analysisRunId: runId, warningCode, capacitySnapshotHash: snapshotHash, confirmedAt: now(), confirmationAction: "confirmed" }; analysisUserActions.push(`${run.capacityConfirmation.confirmedAt} Capacity warning confirmed: ${runId}`); }
        if (!dispatchGuard.begin(runId)) return { ok: false, run, snapshot: snapshot(), alreadyDispatching: true };
        archive?.append("prepared_message", "APP_ONLY", request.prompt, { dispatchStatus: "prepared", visibleToProvider: false, deliveryMode: request.requestPackage.deliveryMode, workspaceFileCount: 4, outputWorkspace: "ai-output", inlineFileContentCount: 0, nativeInputFileCount: 0, payloadSha256: request.requestPackage.finalProviderPayloadSha256 }); dispatchLedgers.get(runId)?.append("prepared", { at: now(), instructionSha256: request.requestPackage.finalProviderPayloadSha256, idempotencyKey: "provider_request_prepared" }); preparedProviderMessages.set(runId, { prompt: request.prompt, payloadSha256: request.requestPackage.finalProviderPayloadSha256, deliveryMode: request.requestPackage.deliveryMode }); archive?.writeManifest(run);
        run.status = "running"; run.progress.status = "running"; run.progress.stage = "starting_thread"; run.progress.message = "Dispatching one artifact-producing ChatGPT thread and one turn.";
        run.telemetry = { runCreatedAt: startedAt, inputPreparedAt: now(), providerRequestPreparedAt: now(), providerDispatchAttemptedAt: null, providerContactedAt: null, threadCreatedAt: null, turnStartAttemptedAt: null, turnAcceptedAt: null, turnCompletedAt: null, providerDurationMs: null, localOrchestrationMs: null, durableLoggingMs: null, validationMs: null, canonicalAssemblyMs: null, sqliteWriteMs: null };
        requestEvidence = { runId, model: chatgpt.getStatus().selectedModel, deliveryMode: request.requestPackage.deliveryMode, workspaceFileCount: 4, outputWorkspace: "ai-output", inlineFileContentCount: 0, nativeInputFileCount: 0, instructionSha256: request.requestPackage.finalProviderPayloadSha256, instructionBytes: request.requestPackage.finalProviderPayloadBytes, finalAssistantResponse: "brief_text", authorization: "[masked]" };
        const dispatchIdentityReceipt = validateDispatchIdentityV0333({
          applicationVersion: request.requestPackage.applicationVersion ?? __MAIN_APP_VERSION__,
          promptIdentity: request.requestPackage.promptIdentity ?? "",
          promptTemplateVersion: request.requestPackage.promptTemplateVersion ?? "",
          decisionContract: request.requestPackage.decisionContractVersion ?? "",
          qualityContract: request.requestPackage.qualityContractVersion ?? "",
          bridgeIdentity: request.requestPackage.bridgeIdentity ?? "",
          providerTransport: request.requestPackage.modelInputTransport ?? "",
          outputSchemaSha256: request.requestPackage.outputSchemaSha256,
          expectedOutputSchemaSha256: request.requestPackage.decisionContractSha256 ?? "",
          rulesSnapshotId: run.rules.snapshotId ?? run.rules.ruleSetId,
          requestRulesSnapshotId: request.requestPackage.rulesSnapshotId ?? ""
        });
        durableJsonWriteV0324(path.join(stagingFolder, "progress", "dispatch-identity-receipt.json"), dispatchIdentityReceipt);
        notify(event);
        let timeout: ReturnType<typeof setTimeout> | null = null;
        const providerPromise = chatgpt.runAnalysis({ runId, requestPurpose: run.instructionMode === "CUSTOM_DIAGNOSTIC" ? "CUSTOM_DIAGNOSTIC" : "FORMAL_ANALYSIS", instructionMode: run.instructionMode, prompt: request.prompt, model: chatgpt.getStatus().selectedModel, deliveryMode: "LOCAL_FILE_WORKSPACE", runDirectory: stagingFolder, workspacePath: request.workspace, outputWorkspacePath: request.output, allowedReadRoots: [request.workspace], finalProviderPayloadSha256: request.requestPackage.finalProviderPayloadSha256, outputSchema: null, outputSchemaSha256: request.requestPackage.outputSchemaSha256, requestPackage: request.requestPackage, rulesSnapshotId: run.rules.snapshotId ?? run.rules.ruleSetId, catalogSkillIds: run.rules.catalog.map((item) => item.id), analysisAttemptId: attempt.analysisAttemptId, requestId: runId, manifestSha256: run.rules.roleDocuments?.find((item) => item.role === "manifest")?.sha256, commonRulesSha256: run.rules.roleDocuments?.find((item) => item.role === "common_rules")?.sha256, catalogSha256: run.rules.roleDocuments?.find((item) => item.role === "catalog")?.sha256, quoteCatalog, evidenceSegments: segmentCatalog.segments }, controller.signal);
        const timeoutPromise = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new AiAnalysisError("AI_PROVIDER_TIMEOUT", `Provider exceeded the ${PROVIDER_HARD_TIMEOUT_MS} ms hard timeout. No retry or repair was started.`)); }, PROVIDER_HARD_TIMEOUT_MS); timeout.unref?.(); });
        let response: Awaited<typeof providerPromise>; try { response = await Promise.race([providerPromise, timeoutPromise]); } finally { if (timeout) clearTimeout(timeout); }
        providerVisibleResponse = response.text; run.threadId = response.threadId; run.providerRuntimeVersion = response.runtimeVersion; run.turnId = response.turnId; run.progress.threadCount = run.progress.threadCreatedCount ?? 0; run.progress.turnCount = run.progress.acceptedTurnCount ?? 0; run.bridgeEvidence = response.bridgeEvidence ?? chatgpt.getBridgeEvidence(runId); run.lifecycle = run.bridgeEvidence?.lifecycle ?? null;
        run.progress.usage = { ...response.usage, availability: response.tokenTelemetry.availability, estimatedInputTokens: null, turnCumulative: response.tokenTelemetry.turnCumulative, lastModelCall: response.tokenTelemetry.lastModelCall, modelContextWindow: response.tokenTelemetry.modelContextWindow, maxObservedSingleCallTokens: response.tokenTelemetry.maxObservedSingleCallTokens, maxObservedContextUtilizationPercent: response.tokenTelemetry.maxObservedContextUtilizationPercent, usageEventCount: response.tokenTelemetry.usageEventCount, telemetryAnomalies: response.tokenTelemetry.anomalies }; run.telemetry.providerDurationMs = response.elapsedMs; run.telemetry.turnCompletedAt = now();
        if (response.elapsedMs >= PROVIDER_PERFORMANCE_WARNING_MS) run.anomalyWarnings = ["AI_PROVIDER_PERFORMANCE_WARNING"];
        // The Bridge is the only formal artifact writer; provider prose is preserved separately as conversation evidence.
        const logFlushStarted = Date.now(); archive?.flush("provider_completed"); run.telemetry.durableLoggingMs = Date.now() - logFlushStarted; run.telemetry.logsFlushedAt = now();
        verifyInputWorkspaceUnchanged(stagingFolder, request.requestPackage.documents);
        const deliveryEvidence = chatgpt.getBridgeEvidence(runId);
        if (!deliveryEvidence?.modelDeliveryReceipt) throw new AiAnalysisError("AI_MODEL_INPUT_DELIVERY_INCOMPLETE", "A complete Model Delivery Receipt is required.");
        if (run.instructionMode === "CUSTOM_DIAGNOSTIC") {
          const customText = redactChatGptTextComplete(response.text).trim();
          if (!customText) throw new AiAnalysisError("AI_PROVIDER_RESPONSE_EMPTY", "Custom diagnostic returned no final response.");
          const customArtifact = atomicExport(path.join(stagingFolder, "ai-output", "custom-response.md"), customText + "\n");
          const finalArtifact = atomicExport(path.join(stagingFolder, "ai-output", "final-assistant-message.txt"), customText + "\n");
          run.finalAssistantMessage = customText; run.finalAssistantMessagePath = finalArtifact.filePath; run.analysisReportPath = customArtifact.filePath; run.analysisReportContent = customText;
          run.status = "completed"; run.progress.status = "completed"; run.progress.stage = "completed"; run.progress.message = "Custom diagnostic completed. No canonical result or SQLite write was created."; run.completedAt = now(); run.databaseWriteStatus = "Not applicable - CUSTOM_DIAGNOSTIC is never SQLite eligible"; run.sqliteCommittedRecordCount = 0; run.formalArtifactRecordCount = 0; run.finalAcceptedRecordCount = 0;
          run.validationGate = { passed: true, inputCount: run.selectedDiffIds.length, outputCount: 0, missingStableIds: [], duplicateStableIds: [], unexpectedStableIds: [], catalogInvalidSkillIds: [], formalJsonAllowed: false, goldenHtmlAllowed: false, sqliteAllowed: false };
          chatgpt.advanceBridgeLifecycle(runId, "RUN_COMPLETED", "completed"); run.bridgeEvidence = chatgpt.getBridgeEvidence(runId); run.lifecycle = run.bridgeEvidence?.lifecycle ?? run.lifecycle ?? null; persistRunDebugEvidence(stagingFolder, run, requestEvidence, { text: customText, finalAssistantMessagePath: finalArtifact.filePath, customResponsePath: customArtifact.filePath }, [{ at: run.startedAt, type: "custom_diagnostic_started" }, { at: run.completedAt, type: "custom_diagnostic_completed" }], analysisUserActions); archive?.append("artifact_event", "APP_ONLY", "Custom diagnostic response persisted without formal artifacts or SQLite.", { customResponsePath: customArtifact.filePath, finalAssistantMessagePath: finalArtifact.filePath }); archive?.writeManifest(run);
          return { ok: true, run, snapshot: snapshot(), formalArtifactEligible: false, sqliteEligible: false };
        }
        run.progress.stage = "waiting_artifacts"; const artifacts = readPublishedArtifacts(artifactPaths); run.analysisReportPath = artifacts.reportText ? artifactPaths.report : null;
        const bridgeSnapshot = chatgpt.getBridgeEvidence(runId); run.bridgeEvidence = bridgeSnapshot; run.lifecycle = bridgeSnapshot?.lifecycle ?? run.lifecycle ?? null;
        if (!bridgeSnapshot?.sourceInputReceipt || !bridgeSnapshot?.modelDeliveryReceipt || bridgeSnapshot.lifecycle.inputStatus !== "ready") throw new AiAnalysisError("AI_INPUT_RECEIPT_INCOMPLETE", "A complete Bridge Input Receipt is required.");
        if (!bridgeSnapshot.lifecycle.analysisCompleted || bridgeSnapshot.lifecycle.completedCount !== compact.payload.eventCount || bridgeSnapshot.lifecycle.decisionPreparedCount !== compact.payload.eventCount) throw new AiAnalysisError("AI_ANALYSIS_INCOMPLETE", "Authoritative ANALYSIS_COMPLETED exact-count evidence is missing.");
        if (!bridgeSnapshot.artifactReceipt || bridgeSnapshot.lifecycle.artifactStatus !== "published") throw new AiAnalysisError("AI_ARTIFACT_RECEIPT_INVALID", "Published Artifact Receipt is missing or invalid.");
        run.analysisReportContent = artifacts.reportText; run.finalAssistantMessage = artifacts.finalText; run.finalAssistantMessagePath = artifacts.finalText ? artifactPaths.finalMessage : null;
        const raw = stageVisibleProviderResponse(stagingFolder, response.text); run.providerResponseRawPath = raw.rawFilePath; run.providerResponseGzipPath = raw.filePath; run.providerResponseSha256 = raw.rawSha256; run.providerResponseGzipSha256 = raw.gzipSha256;
        const validationStarted = Date.now(); run.status = "validating"; run.progress.status = "validating"; run.progress.stage = "validating_artifacts_v0316";
        const validated = parseAndValidateDecisionsV0324(artifacts.decisionsText, { recordCount: compact.payload.eventCount, catalogSkillIds: run.rules.catalog.map((item) => item.id), sourceRecordStableIds: compact.payload.records.map((record) => record.sourceRecordStableId), evidenceSegments: segmentCatalog.segments });
        const persistedSubmission = loadPersistedSubmissionV0332(stagingFolder);
        writeArtifactSubmissionResultV0332({ runDirectory: stagingFolder, runId, submissionSha256: persistedSubmission.submissionSha256, formalArtifactStatus: "pending_validation" });
        const quality = evaluateDecisionQualityV0333({ decisions: persistedSubmission.decisions, quoteCatalog, catalog: run.rules.catalog, legacyValidation: validated.validation }); const allFindings: ValidationFindingV0324[] = [...validated.validation.findings, ...quality.findings];
        const systemicGate = evaluateSystemicNoResultGateV0329(validated.validation.decisions, { sourceDatasetSha256: dataset.sourceFileSha256, decisionSha256: artifacts.hashes.decisions, quoteCatalogSha256: quoteCatalog.catalogSha256 });
        const systemicGatePath = path.join(artifactPaths.canonical, "systemic-no-result-gate-report.json"); durableJsonWriteV0324(systemicGatePath, systemicGate); run.systemicNoResultGate = systemicGate; run.systemicNoResultGateReportPath = systemicGatePath;
        run.receivedDecisionCount = validated.validation.actualCount; run.providerReturnedRecordCount = validated.validation.actualCount; run.parsedRecordCount = validated.validation.actualCount; run.schemaValidRecordCount = validated.validation.schemaValid ? validated.validation.actualCount : 0; run.semanticValidRecordCount = validated.validation.semanticValidCount; run.progress.resultRecordCount = validated.validation.actualCount; run.progress.completedDiffs = validated.validation.actualCount;
        run.qualityGate = { contractVersion: quality.contractVersion, status: quality.status, warnings: quality.warnings, blockers: quality.blockers, metrics: quality.metrics };
        const validationFolder = ensureDir(path.join(artifactPaths.canonical, "validation"));
        durableJsonWriteV0324(path.join(validationFolder, "schema-findings.json"), validated.validation.schemaFindings);
        durableJsonWriteV0324(path.join(validationFolder, "semantic-findings.json"), validated.validation.semanticFindings);
        durableJsonWriteV0324(path.join(validationFolder, "evidence-findings.json"), validated.validation.evidenceFindings);
        durableJsonWriteV0324(path.join(validationFolder, "quality-findings.json"), quality.findings);
        durableJsonWriteV0324(path.join(validationFolder, "validation-summary.json"), { schemaVersion: "jaa-aggregated-validation-summary-v1", runId, valid: validated.validation.valid && quality.status !== "BLOCKED", schemaValid: validated.validation.schemaValid, semanticValid: validated.validation.semanticValid, evidenceValid: validated.validation.evidenceValid, attributionValid: validated.validation.attributionValid, qualityStatus: quality.status, expectedCount: validated.validation.expectedCount, actualCount: validated.validation.actualCount, findingCount: allFindings.length, generatedAt: now() });
        const qualityArtifact = durableJsonWriteV0324(path.join(artifactPaths.canonical, "quality-gate-report.json"), { ...quality, runId, generatedAt: now() }); run.qualityGateReportPath = qualityArtifact.filePath;
        atomicWriteCanonical(artifactPaths.validationReport, { schemaVersion: "jaa-aggregated-validation-report-v1", runId, sourceSha256: dataset.sourceFileSha256, rulesSnapshotId: run.rules.snapshotId ?? run.rules.ruleSetId, decisionSha256: artifacts.hashes.decisions, expectedCount: compact.payload.eventCount, actualCount: validated.validation.actualCount, schemaValid: validated.validation.schemaValid, semanticValid: validated.validation.semanticValid, evidenceValid: validated.validation.evidenceValid, attributionValid: validated.validation.attributionValid, qualityStatus: quality.status, findings: allFindings, distribution: validated.validation.distribution, reportPresent: Boolean(artifacts.reportText), finalMessagePresent: Boolean(artifacts.finalText), validatedAt: now(), validationDurationMs: Date.now() - validationStarted }); run.validationReportPath = artifactPaths.validationReport;
        notify(event);
        const buildDiagnosticResults = (): AiAnalysisRun["results"] => compact.payload.records.map((source, index) => { const decision = validated.validation.decisions[index]; return { resultId: `diagnostic_${index}`, sourceDiffId: source.sourceRecordStableId, sourceContentHash: source.sourceContentHash, sourceEvidenceSnapshot: { issueKey: source.issueKey, actor: source.actor, eventTimestamp: source.eventTimestamp, fieldName: source.fieldName, sourceProvenance: source.sourceProvenance, addedText: source.addedText, removedText: source.removedText }, evidenceRefs: [source.evidenceId], recordIndex: index, sourceRecordStableId: source.sourceRecordStableId, activityEventId: source.activityEventId, evidenceId: source.evidenceId, decisionConfidence: decision?.confidence ?? 0, decisionRationale: decision?.rationale ?? "Validation failed before canonical assembly.", recordNegativeChecks: decision?.recordNegativeChecks ?? [], derivedSkillIds: decision?.skillFindings.map((finding) => finding.skillId) ?? [], issueSnapshotReference: (() => { const snapshot = snapshotProfiles.find((item) => item.normalizedIssueKey === source.issueKey.trim().toUpperCase()); return snapshot ? { snapshotId: snapshot.snapshotId, snapshotSha256: snapshot.snapshotSha256, jiraServerIdentity: snapshot.jiraServerIdentity, normalizedIssueKey: snapshot.normalizedIssueKey } : null; })(), candidates: (decision?.skillFindings ?? []).map((finding) => ({ skillId: finding.skillId, skillName: run.rules.catalog.find((skill) => skill.id === finding.skillId)?.name ?? finding.skillId, group: run.rules.catalog.find((skill) => skill.id === finding.skillId)?.group ?? "Unknown", score: Math.round(finding.confidence * 100), confidence: finding.confidence, positiveEvidenceRefs: finding.evidenceQuotes.map((quote) => quote.evidenceRef), negativeEvidenceRefs: [], evidenceQuotes: finding.evidenceQuotes, matchedRuleIds: [], reason: finding.rationale, status: "PENDING_REVIEW" })), status: "NEEDS_REVIEW", analyzerVersion: model, requestTraceId: response.requestId, usage: run.progress.usage, rawResultAvailable: true, reviewNote: "", reviewedAt: null }; });
        if (!validated.validation.valid || quality.status === "BLOCKED" || systemicGate.decision === "BLOCKED") {
          chatgpt.advanceBridgeLifecycle(runId, "VALIDATION_COMPLETED", "failed"); const diagnosticResults = buildDiagnosticResults();
          const diagnosticPackage = buildReportDataPackageV0324({ mode: "DIAGNOSTIC_NON_CANONICAL", run, rules: run.rules, results: diagnosticResults, segments: segmentCatalog.segments, issueSnapshots: snapshotProfiles, validationFindings: allFindings, quality, inputReceipts: [bridgeSnapshot.sourceInputReceipt, bridgeSnapshot.modelDeliveryReceipt].filter(Boolean) });
          const diagnosticPackagePath = path.join(artifactPaths.canonical, "diagnostic-report-data-package.json"); const diagnosticWritten = durableJsonWriteV0324(diagnosticPackagePath, diagnosticPackage); run.diagnosticReportDataPackagePath = diagnosticWritten.filePath; run.reportPackageMode = "DIAGNOSTIC_NON_CANONICAL"; run.databaseWriteStatus = "Not written - diagnostic package is never SQLite eligible";
          try { const rendered = renderReportDataPackageHtmlV0333({ reportDataPackagePath: diagnosticPackagePath, templatePath: run.htmlTemplateSnapshotPath!, outputDirectory: artifactPaths.canonical, renderTrigger: "DIAGNOSTIC_AFTER_REJECTION" }); run.diagnosticReportFilePath = rendered.receipt.outputHtmlPath; run.reportFilePath = rendered.receipt.outputHtmlPath; run.htmlRenderReceiptPath = rendered.receiptPath; run.htmlRenderStatus = "completed"; } catch (renderError) { run.htmlRenderStatus = "failed"; run.htmlRenderDiagnosticsPath = String(renderError); }
          const first = allFindings.find((finding) => finding.severity === "ERROR");
          const failedValidationStage: ValidationStageV0332 = quality.status === "BLOCKED" ? "QUALITY_GATE" : !validated.validation.schemaValid ? "DECISION_SCHEMA" : !validated.validation.evidenceValid ? "EVIDENCE_QUOTE_REFERENCE" : !validated.validation.semanticValid ? "STATUS_SEMANTIC" : "QUALITY_GATE";
          const rootCode = (quality.status === "BLOCKED" ? "AI_DECISION_QUALITY_GATE_BLOCKED" : systemicGate.reasonCode ?? "AI_RESPONSE_SEMANTIC_VALIDATION_FAILED") as AiAnalysisErrorCode;
          writeValidationStageReceiptsV0333({ runDirectory: stagingFolder, inputHash: persistedSubmission.submissionSha256, failedStage: failedValidationStage, rootErrorCode: rootCode, findings: allFindings });
          writeArtifactSubmissionResultV0332({ runDirectory: stagingFolder, runId, submissionSha256: persistedSubmission.submissionSha256, formalArtifactStatus: "rejected", rootErrorCode: rootCode });
          const affected = new Set(quality.findings.filter((finding) => finding.severity === "ERROR").map((finding) => finding.recordIndex).filter((value) => value !== null));
          throw new AiAnalysisError(rootCode, quality.status === "BLOCKED" ? "MULTI_SKILL_EXCLUSIVE_PRIMARY_QUOTE_MISSING blockers=" + quality.findings.filter((finding) => finding.severity === "ERROR").length + " affectedRecords=" + affected.size + " firstRecordIndex=" + (first?.recordIndex ?? "unavailable") + " firstSkillId=" + (first?.skillId ?? "unavailable") + "; submission persisted, formal Artifact rejected, Canonical not created, Diagnostic HTML created; aggregate=" + run.qualityGateReportPath : systemicGate.reasonCode ? "Systemic no-result gate blocked formal publication: " + systemicGate.reasonCode + "." : first ? first.code + " " + first.jsonPointer + ": " + first.message : "Aggregated validation failed.");
        }
        chatgpt.advanceBridgeLifecycle(runId, "VALIDATION_COMPLETED", "completed"); run.bridgeEvidence = chatgpt.getBridgeEvidence(runId); run.lifecycle = run.bridgeEvidence?.lifecycle ?? run.lifecycle ?? null;
        run.telemetry.validationMs = Date.now() - validationStarted; const assemblyStarted = Date.now(); run.progress.stage = "assembling_canonical";
        run.results = assembleCanonicalResultsV0324({ runId, compact: compact.payload, decisions: validated.validation.decisions, rules: run.rules, analyzerVersion: model, jiraServerIdentity: dataset.jiraServerFingerprint || dataset.jiraServerHost, requestTraceId: response.requestId, usage: run.progress.usage, snapshotReferences: new Map(snapshotProfiles.map((snapshot) => [snapshot.normalizedIssueKey, { snapshotId: snapshot.snapshotId, snapshotSha256: snapshot.snapshotSha256, jiraServerIdentity: snapshot.jiraServerIdentity, normalizedIssueKey: snapshot.normalizedIssueKey }])) }); run.canonicalRecordCount = run.results.length; run.progress.resultRecordCount = run.results.length; run.progress.completedDiffs = run.results.length; run.uniqueIssueCount = snapshotProfiles.length;
        validated.validation.warnings.push(...compareAnalysisReportCounts(artifacts.reportText, validated.validation.distribution));
        run.anomalyWarnings = [...new Set([...(run.anomalyWarnings ?? []), ...validated.validation.warnings, ...quality.warnings, ...artifacts.warnings])]; const warningGate = warningPersistenceGate({ structuralValidationPassed: true, warnings: run.anomalyWarnings });
        const systemicReview = systemicGate.decision === "WARNING_REVIEW"; run.status = warningGate.requiresHumanAcceptance || systemicReview ? "completed_with_quality_warnings" : "completed"; run.progress.status = run.status; run.finalAcceptedRecordCount = warningGate.sqliteEligible && systemicGate.sqliteAllowed ? run.results.length : 0; run.databaseWriteStatus = warningGate.sqliteEligible && systemicGate.sqliteAllowed ? "Eligible - awaiting local commit" : systemicReview ? "Not written - systemic all-UNKNOWN review requires explicit acceptance" : `Not written - manual acceptance required for ${warningGate.pendingWarnings.join(", ")}`; run.completedAt ??= now();
        const canonicalDocument = { schemaName: "JiraActivityAnalyzerAnalyzedActivityEvents", schemaVersion: "0.3.24-v1", canonicalContractVersion: "jaa-canonical-analysis-result-v5", run }; const canonicalArtifact = atomicWriteCanonical(artifactPaths.canonicalResult, canonicalDocument); run.analyzedFilePath = canonicalArtifact.filePath; run.analyzedFileSizeBytes = canonicalArtifact.sizeBytes; run.analyzedFileSha256 = canonicalArtifact.sha256; run.formalArtifactRecordCount = run.results.length; run.telemetry.canonicalAssemblyMs = Date.now() - assemblyStarted; run.telemetry.canonicalOutputCompletedAt = now(); chatgpt.advanceBridgeLifecycle(runId, "CANONICAL_ASSEMBLY_COMPLETED", "completed"); run.bridgeEvidence = chatgpt.getBridgeEvidence(runId); run.lifecycle = run.bridgeEvidence?.lifecycle ?? run.lifecycle ?? null;
        if (systemicGate.activeResultAllowed) resultRegistry.activateRun(run, "ANALYSIS_RUN");
        selectedCanonicalAiRunDirectory = run.runDirectory ?? null;
        const formalPackage = buildReportDataPackageV0324({ mode: "FORMAL_CANONICAL", run, rules: run.rules, results: run.results, segments: segmentCatalog.segments, issueSnapshots: snapshotProfiles, validationFindings: allFindings, quality, canonicalSha256: canonicalArtifact.sha256, inputReceipts: [run.bridgeEvidence?.sourceInputReceipt, run.bridgeEvidence?.modelDeliveryReceipt].filter(Boolean) }); const formalPackagePath = path.join(artifactPaths.canonical, "report-data-package.json"); const formalWritten = durableJsonWriteV0324(formalPackagePath, formalPackage); run.reportDataPackagePath = formalWritten.filePath; run.reportDataPackageSha256 = formalPackage.packageSha256; run.reportPackageMode = "FORMAL_CANONICAL";
        try { run.progress.stage = "rendering_html"; const rendered = renderReportDataPackageHtmlV0333({ reportDataPackagePath: formalPackagePath, templatePath: run.htmlTemplateSnapshotPath!, outputDirectory: artifactPaths.canonical, renderTrigger: "AUTO_AFTER_CANONICAL" }); run.reportFilePath = rendered.receipt.outputHtmlPath; run.reportFileSizeBytes = rendered.receipt.outputHtmlSizeBytes; run.reportFileSha256 = rendered.receipt.outputHtmlSha256; run.htmlRenderReceiptPath = rendered.receiptPath; run.htmlRendererVersion = HTML_RENDERER_VERSION_V0333; run.htmlRenderStatus = "completed"; getChatGptService().setBridgeHtmlRenderStatus(run.runId, "completed"); if (run.lifecycle) run.lifecycle.htmlRenderStatus = "completed"; } catch (htmlError) { const failure = htmlError as { failureReceiptPath?: string }; run.htmlRenderStatus = "failed"; run.htmlRenderReceiptPath = failure.failureReceiptPath ?? null; run.htmlRenderDiagnosticsPath = failure.failureReceiptPath ?? (htmlError instanceof Error ? htmlError.message : String(htmlError)); run.anomalyWarnings = [...new Set([...(run.anomalyWarnings ?? []), "AI_HTML_RENDER_FAILED:" + (htmlError instanceof Error ? htmlError.message : String(htmlError))])]; }
        atomicWriteCanonical(artifactPaths.validationReport, { schemaVersion: "jaa-aggregated-validation-report-v1", runId, finalStatus: run.status, sourceSha256: dataset.sourceFileSha256, rulesSnapshotId: run.rules.snapshotId ?? run.rules.ruleSetId, decisionSha256: artifacts.hashes.decisions, canonicalOutputSha256: canonicalArtifact.sha256, reportDataPackageSha256: formalPackage.packageSha256, expectedCount: compact.payload.eventCount, actualDecisionCount: validated.validation.actualCount, canonicalRecordCount: run.results.length, schemaValidationPassed: validated.validation.schemaValid, semanticValidationPassed: validated.validation.semanticValid, evidenceValidationPassed: validated.validation.evidenceValid, attributionValidationPassed: validated.validation.attributionValid, qualityStatus: quality.status, findings: allFindings, warnings: run.anomalyWarnings, distribution: validated.validation.distribution, sqliteEligibility: warningGate, validatedAt: now(), validationDurationMs: Date.now() - validationStarted, canonicalAssemblyMs: run.telemetry.canonicalAssemblyMs });
        const completion = { schemaVersion: "ai-analysis-completion-manifest-v3", runId, decisionContractVersion: "jaa-ai-analysis-decisions-v5", canonicalContractVersion: "jaa-canonical-analysis-result-v5", reportDataPackageContractVersion: "jaa-analysis-report-data-package-v1", canonicalResultFile: "canonical-output/analysis-result.json", reportDataPackageFile: "canonical-output/report-data-package.json", renderedHtmlFile: run.reportFilePath ? path.basename(run.reportFilePath) : null, expectedRecordCount: compact.payload.eventCount, actualDecisionCount: validated.validation.actualCount, actualCanonicalCount: run.results.length, decisionSha256: artifacts.hashes.decisions, canonicalResultSha256: canonicalArtifact.sha256, reportDataPackageSha256: formalPackage.packageSha256, validationPassed: true, sqliteEligible: warningGate.sqliteEligible, generatedAt: now() }; atomicWriteCanonical(artifactPaths.completionManifest, completion); run.completionManifestPath = artifactPaths.completionManifest;
        archive?.append("artifact_event", "APP_ONLY", run.htmlRenderStatus === "completed" ? "Decision v5, aggregated findings, Canonical v5, Report Data Package, and local HTML published." : "Decision v5, aggregated findings, Canonical v5, and Report Data Package published; local HTML failed with a durable failure receipt.", { decisions: validated.validation.actualCount, canonical: run.results.length, reportPackage: formalPackage.packageId, htmlRenderStatus: run.htmlRenderStatus, htmlRenderReceiptPath: run.htmlRenderReceiptPath, warnings: run.anomalyWarnings, sqliteEligible: warningGate.sqliteEligible });
        archive?.append("validation_event", "APP_ONLY", "Schema, semantic, evidence, attribution, and quality validation completed.", { valid: true, semanticValidCount: validated.validation.semanticValidCount, warnings: run.anomalyWarnings });
        run.progress.completedBatches = 0; run.progress.message = warningGate.requiresHumanAcceptance ? "Analysis completed with warnings. Review the report and explicitly accept warnings before SQLite write." : run.htmlRenderStatus === "failed" ? "Canonical Result and Report Data Package completed; automatic HTML failed. SQLite remains eligible." : "Decision v5, Canonical v5, Report Data Package, offline HTML, and validation evidence completed.";
      } else {
        const settings = settingsAndSecret("ai_nexus").settings;
        const secret = settingsAndSecret("ai_nexus").secret;
        const selected = dataset.diffs.filter((diff) => payload.selectedDiffIds.includes(diff.sourceDiffId));
        for (let index = 0; index < selected.length; index += 1) {
          if (controller.signal.aborted) throw new AiAnalysisError("RUN_CANCELLED", "Run cancelled.");
          const diff = selected[index];
          run.progress.currentBatch = index + 1;
          const prompt = `Return one compact JSON object with candidates array. Each candidate: skillId, score 0-100, confidence 0-1, reason. Use only exact catalog IDs: ${run.rules.catalog.map((item) => item.id).join(",")}. Never choose by group order or _001 fallback. Evidence: ${JSON.stringify(diff)}`;
          if (settings.contextWindow && Math.ceil(prompt.length / 3) > settings.contextWindow) throw new AiAnalysisError("INPUT_TOO_LARGE", "A selected diff exceeds the configured context window.");
          const response = await callAiNexus(settings, secret, prompt, controller.signal);
          run.progress.requestCount += 1;
          let parsed: { candidates?: Array<{ skillId?: string; score?: number; confidence?: number; reason?: string }> } = {};
          try { parsed = JSON.parse(response.text.replace(/^```json\s*|\s*```$/g, "")); }
          catch { throw new AiAnalysisError("AI_RESPONSE_INVALID", "AI Nexus returned invalid JSON."); }
          const candidates = (parsed.candidates ?? []).filter((item) => run.rules.catalog.some((skill) => skill.id === item.skillId)).map((item) => {
            const skill = run.rules.catalog.find((value) => value.id === item.skillId)!;
            return { skillId: skill.id, skillName: skill.name, group: skill.group, score: typeof item.score === "number" ? item.score : null, confidence: typeof item.confidence === "number" ? item.confidence : null, positiveEvidenceRefs: [diff.evidenceId], negativeEvidenceRefs: [], matchedRuleIds: [], reason: item.reason ?? "Provider candidate", status: "PENDING_REVIEW" as const };
          });
          run.results.push({ resultId: `result_${crypto.randomUUID()}`, sourceDiffId: diff.sourceDiffId, sourceContentHash: diff.sourceContentHash, evidenceRefs: [diff.evidenceId], candidates, status: candidates.length ? "PENDING_REVIEW" : "NEEDS_REVIEW", analyzerVersion: model, requestTraceId: response.requestId, usage: { ...response.usage, availability: "actual", estimatedInputTokens: null }, rawResultAvailable: true, reviewNote: "", reviewedAt: null });
          run.progress.completedDiffs = index + 1;
          run.progress.completedBatches = index + 1;
          run.progress.elapsedMs = Date.now() - Date.parse(startedAt);
          notify(event);
        }
        run.progress.mainPayloadCount = selected.length;
        run.progress.payloadRecordCount = selected.length;
        run.progress.resultRecordCount = run.results.length;
      }
      run.progress.stage = "merging_evidence";
      run.distributionDiagnostics = buildDistributionDiagnostics(run.results, run.rules); run.progress.resultRecordCount = run.results.length;
      if (run.results.length !== run.selectedDiffIds.length) throw new AiAnalysisError("AI_RESULT_COUNT_MISMATCH", `Completed result count mismatch: expected=${run.selectedDiffIds.length} actual=${run.results.length}.`);
      run.validationGate = evaluateFormalPersistenceGate({ providerStatus: "completed", inputIds: run.selectedDiffIds, outputIds: run.results.map((item) => item.sourceDiffId), catalogInvalidSkillIds: [], responseSaved: payload.mode !== "CHATGPT" || Boolean(run.providerResponseGzipPath), jsonValid: true });
      if (!run.validationGate.passed) throw new AiAnalysisError("AI_RESULT_IDENTITY_VALIDATION_FAILED", "Formal persistence gate rejected incomplete or invalid result identity.");
      run.completedAt ??= now(); run.progress.completedBatches = payload.mode === "CHATGPT" ? 0 : 1; run.progress.completedDiffs = run.results.length; run.progress.elapsedMs = Date.now() - Date.parse(startedAt);
      if (payload.mode === "CHATGPT") {
        run.progress.stage = "writing_formal_artifacts";
        if (run.status === "completed_with_quality_warnings") {
          run.progress.status = "completed_with_quality_warnings"; run.progress.stage = "completed"; run.validationGate.sqliteAllowed = false; run.validationGate.goldenHtmlAllowed = run.htmlRenderStatus === "completed"; run.databasePath = null; run.sqliteCommittedRecordCount = 0; run.finalAcceptedRecordCount = 0;
          run.warningAcceptance = { accepted: false, acceptedAt: null, warnings: run.anomalyWarnings ?? [], auditFilePath: null };
          run.progress.message = `Completed with warnings (${(run.anomalyWarnings ?? []).join(", ")}). SQLite requires explicit warning acceptance; Canonical Result and Golden HTML remain viewable.`; chatgpt.advanceBridgeLifecycle(runId, "RUN_COMPLETED", "completed"); run.bridgeEvidence = chatgpt.getBridgeEvidence(runId); if (run.bridgeEvidence) { run.bridgeEvidence.lifecycle.overallStatus = "completed_with_quality_warnings"; run.lifecycle = run.bridgeEvidence.lifecycle; }
        } else {
          const sqliteStarted = Date.now(); run.progress.stage = "committing_database"; const databaseCommit = commitExistingCanonical(dbPath, dataset, run); run.telemetry = { ...(run.telemetry ?? {}), sqliteWriteMs: Date.now() - sqliteStarted, sqliteCompletedAt: now() }; run.finalAcceptedRecordCount = databaseCommit.ok ? run.results.length : 0; run.progress.stage = "completed"; const completionStatus: AiAnalysisRun["status"] = !databaseCommit.ok ? "completed_with_persistence_error" : run.htmlRenderStatus === "failed" ? "completed_with_report_error" : "completed"; run.progress.status = completionStatus; run.status = completionStatus; run.progress.errorCode = databaseCommit.ok ? null : databaseCommit.failure.errorCode as AiAnalysisErrorCode; run.progress.message = !databaseCommit.ok ? "Canonical Result remains valid and viewable, but the SQLite commit failed." : run.htmlRenderStatus === "failed" ? "Canonical Result, Report Data Package, and SQLite commit completed; automatic HTML failed and can be regenerated from Results." : "Canonical Result, Report Data Package, local HTML, and SQLite commit completed."; chatgpt.advanceBridgeLifecycle(runId, "RUN_COMPLETED", "completed"); run.bridgeEvidence = chatgpt.getBridgeEvidence(runId); run.lifecycle = run.bridgeEvidence?.lifecycle ?? run.lifecycle ?? null; if (run.lifecycle) { run.lifecycle.htmlRenderStatus = run.htmlRenderStatus ?? "not_started"; run.lifecycle.sqliteStatus = databaseCommit.ok ? "committed" : "commit_failed"; run.lifecycle.overallStatus = completionStatus === "completed_with_report_error" ? "completed_with_report_error" : completionStatus === "completed_with_persistence_error" ? "completed_with_persistence_error" : "completed"; run.lifecycle.rootErrorCode = databaseCommit.ok ? null : databaseCommit.failure.errorCode; }
        }
        if (runStagingFolder) persistRunDebugEvidence(runStagingFolder, run, requestEvidence, { providerResponseSha256: run.providerResponseSha256, finalAssistantMessagePath: run.finalAssistantMessagePath, analysisReportPath: run.analysisReportPath }, [{ at: run.startedAt, type: "analysis_started" }, { at: run.completedAt, type: "analysis_completed", warnings: run.anomalyWarnings ?? [] }], analysisUserActions);
        if (runStagingFolder && run.lifecycle) { const submitted = loadPersistedSubmissionV0332(runStagingFolder); const terminalQualityReport = run.qualityGateReportPath && fs.existsSync(run.qualityGateReportPath) ? JSON.parse(fs.readFileSync(run.qualityGateReportPath, "utf8")) as { status?: string; findings?: Array<{ stage?: string; code?: string }> } : { status: run.qualityGate?.status, findings: [] }; writeArtifactSubmissionResultV0332({ runDirectory: runStagingFolder, runId, submissionSha256: submitted.submissionSha256, formalArtifactStatus: run.canonicalRecordCount ? "accepted" : "pending_validation" }); const warningStages: ValidationStageV0332[] = []; if (terminalQualityReport.status === "WARNING") warningStages.push("QUALITY_GATE"); if (run.htmlRenderStatus === "failed") warningStages.push("HTML_RENDER"); writeValidationStageReceiptsV0333({ runDirectory: runStagingFolder, inputHash: submitted.submissionSha256, failedStage: null, rootErrorCode: null, findings: terminalQualityReport.findings ?? [], warningStages, blockedPendingAcceptanceStages: run.status === "completed_with_quality_warnings" ? ["SQLITE"] : [], stageReasons: { QUALITY_GATE: terminalQualityReport.status === "WARNING" ? "Quality warnings require durable manual acceptance before SQLite." : "Quality v4 passed.", HTML_RENDER: run.htmlRenderStatus === "failed" ? "Automatic local HTML render failed; Canonical remains active." : "Local HTML render completed.", SQLITE: run.status === "completed_with_quality_warnings" ? "Blocked pending durable warning acceptance." : run.lifecycle.sqliteStatus === "committed" ? "SQLite commit completed." : "SQLite commit did not complete." } }); const terminal = convergeTerminalLifecycleV0333(run.lifecycle, { terminalState: run.status === "completed_with_quality_warnings" ? "completed_with_warnings" : run.status === "completed_with_report_error" ? "completed_with_report_error" : run.status === "completed_with_persistence_error" ? "completed_with_persistence_error" : "completed", rootErrorCode: run.progress.errorCode, artifactReceived: true, artifactAccepted: true, validationStarted: true, validationPassed: true, firstFailedValidationStage: null, canonicalCreated: Boolean(run.canonicalRecordCount), analyzedResultCreated: Boolean(run.analyzedFilePath), activeResultChanged: Boolean(run.canonicalRecordCount), formalReportPackageCreated: Boolean(run.reportDataPackagePath), formalHtmlCreated: Boolean(run.reportFilePath), diagnosticReportPackageCreated: false, diagnosticHtmlCreated: false, sqliteStatus: run.lifecycle.sqliteStatus, updatedAtUtc: run.completedAt }); run.lifecycle = terminal; persistTerminalLifecycleV0333(runStagingFolder, terminal); }
      } else {
        run.status = "completed"; run.progress.status = "completed"; run.progress.stage = "writing_staging"; run.progress.message = "Analysis completed. Results require human review.";
        const reportPath = run.plannedAnalyzedFilePath!.replace(/\.json$/i, ".html"); const html = goldenHtmlForRun(run, dataset); validateGoldenHtml(html, run.results.length); let exported: ReturnType<typeof atomicExport> | null = null; let report: ReturnType<typeof atomicExport> | null = null;
        try { exported = atomicExport(run.plannedAnalyzedFilePath!, JSON.stringify(analyzedDocument(run), null, 2)); report = atomicExport(reportPath, html); run.analyzedFilePath = exported.filePath; run.analyzedFileSizeBytes = exported.sizeBytes; run.analyzedFileSha256 = exported.sha256; run.formalArtifactRecordCount = run.results.length; run.reportFilePath = report.filePath; run.reportFileSizeBytes = report.sizeBytes; run.reportFileSha256 = report.sha256; run.progress.stage = "committing_database"; initializeAiDatabase(dbPath); persistCompletedRun(dbPath, dataset, run); run.databasePath = dbPath; run.databaseWriteStatus = `Written - ${run.results.length} validated records`; run.sqliteCommittedRecordCount = run.results.length; run.progress.stage = "completed"; }
        catch (error) { if (exported) try { fs.unlinkSync(exported.filePath); } catch {} if (report) try { fs.unlinkSync(report.filePath); } catch {} throw error; }
      }
      if (run.systemicNoResultGate?.activeResultAllowed !== false && resultRegistry.active?.analyzedResultSha256 !== run.analyzedFileSha256) resultRegistry.activateRun(run, "ANALYSIS_RUN");
      resultRegistry.refreshDownstream(run);
      selectedCanonicalAiRunDirectory = run.runDirectory ?? null;
    } catch (error) {
      const value = asAnalysisError(error);
      dispatchLedgers.get(runId)?.append("failed", { rootErrorCode: value.code, rootErrorMessage: value.message, lastSuccessfulState: dispatchLedgers.get(runId)?.projection.lastState ?? null, idempotencyKey: "terminal_failed:" + value.code });
      preparedProviderMessages.delete(runId);
      const providerFailure = providerFailureEvidence.get(runId);
      if (providerFailure) { providerVisibleResponse = providerFailure.visibleText || null; run.progress.usage = providerFailure.usage; }
      const zeroDispatchFailure = (["AI_BRIDGE_UNAVAILABLE", "AI_BRIDGE_INTEGRITY_MISMATCH", "AI_BRIDGE_CONTRACT_MISMATCH", "AI_INPUT_UTF8_INVALID", "AI_INPUT_HASH_MISMATCH", "AI_INPUT_RECEIPT_INCOMPLETE", "AI_INPUT_TOOL_FAILED", "AI_PROVIDER_DISPATCH_BLOCKED"].includes(value.code) || value.code.startsWith("AI_RUNTIME_")) && (run.progress.providerDispatchCount ?? 0) === 0;
      if (zeroDispatchFailure) run.progress.usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, availability: "actual_zero_no_model_dispatch", estimatedInputTokens: run.progress.usage.estimatedInputTokens, turnCumulative: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }, lastModelCall: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }, usageEventCount: 0 };
      const initialBridgeEvidence = chatgpt.getBridgeEvidence(runId);
      const rootErrorCode = (initialBridgeEvidence?.lifecycle.rootErrorCode ?? value.code) as AiAnalysisErrorCode;
      const failedLifecycleStage = initialBridgeEvidence?.lifecycle.firstFailedStage ?? null;
      const failedStage = failedLifecycleStage?.toLowerCase() ?? run.progress.stage ?? "failed";
      const lifecycleStage = failedLifecycleStage ?? (failedStage.includes("input") ? "INPUT_READING" : failedStage.includes("artifact") || failedStage.includes("waiting") ? "ARTIFACT_SUBMISSION_STARTED" : failedStage.includes("validat") ? "VALIDATION_COMPLETED" : failedStage.includes("assembl") ? "CANONICAL_ASSEMBLY_COMPLETED" : "PROVIDER_DISPATCHED");
      chatgpt.failBridgeLifecycle(runId, lifecycleStage, rootErrorCode); run.bridgeEvidence = chatgpt.getBridgeEvidence(runId); run.lifecycle = run.bridgeEvidence?.lifecycle ?? run.lifecycle ?? null;
      const validationFailure = rootErrorCode.startsWith("AI_DECISION_") || rootErrorCode.startsWith("AI_ARTIFACT_") || rootErrorCode.startsWith("EVIDENCE_QUOTE_") || ["AI_ARTIFACT_RECEIPT_INVALID", "AI_ARTIFACT_PUBLISH_FAILED", "AI_ANALYSIS_REPORT_MISSING", "AI_FINAL_SUMMARY_MISSING", "AI_OUTPUT_PATH_ESCAPE_BLOCKED", "AI_OUTPUT_PUBLISH_INCOMPLETE", "AI_RESULT_COUNT_MISMATCH", "AI_RESULT_IDENTITY_VALIDATION_FAILED"].includes(rootErrorCode);
      run.status = rootErrorCode === "RUN_CANCELLED" ? "cancelled" : rootErrorCode === "AI_PROVIDER_TIMEOUT" ? "provider_timeout" : zeroDispatchFailure ? "failed" : validationFailure ? "failed_validation" : "provider_failed"; run.completedAt = now(); run.progress.status = run.status; run.progress.stage = run.status === "cancelled" ? "cancelled" : "failed"; run.progress.errorCode = rootErrorCode; run.progress.message = value.message; run.progress.elapsedMs = Date.now() - Date.parse(startedAt);
      run.databaseWriteStatus = value.code.startsWith("AI_BRIDGE_") || value.code.startsWith("AI_INPUT_") ? "Not written - Bridge or input verification failed"
        : value.code === "AI_OUTPUT_SCHEMA_PREFLIGHT_FAILED" ? "Not written — local output schema validation failed before provider request"
        : value.code === "AI_OUTPUT_SCHEMA_PROVIDER_REJECTED" ? "Not written — Provider rejected output schema before turn start"
        : value.code === "AI_PROVIDER_RESPONSE_INCOMPLETE" ? "Not written — Provider response incomplete"
        : value.code === "AI_PROVIDER_RESPONSE_JSON_INVALID" ? "Not written — Provider response JSON invalid"
        : value.code === "AI_PROVIDER_RESPONSE_SCHEMA_INVALID" ? "Not written — response schema validation failed"
        : value.code === "AI_RESULT_IDENTITY_VALIDATION_FAILED" ? "Not written — result identity validation failed"
        : value.code === "AI_RESULT_CATALOG_VALIDATION_FAILED" ? "Not written — Catalog validation failed"
        : failedStage === "starting_thread" || failedStage === "preflighting_capacity" || failedStage === "building_payload" || failedStage === "building_output_schema" || failedStage === "validating_output_schema" ? "Not written — failed before provider request"
        : failedStage === "receiving_response" || failedStage === "waiting_response" ? "Not written — Provider response incomplete"
        : "Not written — result validation failed";
      const deduped = errorDeduplicator.record(runId, String(failedStage), rootErrorCode, value.message);
      if (payload.mode === "CHATGPT" && runStagingFolder) {
        try {
          run.failedStagingPath = null;
          if (run.artifactPaths) { const failedValidationPath = path.join(run.artifactPaths.canonical, "validation-report.json"); atomicWriteCanonical(failedValidationPath, { schemaVersion: "ai-analysis-validation-report-v1", runId, finalStatus: run.status, failedStage, rootErrorCode, derivedStatusCodes: run.lifecycle?.derivedStatusCodes ?? [], message: value.message, aiTurnCompleted: (run.progress.turnCompletedCount ?? 0) > 0, aiReportedCount: run.providerReturnedRecordCount ?? 0, authoritativeDecisionCount: run.receivedDecisionCount ?? 0, canonicalRecordCount: run.canonicalRecordCount ?? 0, assemblyAllowed: false, sqliteAllowed: false, generatedAt: now() }); run.validationReportPath = failedValidationPath; }
          persistRunDebugEvidence(runStagingFolder, run, requestEvidence, providerVisibleResponse === null ? undefined : { text: redactChatGptTextComplete(providerVisibleResponse) }, [{ at: startedAt, type: "analysis_started", runId }, { at: deduped.lastOccurredAt, type: "primary_error", ...deduped }], analysisUserActions);
          atomicExport(path.join(runStagingFolder, "failed-run-manifest.json"), JSON.stringify({ runId, status: run.status, failedStage, errorCode: rootErrorCode, derivedStatusCodes: run.lifecycle?.derivedStatusCodes ?? [], message: value.message, databaseWriteStatus: run.databaseWriteStatus, completedAt: run.completedAt }, null, 2));
        } catch (stagingError) { run.progress.message += " Canonical evidence finalization failed: " + (stagingError instanceof Error ? stagingError.message : String(stagingError)); }
      }
      if (run.runDirectory && run.lifecycle) {
        const artifactDirectory = path.join(run.runDirectory, "artifact-attempts");
        const artifactReceived = fs.existsSync(artifactDirectory) && fs.readdirSync(artifactDirectory).some((name) => /^ai-submitted-artifact-attempt-\d+[.]json$/i.test(name));
        const firstFailedValidationStage = firstFailedValidationStageV0331(run.runDirectory);
        const terminalLifecycle = convergeTerminalLifecycleV0333(run.lifecycle, {
          terminalState: rootErrorCode === "RUN_CANCELLED" ? "cancelled" : rootErrorCode === "AI_PROVIDER_TIMEOUT" ? "timed_out" : "failed",
          rootErrorCode, artifactReceived, artifactAccepted: false,
          validationStarted: Boolean(firstFailedValidationStage) || validationFailure,
          validationPassed: false, firstFailedValidationStage,
          canonicalCreated: false, analyzedResultCreated: false, activeResultChanged: false,
          formalReportPackageCreated: false, formalHtmlCreated: false,
          diagnosticReportPackageCreated: Boolean(run.diagnosticReportDataPackagePath),
          diagnosticHtmlCreated: Boolean(run.diagnosticReportFilePath),
          sqliteStatus: "blocked", rootErrorStage: firstFailedValidationStage, updatedAtUtc: run.completedAt
        });
        run.lifecycle = terminalLifecycle;
        persistTerminalLifecycleV0333(run.runDirectory, terminalLifecycle);
      }
    } finally { const successful = ["completed", "completed_with_quality_warnings", "completed_with_report_error", "completed_with_persistence_error"].includes(run.status) && resultRegistry.active?.runId === run.runId; if (run.status !== "queued") attemptStore.finish(attempt, successful ? "COMPLETED" : "FAILED"); if (run.status !== "queued") { lastNavigationDecision = attemptStore.navigation(attempt, navigationDecisionV0325({ attempt, run, active: resultRegistry.active })); run.navigationDecision = lastNavigationDecision; } run.bridgeEvidence = chatgpt.getBridgeEvidence(runId) ?? run.bridgeEvidence ?? null; if (!run.lifecycle?.terminalSnapshotHash) run.lifecycle = run.bridgeEvidence?.lifecycle ?? run.lifecycle ?? null; const archive = runArchives.get(runId); try { archive?.writeManifest(run); if (!["queued", "running", "validating", "retrying", "cancelling"].includes(run.status)) archive?.close("terminal"); } catch (archiveError) { run.progress.errorCode = "AI_RUN_ARCHIVE_FAILED"; run.progress.message += ` Archive finalization failed: ${archiveError instanceof Error ? archiveError.message : String(archiveError)}`; } if (run.status !== "queued") dispatchGuard.finish(runId); providerFailureEvidence.delete(runId); activeRunId = null; abortControllers.delete(runId); observedWorkspaceFiles.delete(runId); lastProviderUiNotifyAt.delete(runId); chatgpt.releaseBridge(runId); notify(event); }
    return { ok: run.status === "completed" || run.status === "completed_with_quality_warnings" || run.status === "completed_with_report_error" || run.status === "completed_with_persistence_error", run, navigationDecision: run.navigationDecision ?? null, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:accept-warnings", async (event, payload: { runId: string; accept: boolean }) => {
    const run = runs.find((item) => item.runId === payload.runId); const dataset = run ? pendingDatasets.find((item) => item.datasetId === run.sourceDatasetId) : null;
    if (!run || !dataset || !run.runDirectory || run.status !== "completed_with_quality_warnings" || !run.validationGate?.passed || !run.anomalyWarnings?.length) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Only a structurally valid completed_with_quality_warnings Run can be accepted."));
    if (payload.accept) { const options = { type: "warning" as const, buttons: ["Cancel", "Accept Warnings and Write"], defaultId: 0, cancelId: 0, title: "Accept AI Analysis Warnings", message: `Accept warnings for ${run.runId}?`, detail: `Warnings: ${run.anomalyWarnings.join(", ")}\nThis does not bypass schema, count, hash, identity, or semantic validation.` }; const owner = BrowserWindow.fromWebContents(event.sender); const choice = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options); if (choice.response !== 1) return { ok: false, canceled: true, snapshot: snapshot() }; }
    const acceptedAt = now(); const auditPath = path.join(run.runDirectory, "canonical-output", "warning-acceptance-audit.jsonl"); const qualityReport = run.qualityGateReportPath && fs.existsSync(run.qualityGateReportPath) ? JSON.parse(fs.readFileSync(run.qualityGateReportPath, "utf8")) as { findings?: Array<{ code?: string }> } : { findings: [] }; const findingCodes = [...new Set((qualityReport.findings ?? []).map((finding) => finding.code).filter((code): code is string => Boolean(code)))]; const findingsHash = sha256Text(JSON.stringify(qualityReport.findings ?? [])); const auditId = crypto.randomUUID(); const sqliteRetryTransactionId = crypto.randomUUID(); const beforeHash = sha256Text(JSON.stringify({ runId: run.runId, status: run.status, sqliteStatus: run.lifecycle?.sqliteStatus ?? null, accepted: false, findingsHash })); const afterHash = sha256Text(JSON.stringify({ runId: run.runId, accepted: payload.accept, acceptedAtUtc: acceptedAt, findingsHash, auditId })); const audit = { schemaVersion: "ai-warning-acceptance-v2", auditId, runId: run.runId, accepted: payload.accept, findingCodes, findingsHash, warnings: run.anomalyWarnings, acceptedAtLocal: new Date().toLocaleString("sv-SE"), acceptedAtUtc: acceptedAt, beforeHash, afterHash, sqliteRetryTransaction: { transactionId: sqliteRetryTransactionId, status: payload.accept ? "PENDING" : "NOT_RUN" } };
    const descriptor = fs.openSync(auditPath, "a"); try { fs.writeSync(descriptor, JSON.stringify(audit) + "\n"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    run.warningAcceptance = { accepted: payload.accept, acceptedAt, warnings: [...run.anomalyWarnings], auditFilePath: auditPath }; analysisUserActions.push(`${acceptedAt} Warning acceptance ${payload.accept ? "confirmed" : "rejected"}: ${run.runId} ${run.anomalyWarnings.join(",")}`);
    const archive = runArchives.get(run.runId) ?? AiAnalysisRunArchive.reopen(run.runId, run.runDirectory); runArchives.set(run.runId, archive);
    if (!payload.accept) { run.databaseWriteStatus = "Not written - warnings rejected by user"; archive.append("validation_event", "APP_ONLY", "Warning acceptance rejected; SQLite remains blocked.", audit); archive.writeManifest(run); return { ok: true, accepted: false, snapshot: snapshot() }; }
    const gate = warningPersistenceGate({ structuralValidationPassed: run.validationGate.passed, warnings: run.anomalyWarnings, acceptedWarnings: run.anomalyWarnings }); if (!gate.sqliteEligible) return errorPayload(new AiAnalysisError("AI_SQLITE_TRANSACTION_FAILED", "Warning acceptance cannot bypass structural validation."));
    run.validationGate.sqliteAllowed = true; run.validationGate.goldenHtmlAllowed = true;
    const dbPath = resolveConfiguredPath(environment.values.AI_ANALYSIS_DB_PATH, path.join(getAppDataDir(), "ai-analysis.sqlite3")); const sqliteStarted = Date.now(); const databaseCommit = commitExistingCanonical(dbPath, dataset, run); run.finalAcceptedRecordCount = databaseCommit.ok ? run.results.length : 0; run.progress.errorCode = databaseCommit.ok ? null : databaseCommit.failure.errorCode as AiAnalysisErrorCode; run.telemetry = { ...(run.telemetry ?? {}), sqliteWriteMs: Date.now() - sqliteStarted, sqliteCompletedAt: now() }; if (run.htmlRenderStatus !== "completed") try { renderExistingCanonical(run); } catch { /* Failure receipt remains authoritative; Canonical stays active. */ } const acceptedCompletionStatus: AiAnalysisRun["status"] = !databaseCommit.ok ? "completed_with_persistence_error" : run.htmlRenderStatus === "failed" ? "completed_with_report_error" : "completed"; run.status = acceptedCompletionStatus; run.progress.status = acceptedCompletionStatus; run.progress.stage = "completed"; run.progress.message = !databaseCommit.ok ? "Warnings were accepted, but the SQLite retry failed; Canonical remains valid." : run.htmlRenderStatus === "failed" ? "Warnings accepted and SQLite committed; local HTML regeneration failed." : "Warnings accepted; SQLite committed and local HTML is available."; const auditResult = { ...audit, sqliteRetryTransaction: { transactionId: sqliteRetryTransactionId, status: databaseCommit.ok ? "COMMITTED" : "FAILED", receiptPath: databaseCommit.ok ? run.databaseCommitReceiptPath ?? null : run.databaseCommitFailurePath ?? null, completedAtUtc: now() }, finalStatus: acceptedCompletionStatus, finalStateHash: sha256Text(JSON.stringify({ runId: run.runId, status: acceptedCompletionStatus, sqliteStatus: databaseCommit.ok ? "committed" : "commit_failed", htmlRenderStatus: run.htmlRenderStatus })) }; const resultDescriptor = fs.openSync(auditPath, "a"); try { fs.writeSync(resultDescriptor, JSON.stringify(auditResult) + "\n"); fs.fsyncSync(resultDescriptor); } finally { fs.closeSync(resultDescriptor); } if (run.lifecycle) { run.lifecycle.htmlRenderStatus = run.htmlRenderStatus ?? "not_started"; run.lifecycle.sqliteStatus = databaseCommit.ok ? "committed" : "commit_failed"; const terminal = convergeTerminalLifecycleV0333(run.lifecycle, { terminalState: acceptedCompletionStatus === "completed_with_report_error" ? "completed_with_report_error" : acceptedCompletionStatus === "completed_with_persistence_error" ? "completed_with_persistence_error" : "completed", rootErrorCode: databaseCommit.ok ? null : databaseCommit.failure.errorCode, artifactReceived: true, artifactAccepted: true, validationStarted: true, validationPassed: true, firstFailedValidationStage: null, canonicalCreated: true, analyzedResultCreated: true, activeResultChanged: true, formalReportPackageCreated: Boolean(run.reportDataPackagePath), formalHtmlCreated: run.htmlRenderStatus === "completed", diagnosticReportPackageCreated: false, diagnosticHtmlCreated: false, sqliteStatus: run.lifecycle.sqliteStatus, updatedAtUtc: now() }); run.lifecycle = terminal; persistTerminalLifecycleV0333(run.runDirectory, terminal); } const submitted = loadPersistedSubmissionV0332(run.runDirectory); writeValidationStageReceiptsV0333({ runDirectory: run.runDirectory, inputHash: submitted.submissionSha256, failedStage: databaseCommit.ok ? null : "SQLITE", rootErrorCode: databaseCommit.ok ? null : databaseCommit.failure.errorCode, findings: qualityReport.findings ?? [], warningStages: ["QUALITY_GATE", ...(run.htmlRenderStatus === "failed" ? ["HTML_RENDER" as ValidationStageV0332] : [])], stageReasons: { QUALITY_GATE: "Quality warning durably accepted by operator.", HTML_RENDER: run.htmlRenderStatus === "failed" ? "Local HTML regeneration failed." : "Local HTML available.", SQLITE: databaseCommit.ok ? "SQLite retry transaction committed idempotently." : "SQLite retry transaction failed." } });
    if (run.completionManifestPath && fs.existsSync(run.completionManifestPath)) { const manifest = JSON.parse(fs.readFileSync(run.completionManifestPath, "utf8")); atomicWriteCanonical(run.completionManifestPath, { ...manifest, sqliteEligible: databaseCommit.ok, warningAcceptance: auditResult, sqliteCommittedRecordCount: databaseCommit.ok ? run.results.length : 0, renderedHtmlFile: run.reportFilePath ? path.basename(run.reportFilePath) : null }); }
    archive.append("validation_event", "APP_ONLY", databaseCommit.ok ? "Warnings explicitly accepted; validated results committed to SQLite." : "Warnings explicitly accepted; SQLite retry failed and Canonical remains active.", auditResult); archive.writeManifest(run); archive.close("warning_acceptance"); return { ok: databaseCommit.ok, accepted: true, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:cancel-capacity-warning", async (event, runId: string) => {
    const run = runs.find((item) => item.runId === runId);
    if (!run || run.progress.stage !== "waiting_capacity_confirmation" || !run.capacityConfirmation) return { ok: false, message: "Capacity confirmation is not pending.", snapshot: snapshot() };
    run.capacityConfirmation = { ...run.capacityConfirmation, confirmationAction: "cancelled", confirmedAt: now() };
    run.status = "cancelled"; run.completedAt = now(); run.progress.status = "cancelled"; run.progress.stage = "cancelled";
    run.progress.message = "Capacity warning cancelled. No provider request, thread, or turn was created.";
    run.databaseWriteStatus = "Not written — cancelled before provider request";
    analysisUserActions.push(`${run.capacityConfirmation.confirmedAt} Capacity warning cancelled: ${runId}`);
    if (run.compactPayloadPath) persistRunDebugEvidence(path.dirname(run.compactPayloadPath), run, undefined, undefined, [{ at: run.capacityConfirmation.confirmedAt, type: "capacity_cancelled" }], analysisUserActions);
    dispatchGuard.finish(runId); notify(event);
    return { ok: true, run, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:cancel", async (_event, runId: string) => {
    const controller = abortControllers.get(runId); if (!controller) return { ok: false, message: "Run is not active." };
    controller.abort(); return { ok: true };
  });
  ipcMain.handle("ai-analysis:review", async (_event, payload: { runId: string; resultId: string; status: "CONFIRMED" | "REJECTED" | "PENDING_REVIEW"; note: string }) => {
    const run = runs.find((item) => item.runId === payload.runId); const result = run?.results.find((item) => item.resultId === payload.resultId);
    if (!run || !result) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Analysis result was not found."));
    const priorStatus = result.status;
    result.status = payload.status; result.reviewNote = payload.note; result.reviewedAt = now();
    if (run.databasePath) persistReview(run.databasePath, run.runId, result.resultId, priorStatus, payload.status, payload.note);
    return { ok: true, snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:export", async (_event, payload: { runId: string; format: AiExportFormat }) => {
    const run = runs.find((item) => item.runId === payload.runId);
    if (!run || !["completed", "completed_with_report_error", "completed_with_persistence_error"].includes(run.status)) return errorPayload(new AiAnalysisError("PARTIAL_RESULT_FORBIDDEN", "Only completed runs may be exported."));
    const extension = payload.format; const fileName = run.analyzedFileName.replace(/\.json$/i, `.${extension}`);
    const choice = await dialog.showSaveDialog({ defaultPath: path.join(ensureDir(path.join(getExportsDir(), "ai-analysis")), fileName), filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    const selectedDataset = pendingDatasets.find((item) => item.datasetId === run.sourceDatasetId);
    const content = payload.format === "json" ? JSON.stringify(analyzedDocument(run), null, 2) : payload.format === "csv" ? csvForRun(run) : goldenHtmlForRun(run, selectedDataset);
    if (payload.format === "html") validateGoldenHtml(content, run.results.length);
    return { canceled: false, ...atomicExport(choice.filePath, content) };
  });
  ipcMain.handle("ai-analysis:open-html", async (_event, runId: string) => {
    const run = runs.find((item) => item.runId === runId); if (!run?.reportFilePath || run.htmlRenderStatus !== "completed") return errorPayload(new AiAnalysisError("AI_HTML_RENDER_FAILED", "Completed HTML report was not found.")); const error = await shell.openPath(run.reportFilePath); return { ok: !error, filePath: run.reportFilePath, error: error || undefined };
  });
  ipcMain.handle("ai-analysis:rerender-html", async (event, runId: string) => {
    const run = runs.find((item) => item.runId === runId); if (!run?.reportDataPackagePath) return errorPayload(new AiAnalysisError("AI_HTML_RENDER_FAILED", "Report Data Package is not available."));
    const owner = BrowserWindow.fromWebContents(event.sender); const options = { title: "Select a compatible HTML Report Template for offline re-render", properties: ["openFile"] as Array<"openFile">, filters: [{ name: "Markdown Template", extensions: ["md"] }] }; const choice = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options); if (choice.canceled || !choice.filePaths[0]) return { ok: false, canceled: true, snapshot: snapshot() };
    try { const result = renderExistingCanonical(run, choice.filePaths[0]); if (run.status === "completed_with_report_error") { run.status = "completed"; run.progress.status = "completed"; run.progress.message = "Canonical Result, SQLite, and regenerated local HTML are available."; if (run.lifecycle) { const terminal = convergeTerminalLifecycleV0333(run.lifecycle, { terminalState: "completed", rootErrorCode: null, artifactReceived: true, artifactAccepted: true, validationStarted: true, validationPassed: true, firstFailedValidationStage: null, canonicalCreated: true, analyzedResultCreated: true, activeResultChanged: true, formalReportPackageCreated: true, formalHtmlCreated: true, diagnosticReportPackageCreated: false, diagnosticHtmlCreated: false, sqliteStatus: run.lifecycle.sqliteStatus, updatedAtUtc: now() }); run.lifecycle = terminal; persistTerminalLifecycleV0333(run.runDirectory!, terminal); } } runArchives.get(runId)?.writeManifest(run); notify(event); return { ok: true, receipt: result.receipt, snapshot: snapshot() }; } catch (error) { runArchives.get(runId)?.writeManifest(run); notify(event); return { ...errorPayload(error), snapshot: snapshot() }; }
  });
  ipcMain.handle("ai-analysis:render-external-package", async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender); const packageOptions = { title: "Open external Report Data Package (view/render only)", properties: ["openFile"] as Array<"openFile">, filters: [{ name: "Report Data Package", extensions: ["json"] }] }; const packageChoice = owner ? await dialog.showOpenDialog(owner, packageOptions) : await dialog.showOpenDialog(packageOptions); if (packageChoice.canceled || !packageChoice.filePaths[0]) return { ok: false, canceled: true };
    const templateOptions = { title: "Select compatible HTML Report Template", properties: ["openFile"] as Array<"openFile">, filters: [{ name: "Markdown Template", extensions: ["md"] }] }; const templateChoice = owner ? await dialog.showOpenDialog(owner, templateOptions) : await dialog.showOpenDialog(templateOptions); if (templateChoice.canceled || !templateChoice.filePaths[0]) return { ok: false, canceled: true };
    try { const outputDirectory = ensureDir(path.join(getExportsDir(), "ai-analysis", "external-package-renders")); const result = renderReportDataPackageHtmlV0333({ reportDataPackagePath: packageChoice.filePaths[0], templatePath: templateChoice.filePaths[0], outputDirectory, renderTrigger: "MANUAL_RESULTS_REGENERATE" }); return { ok: true, externalViewOnly: true, sqliteEligible: false, receipt: result.receipt, filePath: result.receipt.outputHtmlPath }; } catch (error) { return errorPayload(error); }
  });
  ipcMain.handle("ai-analysis:retry-database", async (event, runId: string) => {
    const run = runs.find((item) => item.runId === runId); const dataset = run ? pendingDatasets.find((item) => item.datasetId === run.sourceDatasetId) : null; if (!run || !dataset || !run.analyzedFilePath || !run.validationGate?.passed) return errorPayload(new AiAnalysisError("AI_SQLITE_BLOCKED", "Validated Canonical Result and source dataset are required.")); const dbPath = resolveConfiguredPath(environment.values.AI_ANALYSIS_DB_PATH, path.join(getAppDataDir(), "ai-analysis.sqlite3")); const result = commitExistingCanonical(dbPath, dataset, run); run.status = result.ok ? "completed" : "completed_with_persistence_error"; run.progress.status = run.status; run.progress.stage = "completed"; run.progress.errorCode = result.ok ? null : result.failure.errorCode as AiAnalysisErrorCode; run.progress.message = result.ok ? "Database commit completed from the existing Canonical Result." : "Canonical Result remains valid; database retry failed."; runArchives.get(runId)?.writeManifest(run); notify(event); return { ok: result.ok, ...(result.ok ? { receipt: result.receipt } : { failure: result.failure, errorCode: result.failure.errorCode, message: result.failure.message }), snapshot: snapshot() };
  });
  ipcMain.handle("ai-analysis:conversation", async (_event, payload: { runId: string; offset?: number; limit?: number }) => {
    const run = runs.find((item) => item.runId === payload.runId);
    if (!run?.runDirectory) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Run archive was not found."));
    try { return { ok: true, ...readConversationPage(run.runDirectory, payload.offset, payload.limit) }; } catch (error) { return errorPayload(new AiAnalysisError("AI_RUN_ARCHIVE_FAILED", error instanceof Error ? error.message : String(error))); }
  });
  ipcMain.handle("ai-analysis:delete-run", async (event, runId: string) => {
    const index = runs.findIndex((item) => item.runId === runId); const run = runs[index];
    if (!run?.runDirectory || activeRunId === runId || ["running", "queued", "retrying", "cancelling"].includes(run.status)) return errorPayload(new AiAnalysisError("ANALYSIS_INPUT_INVALID", "Only a terminal Run archive can be deleted."));
    const options = { type: "warning" as const, buttons: ["Cancel", "Delete Run Archive"], defaultId: 0, cancelId: 0, title: "Delete Run Archive", message: `Delete local Run archive ${runId}?`, detail: "This removes only the local Run archive. It does not delete formal JSON, HTML, or SQLite records." };
    const owner = BrowserWindow.fromWebContents(event.sender); const choice = owner ? await dialog.showMessageBox(owner, options) : await dialog.showMessageBox(options);
    if (choice.response !== 1) return { ok: false, canceled: true, snapshot: snapshot() };
    try { deleteRunArchive(run.runDirectory); runs.splice(index, 1); runArchives.delete(runId); if (selectedRunId === runId) selectedRunId = runs[0]?.runId ?? null; return { ok: true, canceled: false, snapshot: snapshot() }; } catch (error) { return errorPayload(new AiAnalysisError("AI_RUN_ARCHIVE_FAILED", error instanceof Error ? error.message : String(error))); }
  });
  ipcMain.handle("ai-analysis:open-folder", async (_event, folderPath?: string) => {
    const folder = folderPath || ensureDir(path.join(getExportsDir(), "ai-analysis"));
    const error = await shell.openPath(folder); return { ok: !error, folderPath: folder, error: error || undefined };
  });

  try { rules = ruleSelection.revalidate(); } catch { rules = null; }
  if (environment.supported && environment.values.AI_ANALYSIS_DB_PATH) {
    try { initializeAiDatabase(resolveConfiguredPath(environment.values.AI_ANALYSIS_DB_PATH, "")); } catch { /* fail closed on use */ }
  }
}
