import fs from "node:fs";
import path from "node:path";
import { atomicWriteJsonStream, hashFile, readSmallJson } from "./fileBackedJson.js";
import { createStreamingZip, verifyStreamingZip } from "./streamingZip.js";
import { sanitizeExportData } from "./export/sanitizeExport.js";

export type FullFetchResultInput = {
  app: { name: string; version: string; buildTime: string; gitCommit: string; gitBranch: string };
  run: Record<string, unknown>;
  requestContext: Record<string, unknown>;
  stagingReference: Record<string, unknown>;
  summary: Record<string, unknown>;
  fetchReport: unknown[];
  issueResults: unknown[];
  directJiraEvidence: Record<string, unknown>;
  relatedCandidateIssues: unknown[];
  warnings: string[];
  errors: string[];
  diagnostics: Record<string, unknown>;
  debugLogSanitized: string[];
  exportedAt?: string;
};
export type FullFetchResultDocument = ReturnType<typeof buildFullFetchResultDocument>;

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function boundedStrings(values: string[], limit = 200) { return values.slice(0, limit).map((value) => String(value).slice(0, 2000)); }

export function buildFullFetchResultDocument(input: FullFetchResultInput) {
  const evidence = record(input.directJiraEvidence);
  const issueResults = input.issueResults.map((value) => {
    const issue = record(value);
    return {
      issueKey: String(issue.issueKey ?? ""),
      fetchStatus: String(issue.fetchStatus ?? issue.status ?? ""),
      status: String(issue.status ?? ""),
      sizeBytes: Number(issue.sizeBytes ?? 0),
      snapshotFetchedAt: String(issue.snapshotFetchedAt ?? ""),
      currentIssueSnapshotRef: issue.currentIssueSnapshotRef ?? null,
      normalizedCurrentFieldsRef: issue.normalizedCurrentFieldsRef ?? null,
      issueManifestRef: issue.issueManifestRef ?? null,
      canonicalFiles: issue.canonicalFiles ?? {},
      normalizedCurrentFields: Array.isArray(issue.normalizedCurrentFields) ? issue.normalizedCurrentFields : [],
      error: String(issue.error ?? "").slice(0, 2000)
    };
  });
  return sanitizeExportData({
    schemaVersion: "user_analysis_full_fetch_result_v3",
    exportType: "user-analysis-full-fetch-result-index",
    app: input.app,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    stage: "user-analysis-stage-2-full-fetch",
    requestContext: input.requestContext,
    fullFetchRun: input.run,
    stagingReference: input.stagingReference,
    summary: input.summary,
    fetchReport: input.fetchReport,
    issueResults,
    directJiraEvidence: { summary: evidence.summary ?? {}, excludedSummary: evidence.excludedSummary ?? {}, files: evidence.files ?? {}, canonicalStorage: "per_issue_evidence_ndjson" },
    relatedCandidateIssues: input.relatedCandidateIssues,
    warnings: boundedStrings(input.warnings),
    errors: boundedStrings(input.errors),
    diagnostics: input.diagnostics,
    debugLogSanitized: boundedStrings(input.debugLogSanitized, 500),
    canonicalDataPolicy: { fileBacked: true, runLevelRawEmbedded: false, snapshotEmbedded: false, changelogEmbedded: false, commentsEmbedded: false, evidenceEmbedded: false, referencesContainHashSizeCount: true }
  }) as Record<string, unknown>;
}

export function fullFetchResultRunId(document: Record<string, unknown>) { return String(record(document.fullFetchRun).runId ?? document.runId ?? ""); }

export function saveFullFetchResult(document: Record<string, unknown>, outputDir: string, fileName: string) {
  const safeName = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");
  const finalName = safeName.endsWith(".json") ? safeName : `${safeName}.json`;
  const filePath = path.join(outputDir, finalName);
  const ref = atomicWriteJsonStream(filePath, document, finalName);
  const parsed = readSmallJson<Record<string, unknown>>(filePath);
  return { filePath, folderPath: outputDir, fileName: finalName, fileSize: ref.sizeBytes, sha256: ref.sha256, runId: fullFetchResultRunId(parsed) };
}

export function zipFullFetchResult(input: { document: Record<string, unknown>; sourcePath?: string; outputDir: string; generatedAutomatically: boolean }) {
  const runId = fullFetchResultRunId(input.document);
  if (!runId) throw new Error("Full Fetch Result is missing runId.");
  fs.mkdirSync(input.outputDir, { recursive: true });
  let sourcePath = input.sourcePath ? path.resolve(input.sourcePath) : "";
  let removeTemporary = false;
  if (!sourcePath) {
    sourcePath = path.join(input.outputDir, `.full-fetch-result-${process.pid}-${Date.now()}.json`);
    atomicWriteJsonStream(sourcePath, input.document, path.basename(sourcePath));
    removeTemporary = true;
  }
  try {
    const parsed = readSmallJson<Record<string, unknown>>(sourcePath);
    if (fullFetchResultRunId(parsed) !== runId) throw new Error("Saved Full Fetch Result runId does not match the current run.");
    const sourceFileName = path.basename(sourcePath).replace(/^\./, "");
    const zipName = sourceFileName.replace(/\.json$/i, ".zip");
    const zipPath = path.join(input.outputDir, zipName);
    const created = createStreamingZip(zipPath, [{ name: sourceFileName, filePath: sourcePath }]);
    verifyStreamingZip(zipPath, created.entries);
    const source = hashFile(sourcePath);
    const archive = hashFile(zipPath);
    const summary = record(input.document.summary);
    return { runId, fileName: sourceFileName, compressedFileName: zipName, zipPath, originalSize: source.sizeBytes, compressedSize: archive.sizeBytes, originalSha256: source.sha256, compressedSha256: archive.sha256, issueCount: Number(summary.totalIssues ?? 0), included: true, generatedAutomatically: input.generatedAutomatically };
  } finally { if (removeTemporary) fs.rmSync(sourcePath, { force: true }); }
}
