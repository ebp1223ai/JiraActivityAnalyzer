import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  AI_ANALYSIS_OUTPUT_SCHEMA_VERSION,
  AiAnalysisError,
  type AiAnalysisCandidate,
  type AiAnalysisRun,
  type AiDiffAnalysisResult,
  type AiNegativeCheck,
  type AiPendingDataset,
  type AiRulesSnapshot
} from "../shared/aiAnalysisContract.js";

export const COMPACT_PAYLOAD_SCHEMA_VERSION = "ai-analysis-compact-payload-v1" as const;
export const SINGLE_RUN_PROMPT_VERSION = "single-run-prompt-v1" as const;
export const GOLDEN_REPORT_RENDERER_VERSION = "golden-html-v1" as const;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function stable(value: unknown): Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return null;
}

export function canonicalJson(value: unknown) { return JSON.stringify(stable(value)); }
export function sha256(value: string | Buffer) { return crypto.createHash("sha256").update(value).digest("hex"); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

function changedLines(diff: AiPendingDataset["diffs"][number]) {
  const addedText: string[] = [];
  const removedText: string[] = [];
  for (const hunk of diff.diffHunks) for (const line of hunk.lines) {
    if (line.type === "insert") addedText.push(line.text);
    if (line.type === "delete") removedText.push(line.text);
  }
  return { addedText, removedText };
}

export type CompactAnalysisRecord = {
  recordIndex: number;
  sourceRecordStableId: string;
  activityEventId: string;
  evidenceId: string;
  sourceContentHash: string;
  issueKey: string;
  actor: string;
  eventTimestamp: string;
  sourceProvenance: string;
  fieldName: string;
  addedText: string[];
  removedText: string[];
  normalizedDiffEvidence: Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: Array<{ type: string; text: string }> }>;
};

export type CompactPayload = {
  schemaVersion: typeof COMPACT_PAYLOAD_SCHEMA_VERSION;
  buildAlgorithmVersion: "compact-builder-v1";
  maskingPolicy: "stable-identifiers-and-selected-diff-only";
  sourceDatasetSha256: string;
  rulesSnapshotId: string;
  eventCount: number;
  fieldMapping: Record<string, string>;
  records: CompactAnalysisRecord[];
};

export function buildCompactPayload(dataset: AiPendingDataset, selectedDiffIds: string[], rules: AiRulesSnapshot) {
  const selected = new Set(selectedDiffIds);
  if (selected.size !== selectedDiffIds.length) throw new AiAnalysisError("SOURCE_MISMATCH", "Selected Diff IDs must be unique.");
  const records = dataset.diffs.filter((diff) => selected.has(diff.sourceDiffId)).map((diff, index): CompactAnalysisRecord => {
    const changed = changedLines(diff);
    return {
      recordIndex: index,
      sourceRecordStableId: diff.sourceDiffId,
      activityEventId: diff.activityEventId,
      evidenceId: diff.evidenceId,
      sourceContentHash: diff.sourceContentHash,
      issueKey: diff.issueKey,
      actor: diff.actorDisplayName || diff.actorId,
      eventTimestamp: diff.eventTime,
      sourceProvenance: diff.sourceProvenance,
      fieldName: diff.fieldName || diff.fieldId,
      addedText: changed.addedText,
      removedText: changed.removedText,
      normalizedDiffEvidence: diff.diffHunks
    };
  });
  if (records.length !== selected.size) throw new AiAnalysisError("SOURCE_MISMATCH", "Selected Diff identity conservation failed while building compact payload.");
  for (const [label, values] of [
    ["sourceRecordStableId", records.map((record) => record.sourceRecordStableId)],
    ["activityEventId", records.map((record) => record.activityEventId)],
    ["evidenceId", records.map((record) => record.evidenceId)],
    ["sourceContentHash", records.map((record) => record.sourceContentHash)]
  ] as const) {
    if (values.some((value) => !value) || new Set(values).size !== values.length) {
      throw new AiAnalysisError("SOURCE_MISMATCH", `${label} must be present and unique for every selected record.`);
    }
  }
  const payload: CompactPayload = {
    schemaVersion: COMPACT_PAYLOAD_SCHEMA_VERSION,
    buildAlgorithmVersion: "compact-builder-v1",
    maskingPolicy: "stable-identifiers-and-selected-diff-only",
    sourceDatasetSha256: dataset.sourceFileSha256,
    rulesSnapshotId: rules.snapshotId ?? rules.ruleSetId,
    eventCount: records.length,
    fieldMapping: {
      sourceRecordStableId: "record.reference.sourceRecordStableId",
      activityEventId: "record.reference.activityEventId",
      evidenceId: "record.reference.evidenceId",
      sourceContentHash: "record.reference.sourceContentHash",
      normalizedDiffEvidence: "record.diff.diffHunks"
    },
    records
  };
  const json = canonicalJson(payload);
  return { payload, json, sizeBytes: Buffer.byteLength(json), sha256: sha256(json) };
}

