import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AI_ANALYSIS_DB_SCHEMA_VERSION,
  AI_ANALYSIS_OUTPUT_SCHEMA_VERSION,
  AI_ANALYZED_FILE_SCHEMA_VERSION,
  AiAnalysisError,
  emptyTokenUsage,
  type AiAnalysisCandidate,
  type AiAnalysisRun,
  type AiApiContract,
  type AiCatalogEntry,
  type AiConnectionResult,
  type AiPendingDataset,
  type AiPublicSettings,
  type AiRulesSnapshot,
  type AiServiceKey,
  type AiSettingsUpdate,
  type AiTokenUsage
} from "../shared/aiAnalysisContract.js";
import {
  assertPendingAnalysisDocument,
  canonicalJson,
  sha256Canonical,
  type PendingAnalysisDocument
} from "../shared/pendingAnalysisContract.js";
import { parseEnvText, patchEnvText } from "./runtimeConfig.js";
import { loadManifestRulesSnapshot } from "./aiAnalysisRulesV0310.js";

export const AI_ENV_FORMAT_VERSION = "4";
const MAX_PENDING_BYTES = 64 * 1024 * 1024;
const AI_NEXUS_SECRET_KEY = "AI_NEXUS_TOKEN";
const DEPRECATED_OPENAI_KEYS = ["AI_CLOUD_PROVIDER", "AI_CLOUD_ENDPOINT", "AI_CLOUD_MODEL", "AI_CLOUD_API_CONTRACT", "AI_CLOUD_API_KEY", "AI_CLOUD_AUTH_TYPE", "AI_CLOUD_ORGANIZATION", "AI_CLOUD_PROJECT", "AI_CLOUD_CONTEXT_WINDOW", "AI_CLOUD_REQUEST_TIMEOUT_MS", "AI_CLOUD_MAX_OUTPUT_TOKENS", "AI_CLOUD_MAX_RETRIES", "OPENAI_API_KEY", "AI_API_KEY"] as const;

const CONFIG_KEYS = {
  provider: "AI_NEXUS_PROVIDER", endpoint: "AI_NEXUS_ENDPOINT", model: "AI_NEXUS_MODEL",
  apiContract: "AI_NEXUS_API_CONTRACT", authType: "AI_NEXUS_AUTH_TYPE", organization: "AI_NEXUS_ORGANIZATION",
  project: "AI_NEXUS_PROJECT", contextWindow: "AI_NEXUS_CONTEXT_WINDOW", timeoutMs: "AI_NEXUS_REQUEST_TIMEOUT_MS",
  maxOutputTokens: "AI_NEXUS_MAX_OUTPUT_TOKENS", maxRetries: "AI_NEXUS_MAX_RETRIES"
} as const;

export function sha256Text(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function integer(value: string | undefined, fallback: number | null, min = 0) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : fallback;
}

function safeEndpoint(value: string) {
  if (!value) return "";
  let url: URL;
  try { url = new URL(value); } catch { throw new AiAnalysisError("ENV_PARSE_ERROR", "AI endpoint is not a valid URL."); }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new AiAnalysisError("ENV_PARSE_ERROR", "AI endpoint must use HTTP(S) and must not contain credentials.");
  }
  return url.toString().replace(/\/$/, "");
}

function fingerprint(settings: Omit<AiPublicSettings, "configFingerprint">) {
  const { secretMask: _secretMask, ...publicValue } = settings;
  return sha256Canonical(publicValue);
}

export function publicSettings(service: "ai_nexus", values: Record<string, string>, loadedAt: string | null): AiPublicSettings {
  const keys = CONFIG_KEYS;
  const secret = values[AI_NEXUS_SECRET_KEY] ?? "";
  const apiContract: AiApiContract = values[keys.apiContract] === "chat_completions" ? "chat_completions" : "responses";
  const base = {
    service,
    provider: values[keys.provider] || "AI Nexus",
    endpoint: safeEndpoint(values[keys.endpoint] ?? ""),
    model: values[keys.model] ?? "",
    apiContract,
    authType: values[keys.authType] === "api_key" ? "api_key" as const : "bearer" as const,
    organization: values[keys.organization] ?? "",
    project: values[keys.project] ?? "",
    contextWindow: integer(values[keys.contextWindow], null, 1),
    timeoutMs: integer(values[keys.timeoutMs], 120000, 1000) ?? 120000,
    maxOutputTokens: integer(values[keys.maxOutputTokens], null, 1),
    maxRetries: Math.min(integer(values[keys.maxRetries], 2, 0) ?? 2, 5),
    secretConfigured: Boolean(secret),
    secretMask: secret ? "[configured]" : "",
    loadedAt,
    savedAt: null,
    testedFingerprint: null,
    connectionStatus: !secret || !values[keys.endpoint] || !values[keys.model] ? "not_configured" as const : "not_tested" as const,
    lastErrorCode: null
  };
  return { ...base, configFingerprint: fingerprint({ ...base, configFingerprint: undefined } as never) };
}

