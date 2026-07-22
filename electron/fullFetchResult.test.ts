import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFullFetchResultDocument, fullFetchResultRunId, saveFullFetchResult, zipFullFetchResult } from "./fullFetchResult.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-full-fetch-result-v3-"));
try {
  const forbiddenEmbeddedPayload = "must-not-be-embedded".repeat(100_000);
  const document = buildFullFetchResultDocument({
    app: { name: "Jira Activity Analyzer", version: "0.2.31", buildTime: "test", gitCommit: "test", gitBranch: "test" },
    run: { runId: "full-fetch-file-backed-1", status: "completed" },
    requestContext: { selectedUser: "fixture.user", dateRange: { start: "2026-07-01", end: "2026-07-22" } },
    stagingReference: { stagingId: "FFS-FILE-BACKED-1", resultIndex: "full-fetch-result.json" },
    summary: { totalIssues: 1, stagingSizeBytes: 4096 },
    fetchReport: [{ issueKey: "ABC-1", fetchStatus: "success" }],
    issueResults: [{
      issueKey: "ABC-1",
      fetchStatus: "success",
      status: "eligible",
      sizeBytes: 2048,
      currentIssueSnapshotRef: { path: "issues/ABC-1/current-issue-snapshot.json", sha256: "a".repeat(64), sizeBytes: 1024, recordCount: 1 },
      normalizedCurrentFieldsRef: { path: "issues/ABC-1/normalized-current-fields.json", sha256: "b".repeat(64), sizeBytes: 512, recordCount: 1 },
      issueManifestRef: { path: "issues/ABC-1/issue-manifest.json", sha256: "c".repeat(64), sizeBytes: 512, recordCount: 1 },
      issue: { fields: { description: forbiddenEmbeddedPayload } },
      comments: [{ body: forbiddenEmbeddedPayload }]
    }],
    directJiraEvidence: { summary: { directEvidenceCount: 1 }, excludedSummary: {}, files: { events: "issues/ABC-1/evidence.ndjson" }, events: [{ raw: forbiddenEmbeddedPayload }] },
    relatedCandidateIssues: [],
    warnings: [],
    errors: [],
    diagnostics: { fileBacked: true },
    debugLogSanitized: ["[INFO] file-backed test"]
  });

  assert.equal(fullFetchResultRunId(document), "full-fetch-file-backed-1");
  const serialized = JSON.stringify(document);
  assert.equal(serialized.includes(forbiddenEmbeddedPayload), false);
  assert.equal(serialized.includes("current-issue-snapshot.json"), true);
  assert.equal((document.canonicalDataPolicy as Record<string, unknown>).runLevelRawEmbedded, false);

  const saved = saveFullFetchResult(document, root, "user-analysis-full-fetch-test.json");
  assert.match(saved.sha256, /^[a-f0-9]{64}$/);
  assert.ok(saved.fileSize < 1024 * 1024);
  const roundTrip = JSON.parse(fs.readFileSync(saved.filePath, "utf8")) as Record<string, unknown>;
  assert.equal(fullFetchResultRunId(roundTrip), "full-fetch-file-backed-1");
  assert.equal(JSON.stringify(roundTrip).includes(forbiddenEmbeddedPayload), false);

  const compressed = zipFullFetchResult({ document, sourcePath: saved.filePath, outputDir: root, generatedAutomatically: false });
  assert.equal(compressed.runId, "full-fetch-file-backed-1");
  assert.match(compressed.compressedSha256, /^[a-f0-9]{64}$/);
  assert.ok(fs.existsSync(compressed.zipPath));
  assert.ok(compressed.compressedSize > 0);

  const automatic = zipFullFetchResult({ document, outputDir: root, generatedAutomatically: true });
  assert.equal(automatic.generatedAutomatically, true);
  assert.ok(fs.existsSync(automatic.zipPath));
  console.log("Full Fetch Result lightweight streaming tests passed.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