function boundRuleText(rules: AiRulesSnapshot, kind: "manifest" | "catalog" | "rules") {
  const file = rules.files.find((item) => item.kind === kind);
  if (!file?.fullPath) throw new AiAnalysisError("ANALYSIS_RULES_INVALID", `Canonical ${kind} path is unavailable.`);
  const real = fs.realpathSync.native(path.resolve(file.fullPath));
  const value = fs.readFileSync(real, "utf8");
  if (sha256(value) !== file.sha256) throw new AiAnalysisError("ANALYSIS_RULES_INVALID", `${kind} changed after rules validation.`);
  return value;
}

export function singleRunOutputSchema() {
  const stringArray = { type: "array", items: { type: "string" } };
  const negative = { type: "object", additionalProperties: false, properties: { ruleId: { type: "string" }, passed: { type: "boolean" }, detail: { type: "string" }, evidenceRefs: stringArray }, required: ["ruleId", "passed", "detail", "evidenceRefs"] };
  const candidate = { type: "object", additionalProperties: false, properties: {
    skillId: { type: "string" }, score: { type: "number" }, confidence: { type: "string", enum: ["High", "Medium", "Low"] }, confidenceReason: { type: "string" },
    scoreComponents: { type: "object", additionalProperties: { type: "number" } }, positiveSignals: stringArray, positiveEvidenceRefs: stringArray,
    negativeChecks: { type: "array", items: negative }, negativeEvidenceRefs: stringArray,
    rejectedNearSkills: { type: "array", items: { type: "object", additionalProperties: false, properties: { skillId: { type: "string" }, reason: { type: "string" } }, required: ["skillId", "reason"] } }, evidenceQuote: { type: "string" }
  }, required: ["skillId", "score", "confidence", "confidenceReason", "scoreComponents", "positiveSignals", "positiveEvidenceRefs", "negativeChecks", "negativeEvidenceRefs", "rejectedNearSkills", "evidenceQuote"] };
  const record = { type: "object", additionalProperties: false, properties: {
    recordIndex: { type: "integer" }, sourceRecordStableId: { type: "string" }, activityEventId: { type: "string" }, evidenceId: { type: "string" }, sourceContentHash: { type: "string" },
    classificationStatus: { type: "string", enum: ["MATCHED", "EXCLUDED", "UNKNOWN"] }, reviewStatus: { type: "string", enum: ["PENDING_REVIEW"] }, reviewAttention: { type: "string", enum: ["STANDARD_REVIEW", "NEEDS_REVIEW"] },
    dispositionReason: { type: "string" }, exclusionReason: { type: ["string", "null"] }, unknownReason: { type: ["string", "null"] }, matchedRuleIds: stringArray,
    negativeChecks: { type: "array", items: negative }, analyses: { type: "array", items: candidate }
  }, required: ["recordIndex", "sourceRecordStableId", "activityEventId", "evidenceId", "sourceContentHash", "classificationStatus", "reviewStatus", "reviewAttention", "dispositionReason", "exclusionReason", "unknownReason", "matchedRuleIds", "negativeChecks", "analyses"] };
  return { type: "object", additionalProperties: false, properties: { schemaVersion: { type: "string", const: AI_ANALYSIS_OUTPUT_SCHEMA_VERSION }, records: { type: "array", items: record } }, required: ["schemaVersion", "records"] };
}

export function buildSingleRunPrompt(compact: ReturnType<typeof buildCompactPayload>, rules: AiRulesSnapshot) {
  const manifest = boundRuleText(rules, "manifest");
  const commonRules = boundRuleText(rules, "rules");
  const catalog = boundRuleText(rules, "catalog");
  const prompt = [
    `[TASK_AND_CONTRACT:${SINGLE_RUN_PROMPT_VERSION}]`,
    "Classify every supplied Activity Event exactly once. Never infer a Skill ID from group order, name similarity, or an _001 suffix. Apply attribution, positive evidence, negative/exclusion rules, automation/historical exclusions, near-skill discrimination, and confidence reasoning. Return only JSON matching the supplied schema. Preserve every identity field exactly. MATCHED requires at least one exact Catalog Skill ID; EXCLUDED and UNKNOWN must have no analyses. reviewStatus is always PENDING_REVIEW.",
    "[MANIFEST_BEGIN]", manifest, "[MANIFEST_END]",
    "[COMMON_RULES_BEGIN]", commonRules, "[COMMON_RULES_END]",
    "[SKILL_CATALOG_BEGIN]", catalog, "[SKILL_CATALOG_END]",
    "[COMPACT_ACTIVITY_EVENTS_BEGIN]", compact.json, "[COMPACT_ACTIVITY_EVENTS_END]",
    "[CONSERVATION] Return exactly one result for each compact record, in source order. No missing, duplicate, or extra recordIndex/sourceRecordStableId/activityEventId/evidenceId/sourceContentHash."
  ].join("\n");
  return { prompt, sizeBytes: Buffer.byteLength(prompt), sha256: sha256(prompt), outputSchema: singleRunOutputSchema() };
}

