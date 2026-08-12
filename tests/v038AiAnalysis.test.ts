import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  AI_ENV_FORMAT_VERSION,
  analyzedDocument,
  atomicExport,
  callAiNexus,
  classifyOffline,
  initializeAiDatabase,
  loadAiEnvironment,
  loadRulesSnapshot,
  persistCompletedRun,
  saveAiSettings,
  sha256Text
} from "../electron/aiAnalysisCore.js";
import { emptyTokenUsage, type AiAnalysisRun, type AiPendingDataset } from "../shared/aiAnalysisContract.js";

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v038-"));
  try {
    const envPath = path.join(root, ".env");
    const templatePath = path.join(root, ".env.version");
    const missing = loadAiEnvironment(envPath, templatePath);
    assert.equal(missing.found, false);
    assert.equal(missing.errorCode, "ENV_NOT_FOUND");
    assert.equal(fs.existsSync(envPath), false, "missing .env must not be created");

    fs.writeFileSync(envPath, `ENV_FORMAT_VERSION=${AI_ENV_FORMAT_VERSION}\nAI_NEXUS_PROVIDER=Mock\nAI_NEXUS_ENDPOINT=http://127.0.0.1:1/v1\nAI_NEXUS_MODEL=test-model\nAI_NEXUS_API_CONTRACT=responses\nAI_NEXUS_TOKEN=secret-value\nAI_NEXUS_TIMEOUT_MS=2000\n`, "utf8");
    let environment = loadAiEnvironment(envPath, templatePath);
    assert.equal(environment.supported, true);
    assert.equal(environment.aiNexus.secretConfigured, true);
    assert.equal(JSON.stringify(environment.aiNexus).includes("secret-value"), false, "public settings must not expose secrets");
    environment = saveAiSettings(envPath, { service: "ai_nexus", provider: "Mock 2", endpoint: "http://127.0.0.1:1/v1", model: "model-2", apiContract: "responses", authType: "bearer", organization: "", project: "", contextWindow: 8192, timeoutMs: 3000, maxOutputTokens: 512, maxRetries: 1, preserveSecret: true, expectedEnvSha256: environment.sha256, expectedEnvMtimeMs: environment.mtimeMs });
    assert.equal(environment.aiNexus.provider, "Mock 2");
    assert.match(fs.readFileSync(envPath, "utf8"), /AI_NEXUS_TOKEN=secret-value/);
    assert.throws(() => saveAiSettings(envPath, { service: "ai_nexus", provider: "x", endpoint: "http://127.0.0.1/v1", model: "x", apiContract: "responses", authType: "bearer", organization: "", project: "", contextWindow: null, timeoutMs: 1000, maxOutputTokens: null, maxRetries: 0, preserveSecret: true, expectedEnvSha256: "stale", expectedEnvMtimeMs: environment.mtimeMs }), /changed after it was loaded/);

    const rulesDir = path.join(root, "rules"); fs.mkdirSync(rulesDir);
    fs.writeFileSync(path.join(rulesDir, "Skill_Analysis_Rule_Set_Manifest.md"), "# Manifest\n- Manifest Schema Version: `0.1.0`\n- Rule Set ID: `SYNTHETIC-RULESET-1`\n- skill_catalog_file: `Skill_Catalog_v0.3.0.md`\n- common_rules_file: `Skill_Classification_Common_Rules_v1.1.0.md`\n");
    fs.writeFileSync(path.join(rulesDir, "Skill_Catalog_v0.3.0.md"), "# Catalog\nVersion: 0.3.0\n| Skill ID | Skill Name | Group | Detail |\n|---|---|---|---|\n| DEV_TYPESCRIPT | TypeScript Development | Engineering | Implements typed TypeScript services |\n| DOC_TECHNICAL | Technical Documentation | Documentation | Writes technical documentation |\n");
    fs.writeFileSync(path.join(rulesDir, "Skill_Classification_Common_Rules_v1.1.0.md"), "# Rules\nVersion: 1.1.0\n## Positive evidence\n- Match field-aware tokens.\n## Negative evidence\n- Never classify from one keyword.\n");
    const rules = loadRulesSnapshot(rulesDir, [root]);
    assert.equal(rules.valid, true);
    assert.equal(rules.catalogCount, 2);
    assert.equal(rules.files.every((file) => file.sha256.length === 64), true);

    const dataset: AiPendingDataset = { datasetId: "dataset-synthetic", fileName: "pending-analysis-synthetic.json", schemaVersion: "0.3.3-draft.1", sourceFileSha256: "a".repeat(64), sourceDatabaseId: "db-synthetic", jiraServerFingerprint: "b".repeat(64), jiraServerHost: "jira.invalid", sourceSchemaVersion: 4, sourceView: "USER_ALL_ACTIVITY_EVENTS", createdAt: new Date().toISOString(), eventCount: 1, eligibleCount: 1, issues: 1, projects: 1, integrityStatus: "verified", errors: [], diffs: [{ sourceDiffId: "diff-1", sourceContentHash: "c".repeat(64), evidenceId: "evidence-1", activityEventId: "event-1", issueKey: "SYN-1", projectKey: "SYN", actorId: "user-1", actorDisplayName: "Synthetic User", fieldId: "description", fieldName: "Description", eventTime: new Date().toISOString(), sourceProvenance: "jira_changelog", diffStatus: "changed", substantive: true, addedLineCount: 1, removedLineCount: 0, diffHunks: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: [{ type: "insert", text: "Implemented typed TypeScript services and technical documentation" }] }] }] };
    const results = classifyOffline(dataset, ["diff-1"], rules);
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "PENDING_REVIEW");
    assert.equal(results[0].candidates.some((item) => item.skillId === "DEV_TYPESCRIPT"), true);

    const server = http.createServer((request, response) => {
      assert.equal(request.method, "POST");
      assert.equal(request.headers.authorization, "Bearer secret-value");
      let body = ""; request.on("data", (chunk) => body += chunk); request.on("end", () => {
        assert.equal((JSON.parse(body) as { store: boolean }).store, false);
        response.writeHead(200, { "content-type": "application/json", "x-request-id": "req-synthetic" });
        response.end(JSON.stringify({ output_text: "OK", usage: { input_tokens: 4, output_tokens: 1, total_tokens: 5 } }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const provider = await callAiNexus({ ...environment.aiNexus, endpoint: `http://127.0.0.1:${address.port}/v1`, configFingerprint: "synthetic-fingerprint" }, "secret-value", "OK");
    server.close();
    assert.equal(provider.ok, true); assert.equal(provider.requestId, "req-synthetic"); assert.equal(provider.usage.totalTokens, 5);

    const startedAt = new Date().toISOString();
    const run: AiAnalysisRun = { runId: "run-synthetic", revision: 1, status: "completed", analyzerMode: "OFFLINE_RULE", sourceDatasetId: dataset.datasetId, sourceFileName: dataset.fileName, sourceFileSha256: dataset.sourceFileSha256, sourceDatabaseId: dataset.sourceDatabaseId, jiraServerFingerprint: dataset.jiraServerFingerprint, selectedDiffIds: ["diff-1"], provider: "offline_rule", model: "offline-rule-v1", apiContract: "offline", configFingerprint: null, rules, startedAt, completedAt: new Date().toISOString(), progress: { runId: "run-synthetic", status: "completed", totalBatches: 1, completedBatches: 1, failedBatches: 0, currentBatch: 1, totalDiffs: 1, completedDiffs: 1, requestCount: 0, retryCount: 0, elapsedMs: 1, usage: emptyTokenUsage("not_applicable"), message: "Completed", errorCode: null }, results, analyzedFileName: "analyzed-synthetic.json", analyzedFilePath: null, databasePath: null };
    const dbPath = path.join(root, "ai-analysis.sqlite3"); initializeAiDatabase(dbPath); persistCompletedRun(dbPath, dataset, run);
    assert.equal(fs.readFileSync(dbPath).subarray(0, 16).toString(), "SQLite format 3\0");
    const exported = atomicExport(path.join(root, "analyzed.json"), JSON.stringify(analyzedDocument(run), null, 2));
    assert.equal(exported.sha256, sha256Text(fs.readFileSync(exported.filePath)));
    assert.throws(() => persistCompletedRun(dbPath, dataset, { ...run, runId: "partial", status: "partial" }), /Only completed/);
    console.log("AI Analysis core regression tests passed");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });
