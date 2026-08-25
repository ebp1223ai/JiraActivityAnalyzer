import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { reduceTerminalOutcomeV0336, type ProviderTerminalV0336, type TerminalReducerInputV0336 } from "./terminalOutcomeReducerV0336.js";

export class TerminalOutcomeServiceV0336 {
  private facts: TerminalReducerInputV0336 = Object.freeze({ providerTerminal: null, durableArtifactPersisted: false, artifactSha256: null, contentValidationFailed: false, postArtifactTerminalOutcome: null });
  private readonly factsPath: string;
  private readonly decisionPath: string;
  private readonly terminalPath: string;
  constructor(private readonly runDirectory: string, private readonly runId: string) {
    const folder = path.join(runDirectory, "progress"); fs.mkdirSync(folder, { recursive: true });
    this.factsPath = path.join(folder, "terminal-reducer-facts.jsonl"); this.decisionPath = path.join(folder, "terminal-outcome-decision.json"); this.terminalPath = path.join(folder, "run-terminal.json");
  }
  providerTerminal(value: ProviderTerminalV0336) { return this.update({ providerTerminal: value }, "provider_terminal"); }
  artifactPersisted(sha256: string) { return this.update({ durableArtifactPersisted: true, artifactSha256: sha256 }, "artifact_persisted"); }
  validationFailed() { return this.update({ contentValidationFailed: true }, "content_validation_failed"); }
  postArtifactTerminal(value: "SUCCEEDED" | "FAILED") { return this.update({ postArtifactTerminalOutcome: value }, "post_artifact_terminal"); }
  snapshot() { return reduceTerminalOutcomeV0336(this.facts); }
  private update(patch: Partial<TerminalReducerInputV0336>, factType: string) {
    this.facts = Object.freeze({ ...this.facts, ...patch });
    append(this.factsPath, { schemaVersion: "jaa-terminal-reducer-fact-v1", factType, facts: this.facts, atUtc: new Date().toISOString() });
    const decision = this.snapshot(); atomic(this.decisionPath, decision);
    const terminalOutcome = ["SUCCEEDED", "FAILED_POST_ARTIFACT", "FAILED_NO_ARTIFACT", "FAILED_PROVIDER", "CANCELLED"].includes(decision.outcome) ? decision.outcome : null;
    if (terminalOutcome && !fs.existsSync(this.terminalPath)) atomic(this.terminalPath, { schemaVersion: "jaa-run-terminal-event-v1", runId: this.runId, terminalOutcome, idempotencyKey: crypto.createHash("sha256").update(`${this.runId}:${terminalOutcome}`).digest("hex"), reducerDecision: decision, atUtc: new Date().toISOString() });
    return decision;
  }
}
function atomic(filePath: string, value: unknown) { const body = JSON.stringify(value, null, 2) + "\n"; const tmp = `${filePath}.${process.pid}.tmp`; fs.writeFileSync(tmp, body, "utf8"); const fd = fs.openSync(tmp, "r+"); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } fs.renameSync(tmp, filePath); }
function append(filePath: string, value: unknown) { const fd = fs.openSync(filePath, "a"); try { fs.writeSync(fd, JSON.stringify(value) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