export type CapacityPreflight = {
  ok: boolean;
  inputEstimateTokens: number;
  modelCapacityTokens: number | null;
  reservedOutputTokens: number;
  safetyMarginTokens: number | null;
  requiredContextTokens: number | null;
  promptBytes: number;
  compactPayloadBytes: number;
  compactPayloadSha256: string;
  errorCode: "ANALYSIS_INPUT_CONTEXT_TOO_LARGE" | null;
  message: string;
};

export function preflightSingleRunCapacity(input: { promptBytes: number; compactPayloadBytes: number; compactPayloadSha256: string; eventCount: number; modelCapacityTokens: number | null; configuredMaxOutputTokens?: number | null }): CapacityPreflight {
  const inputEstimateTokens = Math.ceil(input.promptBytes / 3);
  const reservedOutputTokens = Math.max(input.configuredMaxOutputTokens ?? 0, 8192, input.eventCount * 640);
  const safetyMarginTokens = input.modelCapacityTokens === null ? null : Math.max(4096, Math.ceil(input.modelCapacityTokens * 0.08));
  const requiredContextTokens = safetyMarginTokens === null ? null : inputEstimateTokens + reservedOutputTokens + safetyMarginTokens;
  const ok = input.modelCapacityTokens !== null && requiredContextTokens !== null && requiredContextTokens <= input.modelCapacityTokens;
  return {
    ok, inputEstimateTokens, modelCapacityTokens: input.modelCapacityTokens, reservedOutputTokens, safetyMarginTokens, requiredContextTokens,
    promptBytes: input.promptBytes, compactPayloadBytes: input.compactPayloadBytes, compactPayloadSha256: input.compactPayloadSha256,
    errorCode: ok ? null : "ANALYSIS_INPUT_CONTEXT_TOO_LARGE",
    message: ok ? "Complete single-run input and reserved output fit the verified model context." : input.modelCapacityTokens === null ? "Model context capacity is unavailable; single-run safety cannot be proven." : "Complete single-run input exceeds the verified model context. Reduce the selected records or choose a larger-context model."
  };
}

function parseNegative(value: unknown, expectedEvidence: string): AiNegativeCheck[] {
  if (!Array.isArray(value) || !value.length) throw new AiAnalysisError("AI_RESPONSE_INVALID", "Every record and candidate requires auditable negativeChecks.");
  return value.map((raw) => {
    const item = object(raw); const evidenceRefs = strings(item.evidenceRefs);
    if (!text(item.ruleId) || !text(item.detail) || typeof item.passed !== "boolean" || evidenceRefs.some((ref) => ref !== expectedEvidence)) throw new AiAnalysisError("AI_RESPONSE_INVALID", "Invalid negative check or evidence reference.");
    return { ruleId: text(item.ruleId), passed: item.passed, detail: text(item.detail), evidenceRefs };
  });
}