export function loadAiEnvironment(envPath: string, templatePath: string) {
  const loadedAt = new Date().toISOString();
  if (!fs.existsSync(envPath)) {
    const empty = publicSettings("ai_nexus", {}, null);
    return {
      found: false, envPath, templatePath, formatVersion: null, supported: false, sha256: "", mtimeMs: null,
      loadedAt, errorCode: "ENV_NOT_FOUND" as const,
      message: "Local .env was not found. Copy .env.version to .env and configure it; the app will not create credentials files automatically.",
      aiNexus: empty, deprecatedOpenAiKeysIgnored: false, localDatabaseConfigured: false, aiDatabaseConfigured: false,
      rulesDirectoryConfigured: false, values: {} as Record<string, string>
    };
  }
  const stat = fs.statSync(envPath);
  const text = fs.readFileSync(envPath, "utf8");
  const values = parseEnvText(text);
  const formatVersion = values.ENV_FORMAT_VERSION ?? null;
  const supported = formatVersion === AI_ENV_FORMAT_VERSION;
  return {
    found: true, envPath, templatePath, formatVersion, supported, sha256: sha256Text(text), mtimeMs: stat.mtimeMs,
    loadedAt, errorCode: supported ? null : "ENV_FORMAT_UNSUPPORTED" as const,
    message: supported ? "Configuration loaded." : `ENV_FORMAT_VERSION=${formatVersion ?? "missing"}; version ${AI_ENV_FORMAT_VERSION} is required.`,
    aiNexus: publicSettings("ai_nexus", values, loadedAt), deprecatedOpenAiKeysIgnored: DEPRECATED_OPENAI_KEYS.some((key) => key in values),
    localDatabaseConfigured: Boolean(values.LOCAL_DB_PATH || values.LOCAL_DATABASE_PATH), aiDatabaseConfigured: Boolean(values.AI_ANALYSIS_DB_PATH),
    rulesDirectoryConfigured: Boolean(values.AI_ANALYSIS_RULES_DIR), values
  };
}

