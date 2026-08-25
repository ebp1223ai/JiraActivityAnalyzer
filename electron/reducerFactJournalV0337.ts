import fs from "node:fs";
import path from "node:path";
import { sha256BytesV0337 } from "./durableIoV0337.js";
import type { JsonValue } from "./providerAnalysisContractsV0337.js";

export const REDUCER_FACT_JOURNAL_VERSION_V0337 = "jaa-reducer-fact-journal-v1" as const;
export type ReducerFactTypeV0337 = "PROVIDER_PREPARED" | "PROVIDER_SENT" | "PROVIDER_ACCEPTED" | "PROVIDER_COMPLETED" | "PROVIDER_FAILED" | "ARTIFACT_RECEIVED" | "ARTIFACT_PERSISTED" | "VALIDATION_STAGE_COMPLETED" | "POST_ARTIFACT_STAGE_COMPLETED" | "RECOVERY_STARTED" | "RECOVERY_COMPLETED" | "RUN_CANCELLED";
export type ReducerFactV0337 = Readonly<{
  schemaVersion: typeof REDUCER_FACT_JOURNAL_VERSION_V0337;
  sequence: number;
  runId: string;
  factType: ReducerFactTypeV0337;
  occurredAtUtc: string;
  sourceComponent: string;
  nonSensitivePayload: Record<string, JsonValue>;
  previousFactSha256: string | null;
  factSha256: string;
}>;

const forbiddenKey = /(authorization|cookie|credential|password|secret|token|nonce|handle)/i;
function sanitizePayload(value: Record<string, JsonValue>) {
  for (const key of Object.keys(value)) if (forbiddenKey.test(key)) throw Object.assign(new Error(`REDUCER_FACT_SENSITIVE_FIELD_FORBIDDEN:${key}`), { code: "REDUCER_FACT_SENSITIVE_FIELD_FORBIDDEN", field: key });
  return structuredClone(value);
}
function factHash(value: Omit<ReducerFactV0337, "factSha256">) { return sha256BytesV0337(JSON.stringify(value)); }

export function verifyReducerFactJournalV0337(filePath: string, expectedRunId?: string) {
  if (!fs.existsSync(filePath)) return Object.freeze({ valid: true, facts: [] as ReducerFactV0337[], lastFactSha256: null as string | null, findings: [] as string[] });
  const facts = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as ReducerFactV0337);
  const findings: string[] = [];
  let previous: string | null = null;
  facts.forEach((fact, index) => {
    if (fact.schemaVersion !== REDUCER_FACT_JOURNAL_VERSION_V0337) findings.push(`SCHEMA_MISMATCH:${index + 1}`);
    if (fact.sequence !== index + 1) findings.push(`SEQUENCE_INVALID:${index + 1}:${fact.sequence}`);
    if (expectedRunId && fact.runId !== expectedRunId) findings.push(`RUN_ID_MISMATCH:${index + 1}`);
    if (fact.previousFactSha256 !== previous) findings.push(`CHAIN_PREVIOUS_MISMATCH:${index + 1}`);
    const { factSha256, ...unsigned } = fact;
    if (factSha256 !== factHash(unsigned)) findings.push(`FACT_HASH_MISMATCH:${index + 1}`);
    previous = factSha256;
  });
  return Object.freeze({ valid: findings.length === 0, facts, lastFactSha256: previous, findings });
}

export class ReducerFactJournalV0337 {
  readonly filePath: string;
  constructor(private readonly runDirectory: string, private readonly runId: string) { this.filePath = path.join(runDirectory, "progress", "reducer-facts.jsonl"); }
  append(factType: ReducerFactTypeV0337, sourceComponent: string, nonSensitivePayload: Record<string, JsonValue> = {}) {
    const verified = verifyReducerFactJournalV0337(this.filePath, this.runId);
    if (!verified.valid) throw Object.assign(new Error(`REDUCER_FACT_JOURNAL_CORRUPT:${verified.findings.join(",")}`), { code: "REDUCER_FACT_JOURNAL_CORRUPT", findings: verified.findings });
    const unsigned = { schemaVersion: REDUCER_FACT_JOURNAL_VERSION_V0337, sequence: verified.facts.length + 1, runId: this.runId, factType, occurredAtUtc: new Date().toISOString(), sourceComponent, nonSensitivePayload: sanitizePayload(nonSensitivePayload), previousFactSha256: verified.lastFactSha256 } as const;
    const fact: ReducerFactV0337 = Object.freeze({ ...unsigned, factSha256: factHash(unsigned) });
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const descriptor = fs.openSync(this.filePath, "a", 0o600);
    try { fs.writeSync(descriptor, JSON.stringify(fact) + "\n"); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    const after = verifyReducerFactJournalV0337(this.filePath, this.runId);
    if (!after.valid || after.lastFactSha256 !== fact.factSha256) throw new Error("REDUCER_FACT_JOURNAL_APPEND_VERIFY_FAILED");
    return fact;
  }
  verify() { return verifyReducerFactJournalV0337(this.filePath, this.runId); }
}