export function parseSingleRunResponse(responseText: string, compact: CompactPayload, rules: AiRulesSnapshot, analyzerVersion: string, requestTraceId: string | null, usage: AiDiffAnalysisResult["usage"]) {
  let root: Record<string, unknown>;
  try { root = object(JSON.parse(responseText.replace(/^\x60\x60\x60json\s*|\s*\x60\x60\x60$/g, ""))); }
  catch { throw new AiAnalysisError("AI_RESPONSE_INVALID", "Single-run provider response is not valid JSON. No repair Turn was issued."); }
  if (root.schemaVersion !== AI_ANALYSIS_OUTPUT_SCHEMA_VERSION || !Array.isArray(root.records)) throw new AiAnalysisError("AI_RESPONSE_INVALID", "Single-run response schema version or records array is invalid.");
  if (root.records.length !== compact.records.length) throw new AiAnalysisError("AI_RESPONSE_INVALID", `Record conservation failed: expected ${compact.records.length}, received ${root.records.length}.`);
  const catalog = new Map(rules.catalog.map((skill) => [skill.id, skill]));
  const seen = new Set<number>();
  return root.records.map((raw, outputIndex): AiDiffAnalysisResult => {
    const item = object(raw); const expected = compact.records[outputIndex]; const recordIndex = number(item.recordIndex);
    if (recordIndex === null || !Number.isInteger(recordIndex) || seen.has(recordIndex) || recordIndex !== expected.recordIndex) throw new AiAnalysisError("AI_RESPONSE_INVALID", "recordIndex order/uniqueness conservation failed.");
    seen.add(recordIndex);
    for (const key of ["sourceRecordStableId", "activityEventId", "evidenceId", "sourceContentHash"] as const) if (text(item[key]) !== expected[key]) throw new AiAnalysisError("AI_RESPONSE_INVALID", `${key} conservation failed at record ${recordIndex}.`);
    const classification = text(item.classificationStatus);
    if (!(["MATCHED", "EXCLUDED", "UNKNOWN"] as string[]).includes(classification)) throw new AiAnalysisError("AI_RESPONSE_INVALID", `Invalid classificationStatus at record ${recordIndex}.`);
    if (item.reviewStatus !== "PENDING_REVIEW" || !(["STANDARD_REVIEW", "NEEDS_REVIEW"] as unknown[]).includes(item.reviewAttention)) throw new AiAnalysisError("AI_RESPONSE_INVALID", `Invalid review state at record ${recordIndex}.`);
    const negativeChecks = parseNegative(item.negativeChecks, expected.evidenceId);
    if (!Array.isArray(item.analyses)) throw new AiAnalysisError("AI_RESPONSE_INVALID", `analyses is required at record ${recordIndex}.`);
    if (classification === "MATCHED" && item.analyses.length === 0) throw new AiAnalysisError("AI_RESPONSE_INVALID", `MATCHED record ${recordIndex} has no Skill candidate.`);
    if (classification !== "MATCHED" && item.analyses.length !== 0) throw new AiAnalysisError("AI_RESPONSE_INVALID", `${classification} record ${recordIndex} must not contain Skill candidates.`);
    const candidates = item.analyses.map((rawCandidate): AiAnalysisCandidate => {
      const candidate = object(rawCandidate); const skillId = text(candidate.skillId); const skill = catalog.get(skillId);
      if (!skill) throw new AiAnalysisError("AI_RESPONSE_INVALID", `Skill ID ${skillId || "<empty>"} is not an exact Catalog ID.`);
      const positiveRefs = strings(candidate.positiveEvidenceRefs); const negativeRefs = strings(candidate.negativeEvidenceRefs);
      if ([...positiveRefs, ...negativeRefs].some((ref) => ref !== expected.evidenceId)) throw new AiAnalysisError("AI_RESPONSE_INVALID", `Candidate evidence mismatch at record ${recordIndex}.`);
      const confidence = text(candidate.confidence);
      if (!(["High", "Medium", "Low"] as string[]).includes(confidence)) throw new AiAnalysisError("AI_RESPONSE_INVALID", `Invalid confidence at record ${recordIndex}.`);
      const rejectedNearSkills = Array.isArray(candidate.rejectedNearSkills) ? candidate.rejectedNearSkills.map((near) => ({ skillId: text(object(near).skillId), reason: text(object(near).reason) })) : [];
      if (rejectedNearSkills.some((near) => !catalog.has(near.skillId) || !near.reason)) throw new AiAnalysisError("AI_RESPONSE_INVALID", `Invalid rejected near-skill at record ${recordIndex}.`);
      return {
        skillId, skillName: skill.name, group: skill.group, score: number(candidate.score), confidence: confidence === "High" ? 0.9 : confidence === "Medium" ? 0.65 : 0.4,
        confidenceLabel: confidence as "High" | "Medium" | "Low", confidenceReason: text(candidate.confidenceReason),
        scoreComponents: Object.fromEntries(Object.entries(object(candidate.scoreComponents)).filter(([, value]) => typeof value === "number")) as Record<string, number>,
        positiveSignals: strings(candidate.positiveSignals), positiveEvidenceRefs: positiveRefs, negativeChecks: parseNegative(candidate.negativeChecks, expected.evidenceId), negativeEvidenceRefs: negativeRefs,
        rejectedNearSkills, evidenceQuote: text(candidate.evidenceQuote), matchedRuleIds: strings(item.matchedRuleIds), reason: text(candidate.confidenceReason), status: "PENDING_REVIEW"
      };
    });
    const dispositionReason = text(item.dispositionReason);
    if (!dispositionReason) throw new AiAnalysisError("AI_RESPONSE_INVALID", `Disposition reason is required at record ${recordIndex}.`);
    return {
      resultId: `result_${sha256(`${expected.sourceRecordStableId}:${rules.snapshotId ?? rules.ruleSetId}`).slice(0, 20)}`,
      sourceDiffId: expected.sourceRecordStableId, sourceContentHash: expected.sourceContentHash, evidenceRefs: [expected.evidenceId], recordIndex,
      sourceRecordStableId: expected.sourceRecordStableId, activityEventId: expected.activityEventId, evidenceId: expected.evidenceId,
      classificationStatus: classification as "MATCHED" | "EXCLUDED" | "UNKNOWN", reviewStatus: "PENDING_REVIEW", reviewAttention: item.reviewAttention as "STANDARD_REVIEW" | "NEEDS_REVIEW",
      dispositionReason, exclusionReason: item.exclusionReason === null ? null : text(item.exclusionReason) || null, unknownReason: item.unknownReason === null ? null : text(item.unknownReason) || null,
      matchedRuleIds: strings(item.matchedRuleIds), negativeChecks, candidates,
      status: item.reviewAttention === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "PENDING_REVIEW", analyzerVersion, requestTraceId, usage, rawResultAvailable: true, reviewNote: "", reviewedAt: null
    };
  });
}