export function saveAiSettings(envPath: string, update: AiSettingsUpdate) {
  if (!fs.existsSync(envPath)) throw new AiAnalysisError("ENV_NOT_FOUND", "Local .env does not exist.");
  const original = fs.readFileSync(envPath, "utf8");
  const stat = fs.statSync(envPath);
  if (sha256Text(original) !== update.expectedEnvSha256 || (update.expectedEnvMtimeMs !== null && Math.abs(stat.mtimeMs - update.expectedEnvMtimeMs) > 1)) {
    throw new AiAnalysisError("ENV_CONCURRENT_MODIFICATION", ".env changed after it was loaded. Reload before saving.");
  }
  if (update.service !== "ai_nexus") throw new AiAnalysisError("AI_NOT_CONFIGURED", "ChatGPT settings are managed by Codex App Server, not .env.");
  const keys = CONFIG_KEYS;
  const values: Record<string, string> = {
    ENV_FORMAT_VERSION: AI_ENV_FORMAT_VERSION,
    [keys.provider]: update.provider,
    [keys.endpoint]: safeEndpoint(update.endpoint),
    [keys.model]: update.model,
    [keys.apiContract]: update.apiContract,
    [keys.authType]: update.authType,
    [keys.organization]: update.organization,
    [keys.project]: update.project,
    [keys.contextWindow]: update.contextWindow === null ? "" : String(update.contextWindow),
    [keys.timeoutMs]: String(update.timeoutMs),
    [keys.maxOutputTokens]: update.maxOutputTokens === null ? "" : String(update.maxOutputTokens),
    [keys.maxRetries]: String(update.maxRetries)
  };
  if (!update.preserveSecret) values[AI_NEXUS_SECRET_KEY] = update.secret ?? "";
  const next = patchEnvText(original, values);
  const temporary = `${envPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, next, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, envPath);
  return loadAiEnvironment(envPath, path.join(path.dirname(envPath), ".env.version"));
}

function extractVersion(text: string, patterns: RegExp[], fallback = "unknown") {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return fallback;
}

export function loadRulesSnapshot(directory: string, allowedRoots: string[]): AiRulesSnapshot {
  return loadManifestRulesSnapshot(directory, allowedRoots);
}

export function loadPendingDataset(filePath: string): AiPendingDataset {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_PENDING_BYTES) throw new AiAnalysisError("INPUT_TOO_LARGE", "Pending-analysis file exceeds 64 MiB.");
  const raw = fs.readFileSync(filePath, "utf8");
  let document: PendingAnalysisDocument;
  try { document = assertPendingAnalysisDocument(JSON.parse(raw) as PendingAnalysisDocument); }
  catch (error) { throw new AiAnalysisError("ANALYSIS_INPUT_INVALID", error instanceof Error ? error.message : String(error)); }
  const diffs = document.records.map((record) => ({
    sourceDiffId: record.reference.sourceRecordStableId || record.reference.evidenceId,
    sourceContentHash: record.reference.sourceContentHash,
    evidenceId: record.reference.evidenceId,
    activityEventId: record.reference.activityEventId,
    issueKey: record.reference.issueKey ?? "",
    projectKey: record.reference.projectKey ?? "",
    actorId: record.reference.actor.stableIdentity ?? "",
    actorDisplayName: record.reference.actor.displayValue ?? "",
    fieldId: record.reference.fieldId ?? "",
    fieldName: record.reference.fieldName ?? "",
    eventTime: record.reference.eventTime ?? "",
    sourceProvenance: record.reference.sourceProvenance ?? "",
    diffStatus: record.diff.diffStatus ?? "",
    substantive: record.diff.isSubstantiveChange,
    addedLineCount: record.diff.addedLineCount ?? 0,
    removedLineCount: record.diff.removedLineCount ?? 0,
    diffHunks: record.diff.diffHunks.map((hunk) => ({ ...hunk, lines: hunk.lines.map((line) => ({ type: line.kind, text: line.text })) }))
  }));
  return {
    datasetId: `dataset_${sha256Text(raw).slice(0, 20)}`, fileName: path.basename(filePath), sourceFilePath: fs.realpathSync.native(path.resolve(filePath)), sourceFileSizeBytes: stat.size, importedAt: new Date().toISOString(), schemaVersion: document.schemaVersion,
    sourceFileSha256: sha256Text(raw), sourceDatabaseId: document.sourceDatabase.sourceDatabaseId,
    jiraServerFingerprint: document.sourceDatabase.jiraServerFingerprint, jiraServerHost: document.sourceDatabase.jiraServerHost,
    sourceSchemaVersion: document.sourceDatabase.sourceSchemaVersion, sourceView: document.sourceView, createdAt: document.createdAt,
    eventCount: document.records.length, eligibleCount: diffs.filter((item) => item.substantive).length,
    issues: new Set(diffs.map((item) => item.issueKey).filter(Boolean)).size,
    projects: new Set(diffs.map((item) => item.projectKey).filter(Boolean)).size,
    integrityStatus: "verified", errors: [], diffs
  };
}

function words(value: string) {
  return new Set(value.toLowerCase().normalize("NFKC").split(/[^\p{L}\p{N}_+#.-]+/u).filter((word) => word.length >= 3));
}

export function classifyOffline(dataset: AiPendingDataset, selectedIds: string[], rules: AiRulesSnapshot) {
  const selected = new Set(selectedIds);
  return dataset.diffs.filter((diff) => selected.has(diff.sourceDiffId)).map((diff) => {
    const changed = diff.diffHunks.flatMap((hunk) => hunk.lines).filter((line) => line.type === "insert" || line.type === "delete").map((line) => line.text).join(" ");
    const evidenceWords = words(`${diff.fieldName} ${changed}`);
    const candidates: AiAnalysisCandidate[] = rules.catalog.map((skill) => {
      const skillWords = words(`${skill.id.replace(/[_-]/g, " ")} ${skill.name} ${skill.group} ${skill.detailDescription ?? ""}`);
      const matches = [...skillWords].filter((word) => evidenceWords.has(word));
      const signal = Math.min(1, matches.length / Math.max(3, skillWords.size * 0.2));
      const evidence = diff.fieldName.toLowerCase() === "description" ? 0.82 : 0.65;
      const author = diff.actorId ? 1 : 0.3;
      const completeness = changed.length > 40 ? 1 : changed.length ? 0.5 : 0;
      const score = Math.round((signal * 0.4 + evidence * 0.25 + author * 0.2 + completeness * 0.15) * 100);
      return { skillId: skill.id, skillName: skill.name, group: skill.group, score, confidence: score / 100,
        positiveEvidenceRefs: matches.slice(0, 8), negativeEvidenceRefs: changed.length < 20 ? ["INSUFFICIENT_CONTENT"] : [],
        matchedRuleIds: matches.map((match) => `token:${match}`), reason: matches.length ? `Matched ${matches.length} field-aware evidence tokens.` : "No sufficient field-aware evidence.",
        status: score >= 55 && matches.length >= 2 ? "PENDING_REVIEW" as const : "UNKNOWN" as const };
    }).filter((item) => item.status === "PENDING_REVIEW").sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
    return {
      resultId: `result_${sha256Canonical({ sourceDiffId: diff.sourceDiffId, rules: rules.ruleSetId }).slice(0, 20)}`,
      sourceDiffId: diff.sourceDiffId, sourceContentHash: diff.sourceContentHash, evidenceRefs: [diff.evidenceId], candidates,
      status: candidates.length ? "PENDING_REVIEW" as const : changed.length ? "NEEDS_REVIEW" as const : "UNKNOWN" as const,
      analyzerVersion: rules.classificationEngineVersion, requestTraceId: null, usage: emptyTokenUsage("not_applicable"),
      rawResultAvailable: false, reviewNote: "", reviewedAt: null
    };
  });
}

function usageFrom(value: unknown): AiTokenUsage {
  const usage = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const details = usage.input_tokens_details && typeof usage.input_tokens_details === "object" ? usage.input_tokens_details as Record<string, unknown> : {};
  const outputDetails = usage.output_tokens_details && typeof usage.output_tokens_details === "object" ? usage.output_tokens_details as Record<string, unknown> : {};
  const number = (candidate: unknown) => typeof candidate === "number" ? candidate : null;
  const input = number(usage.input_tokens ?? usage.prompt_tokens), output = number(usage.output_tokens ?? usage.completion_tokens);
  return { inputTokens: input, cachedInputTokens: number(details.cached_tokens), outputTokens: output, reasoningTokens: number(outputDetails.reasoning_tokens),
    totalTokens: number(usage.total_tokens) ?? (input !== null && output !== null ? input + output : null), availability: input !== null || output !== null ? "actual" : "unavailable", estimatedInputTokens: null };
}

export async function callAiNexus(settings: AiPublicSettings, secret: string, input: string, signal?: AbortSignal): Promise<AiConnectionResult & { text: string; raw: Record<string, unknown> }> {
  if (!settings.endpoint || !settings.model || !secret) throw new AiAnalysisError("AI_NOT_CONFIGURED", "Endpoint, model, and secret are required.");
  const suffix = settings.apiContract === "responses" ? "/responses" : "/chat/completions";
  const url = settings.endpoint.replace(/\/$/, "") + suffix;
  const body = settings.apiContract === "responses"
    ? { model: settings.model, input, store: false, ...(settings.maxOutputTokens ? { max_output_tokens: settings.maxOutputTokens } : {}) }
    : { model: settings.model, messages: [{ role: "user", content: input }], ...(settings.maxOutputTokens ? { max_tokens: settings.maxOutputTokens } : {}) };
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${secret}` };
  const started = Date.now();
  let response: Response | undefined;
  for (let attempt = 0; attempt <= settings.maxRetries; attempt += 1) {
    if (signal?.aborted) throw new AiAnalysisError("RUN_CANCELLED", "AI request was cancelled.");
    try {
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(settings.timeoutMs)]) : AbortSignal.timeout(settings.timeoutMs);
      response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: requestSignal });
    } catch (error) {
      if (signal?.aborted) throw new AiAnalysisError("RUN_CANCELLED", "AI request was cancelled.");
      const timeout = error instanceof Error && /timeout|abort/i.test(error.name + error.message);
      if (attempt >= settings.maxRetries) throw new AiAnalysisError(timeout ? "AI_TIMEOUT" : "AI_ENDPOINT_UNREACHABLE", timeout ? "AI request timed out." : "AI endpoint is unreachable.", true);
    }
    if (response && ![408, 429].includes(response.status) && response.status < 500) break;
    if (attempt >= settings.maxRetries) break;
    const retryAfter = response?.headers.get("retry-after");
    const retryAfterMs = retryAfter && Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : 0;
    const delayMs = Math.max(retryAfterMs, Math.min(4000, 250 * (2 ** attempt))) + Math.floor(Math.random() * 100);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new AiAnalysisError("RUN_CANCELLED", "AI request was cancelled.")); }, { once: true });
    });
  }
  if (!response) throw new AiAnalysisError("AI_ENDPOINT_UNREACHABLE", "AI endpoint is unreachable.", true);
  const requestId = response.headers.get("x-request-id");
  const responseText = await response.text();
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(responseText) as Record<string, unknown>; } catch { /* mapped below */ }
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? "AI_AUTH_FAILED" : response.status === 404 ? "AI_MODEL_NOT_FOUND" : response.status === 408 ? "AI_TIMEOUT" : response.status === 429 ? "AI_RATE_LIMITED" : "AI_RESPONSE_INVALID";
    throw new AiAnalysisError(code, `AI request failed with HTTP ${response.status}.`, response.status === 429 || response.status >= 500);
  }
  const outputText = settings.apiContract === "responses"
    ? String(raw.output_text ?? ((raw.output as Array<Record<string, unknown>> | undefined)?.flatMap((item) => item.content as Array<Record<string, unknown>> ?? []).find((item) => item.type === "output_text")?.text ?? ""))
    : String(((raw.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message as Record<string, unknown> | undefined)?.content ?? "");
  if (!outputText) throw new AiAnalysisError("AI_RESPONSE_INVALID", "AI response did not contain output text.");
  return { ok: true, service: settings.service, testedFingerprint: settings.configFingerprint, statusCode: response.status, requestId,
    elapsedMs: Date.now() - started, errorCode: null, message: "Connection passed.", usage: usageFrom(raw.usage), sanitizedResponse: { status: response.status, requestId, model: raw.model ?? settings.model }, text: outputText, raw };
}