export function buildDistributionDiagnostics(results: AiDiffAnalysisResult[], rules: AiRulesSnapshot) {
  const firstByGroup = new Map<string, string>();
  for (const skill of rules.catalog) if (!firstByGroup.has(skill.group)) firstByGroup.set(skill.group, skill.id);
  const skillCounts = new Map<string, { skillId: string; skillName: string; group: string; count: number }>();
  const groupCounts = new Map<string, number>();
  let candidateCount = 0;
  let groupFirstCandidateCount = 0;
  let suffix001CandidateCount = 0;
  for (const candidate of results.flatMap((result) => result.candidates)) {
    candidateCount += 1;
    if (firstByGroup.get(candidate.group) === candidate.skillId) groupFirstCandidateCount += 1;
    if (candidate.skillId.endsWith("_001")) suffix001CandidateCount += 1;
    const skill = skillCounts.get(candidate.skillId) ?? { skillId: candidate.skillId, skillName: candidate.skillName, group: candidate.group, count: 0 };
    skill.count += 1;
    skillCounts.set(candidate.skillId, skill);
    groupCounts.set(candidate.group, (groupCounts.get(candidate.group) ?? 0) + 1);
  }
  return {
    candidateCount,
    distinctSkillCount: skillCounts.size,
    groupFirstCandidateCount,
    suffix001CandidateCount,
    bySkill: [...skillCounts.values()].sort((a, b) => b.count - a.count || a.skillId.localeCompare(b.skillId)),
    byGroup: [...groupCounts].map(([group, count]) => ({ group, count })).sort((a, b) => b.count - a.count || a.group.localeCompare(b.group))
  };
}
export function stageVisibleProviderResponse(folder: string, responseText: string) {
  fs.mkdirSync(folder, { recursive: true });
  const rawSha256 = sha256(responseText);
  const gzip = zlib.gzipSync(Buffer.from(responseText, "utf8"), { level: 9 });
  const filePath = path.join(folder, "provider-visible-final-response.json.gz");
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, gzip, { flag: "wx", mode: 0o600 });
  fs.renameSync(temporary, filePath);
  const reopened = fs.readFileSync(filePath);
  if (sha256(reopened) !== sha256(gzip) || zlib.gunzipSync(reopened).toString("utf8") !== responseText) throw new AiAnalysisError("EXPORT_VALIDATION_FAILED", "Provider response gzip read-back validation failed.");
  return { filePath, rawSizeBytes: Buffer.byteLength(responseText), rawSha256, gzipSizeBytes: reopened.length, gzipSha256: sha256(reopened) };
}