export function initializeAiDatabase(databasePath: string) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS source_datasets (dataset_id TEXT PRIMARY KEY, source_sha256 TEXT NOT NULL, source_database_id TEXT NOT NULL, jira_fingerprint TEXT NOT NULL, payload_json TEXT NOT NULL, imported_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rule_snapshots (snapshot_id TEXT PRIMARY KEY, rule_set_id TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analysis_runs (run_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, status TEXT NOT NULL, source_dataset_id TEXT NOT NULL, analyzer_mode TEXT NOT NULL, run_json TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT);
      CREATE TABLE IF NOT EXISTS run_items (run_id TEXT NOT NULL, source_diff_id TEXT NOT NULL, status TEXT NOT NULL, result_json TEXT, PRIMARY KEY(run_id, source_diff_id));
      CREATE TABLE IF NOT EXISTS batch_attempts (attempt_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, batch_index INTEGER NOT NULL, status TEXT NOT NULL, retry_count INTEGER NOT NULL, diagnostic_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS raw_results (result_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, payload_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS classification_candidates (result_id TEXT NOT NULL, skill_id TEXT NOT NULL, status TEXT NOT NULL, candidate_json TEXT NOT NULL, PRIMARY KEY(result_id, skill_id));
      CREATE TABLE IF NOT EXISTS reviews (review_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, result_id TEXT NOT NULL, prior_status TEXT NOT NULL, new_status TEXT NOT NULL, note TEXT NOT NULL, reviewed_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS export_records (export_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, format TEXT NOT NULL, file_path TEXT NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS diagnostics (diagnostic_id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);`);
    db.prepare("INSERT OR REPLACE INTO metadata(key,value) VALUES('schema_version',?)").run(String(AI_ANALYSIS_DB_SCHEMA_VERSION));
  } finally { db.close(); }
  return databasePath;
}

export function persistCompletedRun(databasePath: string, dataset: AiPendingDataset, run: AiAnalysisRun) {
  if (run.status !== "completed") throw new AiAnalysisError("PARTIAL_RESULT_FORBIDDEN", "Only completed analysis runs may be persisted.");
  initializeAiDatabase(databasePath);
  const db = new DatabaseSync(databasePath);
  try {
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT OR REPLACE INTO source_datasets VALUES(?,?,?,?,?,?)").run(dataset.datasetId, dataset.sourceFileSha256, dataset.sourceDatabaseId, dataset.jiraServerFingerprint, canonicalJson(dataset), new Date().toISOString());
    db.prepare("INSERT OR REPLACE INTO rule_snapshots VALUES(?,?,?,?)").run(sha256Canonical(run.rules), run.rules.ruleSetId, canonicalJson(run.rules), new Date().toISOString());
    db.prepare("INSERT INTO analysis_runs VALUES(?,?,?,?,?,?,?,?)").run(run.runId, run.revision, run.status, run.sourceDatasetId, run.analyzerMode, canonicalJson(run), run.startedAt, run.completedAt);
    const item = db.prepare("INSERT INTO run_items VALUES(?,?,?,?)");
    const candidate = db.prepare("INSERT INTO classification_candidates VALUES(?,?,?,?)");
    for (const result of run.results) {
      item.run(run.runId, result.sourceDiffId, result.status, canonicalJson(result));
      for (const value of result.candidates) candidate.run(result.resultId, value.skillId, value.status, canonicalJson(value));
    }
    db.exec("COMMIT");
  } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; }
  finally { db.close(); }
}

export function atomicExport(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporary, filePath);
    try {
      const directoryDescriptor = fs.openSync(path.dirname(filePath), "r");
      try { fs.fsyncSync(directoryDescriptor); } finally { fs.closeSync(directoryDescriptor); }
    } catch { /* Directory fsync is not supported on every Windows filesystem. */ }
  } catch (error) {
    if (descriptor !== null) fs.closeSync(descriptor);
    try { fs.unlinkSync(temporary); } catch { /* Best-effort staging cleanup. */ }
    throw error;
  }
  const reopened = fs.readFileSync(filePath, "utf8");
  if (sha256Text(reopened) !== sha256Text(content)) throw new AiAnalysisError("EXPORT_VALIDATION_FAILED", "Reopened export digest does not match.");
  return { filePath, sizeBytes: Buffer.byteLength(reopened), sha256: sha256Text(reopened) };
}

export function analyzedDocument(run: AiAnalysisRun) {
  const exportedRun = structuredClone(run);
  exportedRun.analyzedFilePath = run.analyzedFilePath ?? run.plannedAnalyzedFilePath ?? null;
  return { schemaName: "jira-activity-analyzer.analyzed-analysis", schemaVersion: AI_ANALYZED_FILE_SCHEMA_VERSION,
    contractVersion: AI_ANALYSIS_OUTPUT_SCHEMA_VERSION, fileType: "ANALYZED", exportedAt: new Date().toISOString(), run: exportedRun };
}

export function persistReview(databasePath: string, runId: string, resultId: string, priorStatus: string, newStatus: string, note: string) {
  initializeAiDatabase(databasePath);
  const db = new DatabaseSync(databasePath);
  try {
    const reviewedAt = new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    db.prepare("INSERT INTO reviews VALUES(?,?,?,?,?,?,?)").run(crypto.randomUUID(), runId, resultId, priorStatus, newStatus, note, reviewedAt);
    const row = db.prepare("SELECT run_json FROM analysis_runs WHERE run_id=?").get(runId) as { run_json?: string } | undefined;
    if (row?.run_json) {
      const run = JSON.parse(row.run_json) as AiAnalysisRun;
      const result = run.results.find((item) => item.resultId === resultId);
      if (result) { result.status = newStatus as typeof result.status; result.reviewNote = note; result.reviewedAt = reviewedAt; db.prepare("UPDATE analysis_runs SET run_json=? WHERE run_id=?").run(canonicalJson(run), runId); db.prepare("UPDATE run_items SET status=?, result_json=? WHERE run_id=? AND source_diff_id=?").run(newStatus, canonicalJson(result), runId, result.sourceDiffId); }
    }
    db.exec("COMMIT");
    return { reviewedAt };
  } catch (error) { try { db.exec("ROLLBACK"); } catch {} throw error; } finally { db.close(); }
}