function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!); }
function safeJsonForScript(value: unknown) { return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026"); }

export function goldenHtmlForRun(run: AiAnalysisRun, dataset?: AiPendingDataset | null) {
  const evidence = new Map((dataset?.diffs ?? []).map((diff) => [diff.sourceDiffId, diff]));
  const rows = run.results.map((result) => {
    const diff = evidence.get(result.sourceDiffId);
    return {
      id: result.resultId, issue: diff?.issueKey ?? "Unavailable", actor: diff?.actorDisplayName || diff?.actorId || "Unavailable", field: diff?.fieldName || diff?.fieldId || "Unavailable", time: diff?.eventTime ?? "Unavailable",
      status: result.classificationStatus ?? (result.candidates.length ? "MATCHED" : result.status === "EXCLUDED" ? "EXCLUDED" : "UNKNOWN"), attention: result.reviewAttention ?? (result.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "STANDARD_REVIEW"),
      reason: result.dispositionReason ?? result.candidates[0]?.reason ?? "Unavailable", exclusionReason: result.exclusionReason ?? null, unknownReason: result.unknownReason ?? null,
      skills: result.candidates.map((candidate) => ({ id: candidate.skillId, name: candidate.skillName, group: candidate.group, score: candidate.score, confidence: candidate.confidenceLabel ?? candidate.confidence, reason: candidate.confidenceReason ?? candidate.reason, quote: candidate.evidenceQuote ?? "Unavailable", positive: candidate.positiveSignals ?? candidate.positiveEvidenceRefs, negative: candidate.negativeChecks ?? [], near: candidate.rejectedNearSkills ?? [] })),
      negativeChecks: result.negativeChecks ?? [], added: changedLines(diff ?? { diffHunks: [] } as never).addedText, removed: changedLines(diff ?? { diffHunks: [] } as never).removedText
    };
  });
  const counts = rows.reduce((value, row) => { value[row.status] = (value[row.status] ?? 0) + 1; if (row.attention === "NEEDS_REVIEW") value.NEEDS_REVIEW = (value.NEEDS_REVIEW ?? 0) + 1; return value; }, {} as Record<string, number>);
  const skillRanking = new Map<string, { id: string; name: string; group: string; count: number }>();
  for (const row of rows) for (const skill of row.skills) { const current = skillRanking.get(skill.id) ?? { id: skill.id, name: skill.name, group: skill.group, count: 0 }; current.count += 1; skillRanking.set(skill.id, current); }
  const report = { rows, counts, skills: [...skillRanking.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)), distribution: run.distributionDiagnostics ?? null, legacy: run.legacySchemaVersion ?? null };
  const cards = rows.map((row) => `<article class="event" data-status="${escapeHtml(row.status)}" data-attention="${escapeHtml(row.attention)}" data-issue="${escapeHtml(row.issue)}" data-actor="${escapeHtml(row.actor)}" data-groups="${escapeHtml(JSON.stringify([...new Set(row.skills.map((skill) => skill.group))]))}" data-search="${escapeHtml([row.issue,row.actor,row.field,row.reason,...row.skills.flatMap((s)=>[s.id,s.name,s.group])].join(" ").toLowerCase())}"><button class="event-head" aria-expanded="false"><span><b>${escapeHtml(row.issue)}</b> · ${escapeHtml(row.actor)} · ${escapeHtml(row.field)}</span><span class="pill ${escapeHtml(row.status.toLowerCase())}">${escapeHtml(row.status)}</span></button><div class="event-body" hidden><div class="meta"><span>${escapeHtml(row.time)}</span><span>${escapeHtml(row.attention)}</span></div><h3>判定理由 / Disposition</h3><p>${escapeHtml(row.reason)}</p>${row.exclusionReason ? `<p><b>Exclusion:</b> ${escapeHtml(row.exclusionReason)}</p>` : ""}${row.unknownReason ? `<p><b>Unknown:</b> ${escapeHtml(row.unknownReason)}</p>` : ""}<h3>原始 Diff Evidence</h3><div class="diff"><pre class="removed">${escapeHtml(row.removed.join("\n") || "Unavailable")}</pre><pre class="added">${escapeHtml(row.added.join("\n") || "Unavailable")}</pre></div><h3>分析結果</h3>${row.skills.length ? row.skills.map((skill) => `<section class="skill"><b>${escapeHtml(skill.id)} · ${escapeHtml(skill.name)}</b><span>${escapeHtml(skill.group)} · ${escapeHtml(skill.score ?? "Unavailable")} · ${escapeHtml(skill.confidence ?? "Unavailable")}</span><p>${escapeHtml(skill.reason)}</p><blockquote>${escapeHtml(skill.quote)}</blockquote><details><summary>Evidence / Negative Checks / Near Skills</summary><p><b>Positive:</b> ${escapeHtml(skill.positive.join(" · ") || "Unavailable")}</p><ul>${skill.negative.map((check) => `<li>${escapeHtml(check.ruleId)}: ${escapeHtml(check.passed ? "Passed" : "Triggered")} — ${escapeHtml(check.detail)}</li>`).join("") || "<li>Unavailable</li>"}</ul><ul>${skill.near.map((near) => `<li>Rejected ${escapeHtml(near.skillId)} — ${escapeHtml(near.reason)}</li>`).join("") || "<li>Near-skill rejection: Unavailable</li>"}</ul></details></section>`).join("") : "<p>Skill candidates: Unavailable / Not applicable</p>"}<h3>Record Negative Checks</h3><ul>${row.negativeChecks.map((check) => `<li>${escapeHtml(check.ruleId)}: ${escapeHtml(check.passed ? "Passed" : "Triggered")} — ${escapeHtml(check.detail)}</li>`).join("") || "<li>Unavailable</li>"}</ul></div></article>`).join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>Activity Event Diff 技能分析結果</title><style>:root{color-scheme:light;font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}.shell{max-width:1500px;margin:auto;padding:28px}.hero{background:#102a43;color:white;padding:26px;border-left:6px solid #2dd4bf}.hero h1{margin:0 0 8px}.path{overflow-wrap:anywhere;font-family:ui-monospace;font-size:12px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:16px 0}.metric,.panel,.event{background:white;border:1px solid #d7e0ea;border-radius:6px}.metric{padding:15px}.metric b{display:block;font-size:26px}.panel{padding:18px;margin:14px 0}.controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.controls input{grid-column:span 2}.controls input,.controls select,.controls button{min-height:38px;border:1px solid #b8c5d2;background:white;padding:8px}.ranking{width:100%;border-collapse:collapse}.ranking th,.ranking td{border-bottom:1px solid #e3e9ef;padding:8px;text-align:left}.event{margin:9px 0;overflow:hidden}.event-head{width:100%;display:flex;justify-content:space-between;gap:12px;border:0;background:white;padding:14px;text-align:left}.event-body{padding:0 16px 18px;border-top:1px solid #e3e9ef}.pill{font-size:11px;font-weight:800;padding:4px 7px;border-radius:4px;background:#e8eef5}.matched{background:#d9fbe8;color:#086c43}.excluded{background:#ffe5e5;color:#9b1c1c}.unknown{background:#fff1c7;color:#7a4d00}.meta,.skill{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px}.skill{display:block;border-left:4px solid #2563eb;padding:10px 14px;margin:10px 0;background:#f8fbff}.skill>span{float:right;color:#536477}.diff{display:grid;grid-template-columns:1fr 1fr;gap:10px}.diff pre{margin:0;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:300px;overflow:auto}.removed{background:#fff0f0}.added{background:#ecfff5}blockquote{border-left:3px solid #94a3b8;margin:8px 0;padding-left:10px}footer{font-size:12px;color:#64748b;margin-top:20px}@media(max-width:800px){.controls,.diff{grid-template-columns:1fr}.shell{padding:12px}}@media print{body{background:white}.shell{max-width:none;padding:0}.controls{display:none}.event-body{display:block!important}.event{break-inside:avoid}.hero{background:white;color:black;border:1px solid #222}}</style></head><body><main class="shell"><header class="hero"><h1>Activity Event Diff 技能分析結果</h1><p>Golden HTML Report · ${escapeHtml(GOLDEN_REPORT_RENDERER_VERSION)}</p><div class="path">Run ${escapeHtml(run.runId)} · App ${escapeHtml(run.appVersion ?? "Unavailable")} · Build ${escapeHtml(run.packagedSourceCommit ?? "Unavailable")} · Build Time ${escapeHtml(run.buildTime ?? "Unavailable")} · ${escapeHtml(run.completedAt ?? "Unavailable")}</div></header>${report.legacy ? `<div class="panel"><b>Legacy compatibility warning</b><p>Imported schema ${escapeHtml(report.legacy)} lacks some v0.3.11 evidence fields. Missing values are shown as Unavailable.</p></div>` : ""}<section class="metrics" aria-label="Analysis summary"><div class="metric"><span>Total records</span><b>${rows.length}</b></div><div class="metric"><span>MATCHED</span><b>${counts.MATCHED ?? 0}</b></div><div class="metric"><span>EXCLUDED</span><b>${counts.EXCLUDED ?? 0}</b></div><div class="metric"><span>UNKNOWN</span><b>${counts.UNKNOWN ?? 0}</b></div><div class="metric"><span>NEEDS_REVIEW</span><b>${counts.NEEDS_REVIEW ?? 0}</b></div></section><section class="panel"><h2>分析與規則快照</h2><div class="path">Source: ${escapeHtml(run.sourceFilePath ?? run.sourceFileName)}<br>Source SHA-256: ${escapeHtml(run.sourceFileSha256)}<br>Rules Snapshot: ${escapeHtml(run.rules.snapshotId ?? run.rules.ruleSetId)}<br>Provider: ${escapeHtml(run.provider)} · Requests ${run.progress.requestCount} · Threads ${run.progress.threadCount ?? "Unavailable"} · Turns ${run.progress.turnCount ?? "Unavailable"}<br>Token Usage: ${escapeHtml(run.progress.usage.totalTokens ?? "Unavailable")}<br>Prompt: ${escapeHtml(run.promptTemplateVersion ?? "Unavailable")} · SHA-256 ${escapeHtml(run.promptSha256 ?? "Unavailable")}<br>Distribution: ${escapeHtml(run.distributionDiagnostics?.candidateCount ?? "Unavailable")} candidates · ${escapeHtml(run.distributionDiagnostics?.distinctSkillCount ?? "Unavailable")} distinct Skills · ${escapeHtml(run.distributionDiagnostics?.groupFirstCandidateCount ?? "Unavailable")} group-first · ${escapeHtml(run.distributionDiagnostics?.suffix001CandidateCount ?? "Unavailable")} suffix _001</div></section><section class="panel"><h2>Skill Ranking</h2><table class="ranking"><thead><tr><th>Skill ID</th><th>Name</th><th>Group</th><th>Count</th></tr></thead><tbody>${report.skills.map((skill) => `<tr><td>${escapeHtml(skill.id)}</td><td>${escapeHtml(skill.name)}</td><td>${escapeHtml(skill.group)}</td><td>${skill.count}</td></tr>`).join("") || "<tr><td colspan=4>Unavailable</td></tr>"}</tbody></table></section><section class="panel"><h2>逐筆 Diff 與分析結果</h2><div class="controls"><input id="search" type="search" placeholder="搜尋 Issue、Actor、Diff、Skill、理由…"><select id="actor"><option value="">全部 Actor</option></select><select id="issue"><option value="">全部 Issue</option></select><select id="group"><option value="">全部 Skill Group</option></select><select id="status"><option value="">全部狀態</option><option>MATCHED</option><option>EXCLUDED</option><option>UNKNOWN</option></select><select id="attention"><option value="">全部 Review</option><option>STANDARD_REVIEW</option><option>NEEDS_REVIEW</option></select><button id="expand">全部展開</button><button id="collapse">全部收合</button><button id="print">列印</button></div><p id="visibleCount"></p><div id="events">${cards}</div></section><footer>Self-contained offline report. No CDN, analytics, network request, credential, or external asset.</footer></main><script id="report-data" type="application/json">${safeJsonForScript(report)}</script><script>(()=>{const report=JSON.parse(document.querySelector('#report-data').textContent),events=[...document.querySelectorAll('.event')],search=document.querySelector('#search'),actor=document.querySelector('#actor'),issue=document.querySelector('#issue'),group=document.querySelector('#group'),status=document.querySelector('#status'),attention=document.querySelector('#attention'),count=document.querySelector('#visibleCount');function options(select,values){for(const value of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b))){const option=document.createElement('option');option.value=value;option.textContent=value;select.append(option)}}options(actor,report.rows.map(row=>row.actor));options(issue,report.rows.map(row=>row.issue));options(group,report.skills.map(skill=>skill.group));function apply(){const q=search.value.trim().toLowerCase();let n=0;for(const e of events){const groups=JSON.parse(e.dataset.groups||'[]'),show=(!q||e.dataset.search.includes(q))&&(!actor.value||e.dataset.actor===actor.value)&&(!issue.value||e.dataset.issue===issue.value)&&(!group.value||groups.includes(group.value))&&(!status.value||e.dataset.status===status.value)&&(!attention.value||e.dataset.attention===attention.value);e.hidden=!show;if(show)n++}count.textContent='顯示 '+n+' / '+events.length+' 筆'}for(const e of events)e.querySelector('.event-head').addEventListener('click',()=>{const body=e.querySelector('.event-body'),open=body.hidden;body.hidden=!open;e.querySelector('.event-head').setAttribute('aria-expanded',String(open))});for(const el of [search,actor,issue,group,status,attention])el.addEventListener('input',apply);document.querySelector('#expand').onclick=()=>events.forEach(e=>{e.querySelector('.event-body').hidden=false});document.querySelector('#collapse').onclick=()=>events.forEach(e=>{e.querySelector('.event-body').hidden=true});document.querySelector('#print').onclick=()=>window.print();apply()})()</script></body></html>`;
}

export function validateGoldenHtml(html: string, expectedRecords: number) {
  const required = ["Activity Event Diff 技能分析結果", "分析與規則快照", "Skill Ranking", "逐筆 Diff 與分析結果", "原始 Diff Evidence", "Record Negative Checks", "id=\"search\"", "id=\"actor\"", "id=\"issue\"", "id=\"group\"", "@media print", "Content-Security-Policy"];
  const missing = required.filter((marker) => !html.includes(marker));
  const externalAssets = /<(?:script|img)[^>]+src\s*=|<link[^>]+href\s*=|fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/i.test(html);
  const eventCount = (html.match(/<article class="event"/g) ?? []).length;
  if (missing.length || externalAssets || eventCount !== expectedRecords) throw new AiAnalysisError("EXPORT_VALIDATION_FAILED", `Golden HTML validation failed: missing=${missing.join(",") || "none"}, external=${externalAssets}, records=${eventCount}/${expectedRecords}.`);
  return { valid: true, eventCount, externalAssets: false, semanticSections: required.length };
}


export function adaptLegacyAnalyzedRun(run: AiAnalysisRun, schemaVersion: string) {
  const adapted = structuredClone(run);
  adapted.legacySchemaVersion = schemaVersion;
  adapted.results = adapted.results.map((result, recordIndex) => ({
    ...result,
    recordIndex: result.recordIndex ?? recordIndex,
    sourceRecordStableId: result.sourceRecordStableId ?? result.sourceDiffId,
    evidenceId: result.evidenceId ?? result.evidenceRefs[0] ?? "",
    classificationStatus: result.classificationStatus ?? (result.status === "EXCLUDED" ? "EXCLUDED" : result.status === "UNKNOWN" || result.status === "NEEDS_REVIEW" && !result.candidates.length ? "UNKNOWN" : "MATCHED"),
    reviewStatus: result.reviewStatus ?? (result.status === "CONFIRMED" || result.status === "REJECTED" ? result.status : "PENDING_REVIEW"),
    reviewAttention: result.reviewAttention ?? (result.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "STANDARD_REVIEW"),
    dispositionReason: result.dispositionReason ?? result.candidates[0]?.reason ?? "Unavailable in legacy schema.",
    exclusionReason: result.exclusionReason ?? null,
    unknownReason: result.unknownReason ?? null,
    matchedRuleIds: result.matchedRuleIds ?? result.candidates.flatMap((candidate) => candidate.matchedRuleIds),
    negativeChecks: result.negativeChecks ?? [],
    legacyCompatibilityWarning: `Imported from ${schemaVersion}; v0.3.11 evidence fields may be unavailable.`
  }));
  return adapted;
}
