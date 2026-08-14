import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AiAnalysisConversationEvent, AiAnalysisRun } from "../shared/aiAnalysisContract.js";
import { assertAppPath, ensureDir, getExportsDir } from "./appPaths.js";
import { redactChatGptTextComplete } from "./chatGptRedactor.js";

export const RUN_ARCHIVE_VERSION = "ai-analysis-run-archive-v2" as const;
export const CONVERSATION_EVENT_VERSION = "ai-analysis-conversation-event-v2" as const;
export const STREAM_EVENT_VERSION = "ai-analysis-provider-stream-event-v2" as const;
export const DURABLE_FLUSH_INTERVAL_MS = 1_000;
export const MAX_DURABLE_FLUSH_INTERVAL_MS = 2_000;
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
function localTime(date: Date) { return `${date.toLocaleString("sv-SE", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}.${String(date.getMilliseconds()).padStart(3, "0")}`; }
function localStamp(date: Date) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date); const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00"; return { year: get("year"), month: get("month"), day: get("day"), stamp: `${get("year")}${get("month")}${get("day")}_${get("hour")}${get("minute")}${get("second")}_${String(date.getMilliseconds()).padStart(3, "0")}` }; }
function atomicJson(filePath: string, value: unknown) { const target = assertAppPath(filePath); const temp = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2), { encoding: "utf8", flag: "wx" }); fs.renameSync(temp, target); }
function eventRole(type: AiAnalysisConversationEvent["type"]): AiAnalysisConversationEvent["role"] { return type === "user_message" ? "software" : type.startsWith("assistant") ? "assistant" : "system"; }
function contentType(type: AiAnalysisConversationEvent["type"]): AiAnalysisConversationEvent["contentType"] { return type === "provider_event" || type === "validation_event" || type === "artifact_event" ? "metadata" : "text"; }
function countCompleteLines(filePath: string) { if (!fs.existsSync(filePath)) return 0; return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).length; }
const activeArchives = new Set<AiAnalysisRunArchive>();

class BufferedDurableWriter {
  private queue: string[] = [];
  private timer: ReturnType<typeof setInterval> | null;
  private descriptor: number;
  private flushing = false;
  private lastDurableFlushAt = Date.now();
  private flushCount = 0;
  private appendedCount = 0;
  private failure: string | null = null;
  constructor(readonly filePath: string, intervalMs = DURABLE_FLUSH_INTERVAL_MS) {
    this.descriptor = fs.openSync(assertAppPath(filePath), "a");
    this.timer = setInterval(() => { try { this.flush(true); } catch { /* surfaced by status and terminal flush */ } }, Math.min(intervalMs, MAX_DURABLE_FLUSH_INTERVAL_MS));
    this.timer.unref?.();
  }
  append(line: string) { if (this.failure) throw new Error(`AI_LOG_FLUSH_FAILED:${this.failure}`); this.queue.push(line); this.appendedCount += 1; }
  flush(durable = true) {
    if (this.flushing) return this.status(); this.flushing = true;
    try {
      if (this.queue.length) { const bytes = Buffer.from(this.queue.join(""), "utf8"); this.queue = []; let offset = 0; while (offset < bytes.length) offset += fs.writeSync(this.descriptor, bytes, offset, bytes.length - offset); }
      if (durable) { fs.fsyncSync(this.descriptor); this.lastDurableFlushAt = Date.now(); this.flushCount += 1; }
    } catch (error) { this.failure = error instanceof Error ? error.message : String(error); throw error; } finally { this.flushing = false; }
    return this.status();
  }
  close() { if (this.timer) clearInterval(this.timer); this.timer = null; try { this.flush(true); } finally { fs.closeSync(this.descriptor); } }
  status() { return { filePath: this.filePath, queuedEntries: this.queue.length, appendedCount: this.appendedCount, flushCount: this.flushCount, lastDurableFlushAt: new Date(this.lastDurableFlushAt).toISOString(), failed: this.failure !== null, failure: this.failure, maxFlushIntervalMs: MAX_DURABLE_FLUSH_INTERVAL_MS }; }
}

export class AiAnalysisRunArchive {
  static reopen(runId: string, directory: string) {
    const archive = Object.create(AiAnalysisRunArchive.prototype) as AiAnalysisRunArchive;
    Object.defineProperty(archive, "runId", { value: runId, enumerable: true }); Object.defineProperty(archive, "directory", { value: assertAppPath(directory), enumerable: true });
    Object.defineProperty(archive, "logsDirectory", { value: ensureDir(path.join(directory, "logs")), enumerable: true });
    const conversationPath = archive.logPath("conversation.jsonl"); const providerPath = archive.logPath("provider-stream.jsonl");
    if (!fs.existsSync(conversationPath)) fs.writeFileSync(conversationPath, ""); if (!fs.existsSync(providerPath)) fs.writeFileSync(providerPath, ""); for (const name of ["runtime.log", "application.log"]) { const log = archive.logPath(name); if (!fs.existsSync(log)) fs.writeFileSync(log, ""); }
    const verified = verifyConversationLog(conversationPath, true); if (!verified.valid) throw new Error(`RUN_ARCHIVE_CONVERSATION_INTEGRITY_FAILED:${verified.invalidSequence}`);
    archive.sequence = verified.eventCount; archive.previousHash = verified.terminalHash; archive.streamSequence = countCompleteLines(providerPath);
    archive.conversationWriter = new BufferedDurableWriter(conversationPath); archive.providerWriter = new BufferedDurableWriter(providerPath); archive.closed = false; activeArchives.add(archive);
    return archive;
  }
  readonly directory: string; readonly logsDirectory: string; private sequence = 0; private streamSequence = 0; private previousHash: string | null = null; private conversationWriter: BufferedDurableWriter; private providerWriter: BufferedDurableWriter; private closed = false;
  constructor(readonly runId: string, startedAt = new Date()) {
    const value = localStamp(startedAt); const root = ensureDir(path.join(getExportsDir(), "ai-analysis", "runs", value.year, value.month, value.day));
    this.directory = assertAppPath(path.join(root, `${value.stamp}_${runId}`)); fs.mkdirSync(this.directory, { recursive: false });
    this.logsDirectory = ensureDir(path.join(this.directory, "logs")); const conversationPath = this.logPath("conversation.jsonl"); const providerPath = this.logPath("provider-stream.jsonl"); fs.writeFileSync(conversationPath, "", { flag: "wx" }); fs.writeFileSync(providerPath, "", { flag: "wx" }); fs.writeFileSync(this.logPath("runtime.log"), `[${new Date().toISOString()}] Run archive initialized.\n`, { flag: "wx" }); fs.writeFileSync(this.logPath("application.log"), `[${new Date().toISOString()}] Canonical Run created.\n`, { flag: "wx" });
    this.conversationWriter = new BufferedDurableWriter(conversationPath); this.providerWriter = new BufferedDurableWriter(providerPath); activeArchives.add(this);
  }
  logPath(name: string) { return assertAppPath(path.join(this.logsDirectory, name)); }
  append(type: AiAnalysisConversationEvent["type"], visibility: AiAnalysisConversationEvent["visibility"], rawContent: string, metadata: Record<string, unknown> = {}) {
    if (type === "assistant_delta") return null;
    const content = redactChatGptTextComplete(rawContent); const at = new Date(); const sequence = ++this.sequence;
    const base = { schemaVersion: CONVERSATION_EVENT_VERSION, runId: this.runId, sequence, eventId: `${this.runId}:event:${sequence}`, messageId: type === "user_message" || type === "assistant_message" ? `${this.runId}:message:${sequence}` : null, parentMessageId: null, role: eventRole(type), atLocal: localTime(at), atUtc: at.toISOString(), type, visibility, visibleToProvider: visibility === "CHATGPT_VISIBLE", contentType: contentType(type), content, contentByteLength: Buffer.byteLength(content), contentSha256: sha256(content), providerRequestId: typeof metadata.providerRequestId === "string" ? metadata.providerRequestId : null, threadId: typeof metadata.threadId === "string" ? metadata.threadId : null, turnId: typeof metadata.turnId === "string" ? metadata.turnId : null, metadata, previousHash: this.previousHash };
    const hash = sha256(JSON.stringify(base)); const event: AiAnalysisConversationEvent = { ...base, hash }; this.conversationWriter.append(JSON.stringify(event) + "\n"); this.previousHash = hash; return event;
  }
  appendProviderEvent(value: unknown) {
    const received = new Date(); const original = (() => { try { return JSON.stringify(value); } catch { return "[UNSERIALIZABLE_PROVIDER_PAYLOAD]"; } })();
    let sanitized: Record<string, unknown>; let sanitizerErrorCode: string | null = null;
    try { sanitized = JSON.parse(redactChatGptTextComplete(original)) as Record<string, unknown>; }
    catch { sanitizerErrorCode = "SANITIZATION_FAILED"; const raw = value && typeof value === "object" ? value as Record<string, unknown> : {}; const params = raw.params && typeof raw.params === "object" ? raw.params as Record<string, unknown> : {}; const item = params.item && typeof params.item === "object" ? params.item as Record<string, unknown> : {}; sanitized = { type: String(raw.type ?? "provider_event"), method: String(raw.method ?? "unknown"), runId: this.runId, params: { threadId: typeof params.threadId === "string" ? params.threadId : null, turnId: typeof params.turnId === "string" ? params.turnId : null, itemId: typeof params.itemId === "string" ? params.itemId : typeof item.id === "string" ? item.id : null, itemType: typeof item.type === "string" ? item.type : null, commandStatus: typeof item.status === "string" ? item.status : null, exitCode: typeof item.exitCode === "number" ? item.exitCode : null, placeholder: "[SANITIZATION_FAILED_PAYLOAD_OMITTED]" } }; }
    const payload = JSON.stringify(sanitized);
    const params = sanitized.params && typeof sanitized.params === "object" ? sanitized.params as Record<string, unknown> : {}; const item = params.item && typeof params.item === "object" ? params.item as Record<string, unknown> : {};
    const envelope = { schemaVersion: STREAM_EVENT_VERSION, runId: this.runId, sequence: ++this.streamSequence, receivedAtLocal: localTime(received), receivedAtUtc: received.toISOString(), providerEventType: String(sanitized.type ?? sanitized.method ?? "unknown"), requestId: sanitized.requestId ?? null, threadId: sanitized.threadId ?? params.threadId ?? null, turnId: sanitized.turnId ?? params.turnId ?? null, itemId: params.itemId ?? item.id ?? null, itemType: item.type ?? null, status: item.status ?? params.status ?? null, exitCode: item.exitCode ?? params.exitCode ?? null, durationMs: item.durationMs ?? params.durationMs ?? null, sanitizerStatus: sanitizerErrorCode ? "failed_closed" : "sanitized", redactionPolicyVersion: "chatgpt-redaction-v1", originalPayloadBytes: Buffer.byteLength(original), originalPayloadSha256: sha256(original), sanitizerErrorCode, payloadBytes: Buffer.byteLength(payload), payloadSha256: sha256(payload), payload: sanitized };
    this.providerWriter.append(JSON.stringify(envelope) + "\n"); return envelope;
  }
  flush(reason = "explicit") { const started = Date.now(); const conversation = this.conversationWriter.flush(true); const provider = this.providerWriter.flush(true); return { requested: true, completed: true, failed: false, reason, durationMs: Date.now() - started, conversation, provider }; }
  flushStatus() { return { conversation: this.conversationWriter.status(), provider: this.providerWriter.status() }; }
  writeManifest(run: AiAnalysisRun, extra: Record<string, unknown> = {}) {
    this.flush("manifest"); const metric = (name: string) => { const filePath = this.logPath(name); const bytes = fs.existsSync(filePath) ? fs.readFileSync(filePath) : Buffer.alloc(0); return { file: `logs/${name}`, bytes: bytes.length, sha256: sha256(bytes) }; };
    atomicJson(path.join(this.directory, "run-manifest.json"), { archiveVersion: RUN_ARCHIVE_VERSION, run, conversation: { eventCount: this.sequence, terminalHash: this.previousHash, ...metric("conversation.jsonl") }, providerStream: { eventCount: this.streamSequence, ...metric("provider-stream.jsonl") }, flush: this.flushStatus(), ...extra });
    if (["completed", "completed_with_warnings", "failed", "failed_validation", "provider_failed", "provider_timeout", "cancelled", "interrupted", "recovered_interrupted"].includes(run.status)) this.writeConversationMarkdown();
  }
  close(reason = "terminal") { if (this.closed) return; this.flush(reason); this.conversationWriter.close(); this.providerWriter.close(); this.closed = true; activeArchives.delete(this); }
  private writeConversationMarkdown() { this.flush("conversation_markdown"); const filePath = this.logPath("conversation.jsonl"); const verification = verifyConversationLog(filePath); const events = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as AiAnalysisConversationEvent); const body = events.map((event) => `## ${event.sequence}. ${event.role} / ${event.type}\n\n- Local: ${event.atLocal}\n- UTC: ${event.atUtc}\n- Visibility: ${event.visibility}\n- Content bytes: ${event.contentByteLength}\n- Content SHA-256: ${event.contentSha256}\n\n${event.content}\n`).join("\n"); const markdown = `# AI Analysis Conversation\n\nRun: ${this.runId}\nArchive: ${RUN_ARCHIVE_VERSION}\nSource event range: 1-${verification.eventCount}\nTerminal event hash: ${verification.terminalHash ?? "null"}\n\n${body}`; const target = this.logPath("conversation.md"); const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`; fs.writeFileSync(temporary, markdown, { encoding: "utf8", flag: "wx" }); fs.renameSync(temporary, target); }
}

export function flushRunArchive(runId: string, reason = "debug_export") {
  const archive = [...activeArchives].find((candidate) => candidate.runId === runId);
  if (!archive) return { runId, requested: false, completed: true, failed: false, reason, status: "not_applicable_terminal_already_flushed", conversation: null, provider: null };
  try { return { runId, status: "forced_durable_flush", ...archive.flush(reason) }; }
  catch (error) { return { runId, requested: true, completed: false, failed: true, reason, status: "flush_failed", error: error instanceof Error ? error.message : String(error) }; }
}
export function flushActiveRunArchives(reason = "debug_export") { return [...activeArchives].map((archive) => { try { return { runId: archive.runId, ...archive.flush(reason) }; } catch (error) { return { runId: archive.runId, requested: true, completed: false, failed: true, reason, error: error instanceof Error ? error.message : String(error) }; } }); }

export function verifyConversationLog(filePath: string, recoverPartialTail = false) { const safe = assertAppPath(filePath); let raw = fs.readFileSync(safe, "utf8"); if (recoverPartialTail && raw && !raw.endsWith("\n")) { const lastNewline = raw.lastIndexOf("\n"); const partial = raw.slice(lastNewline + 1); const recoveryPath = path.join(path.dirname(safe), `conversation-partial-tail-${Date.now()}.txt`); fs.writeFileSync(recoveryPath, partial, { encoding: "utf8", flag: "wx" }); raw = lastNewline < 0 ? "" : raw.slice(0, lastNewline + 1); fs.writeFileSync(safe, raw, "utf8"); } const lines = raw.split(/\r?\n/).filter(Boolean); let previous: string | null = null; for (let index = 0; index < lines.length; index += 1) { let event: AiAnalysisConversationEvent; try { event = JSON.parse(lines[index]) as AiAnalysisConversationEvent; } catch { return { valid: false, eventCount: lines.length, terminalHash: previous, invalidSequence: index + 1 }; } const { hash, ...base } = event; if (event.sequence !== index + 1 || event.previousHash !== previous || sha256(JSON.stringify(base)) !== hash || event.contentByteLength !== Buffer.byteLength(event.content) || event.contentSha256 !== sha256(event.content)) return { valid: false, eventCount: lines.length, terminalHash: previous, invalidSequence: index + 1 }; previous = hash; } return { valid: true, eventCount: lines.length, terminalHash: previous, invalidSequence: null }; }
export function updateArchivedLifecycle(runDirectory: string, patch: Record<string, unknown>) { const target = assertAppPath(path.join(runDirectory, "progress", "lifecycle-summary.json")); if (!fs.existsSync(target)) return false; const current = JSON.parse(fs.readFileSync(target, "utf8")); const date = new Date(); atomicJson(target, { ...current, ...patch, updatedAtLocal: localTime(date), updatedAtUtc: date.toISOString() }); return true; }
export function loadArchivedRuns() { const root = path.join(getExportsDir(), "ai-analysis", "runs"); if (!fs.existsSync(root)) return [] as AiAnalysisRun[]; const manifests: string[] = []; const visit = (folder: string) => { for (const entry of fs.readdirSync(folder, { withFileTypes: true })) { const target = path.join(folder, entry.name); if (entry.isDirectory()) visit(target); else if (entry.name === "run-manifest.json") manifests.push(target); } }; visit(root); return manifests.flatMap((manifestPath) => { try { const value = JSON.parse(fs.readFileSync(manifestPath, "utf8")); const run = value.run as AiAnalysisRun; run.runDirectory = path.dirname(manifestPath); const reportPath = path.join(run.runDirectory, "ai-output", "analysis-report.md"); const finalMessagePath = path.join(run.runDirectory, "ai-output", "final-assistant-message.txt"); run.analysisReportContent = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : null; run.finalAssistantMessage = fs.existsSync(finalMessagePath) ? fs.readFileSync(finalMessagePath, "utf8") : null; const logPath = path.join(run.runDirectory, "logs", "conversation.jsonl"); const legacyPath = path.join(run.runDirectory, "conversation.jsonl"); const conversationPath = fs.existsSync(logPath) ? logPath : legacyPath; const integrity = verifyConversationLog(conversationPath, true); if (!integrity.valid) { run.status = "failed_validation"; run.progress.status = "failed_validation"; run.progress.stage = "failed"; run.progress.errorCode = "AI_RUN_ARCHIVE_FAILED"; run.progress.message = `Conversation archive integrity failed at sequence ${integrity.invalidSequence}.`; return [run]; } if (["running", "validating", "retrying", "cancelling"].includes(run.status) && !fs.existsSync(path.join(run.runDirectory, "canonical-output", "completion-manifest.json"))) { run.status = "recovered_interrupted"; run.progress.status = "recovered_interrupted"; run.progress.stage = "failed"; run.progress.errorCode = "AI_RUN_RECOVERED_INTERRUPTED"; run.progress.message = "The previous process ended before a valid completion manifest was published. The Run was not resumed and is not SQLite eligible."; run.databaseWriteStatus = "Not written - recovered interrupted Run"; if (run.lifecycle) { run.lifecycle.providerTurnStatus = "interrupted"; run.lifecycle.analysisStatus = run.lifecycle.analysisCompleted ? "completed" : "interrupted"; run.lifecycle.overallStatus = "interrupted"; run.lifecycle.firstFailedStage ??= run.lifecycle.lastSuccessfulStage; run.lifecycle.rootErrorCode ??= "AI_RUN_RECOVERED_INTERRUPTED"; updateArchivedLifecycle(run.runDirectory, run.lifecycle); } atomicJson(manifestPath, { ...value, run, recovery: { recoveredAt: new Date().toISOString(), reasonCode: "AI_RUN_RECOVERED_INTERRUPTED" } }); } return [run]; } catch { return []; } }).sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
export function readConversationPage(runDirectory: string, offset = 0, limit = 200) { const modern = path.join(runDirectory, "logs", "conversation.jsonl"); const legacy = path.join(runDirectory, "conversation.jsonl"); const filePath = assertAppPath(fs.existsSync(modern) ? modern : legacy); const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean) : []; const safeOffset = Math.max(0, Math.min(lines.length, Math.trunc(offset))); const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit))); return { events: lines.slice(safeOffset, safeOffset + safeLimit).map((line) => JSON.parse(line) as AiAnalysisConversationEvent), offset: safeOffset, nextOffset: Math.min(lines.length, safeOffset + safeLimit), total: lines.length, hasMore: safeOffset + safeLimit < lines.length }; }
export function deleteRunArchive(runDirectory: string) { const safe = assertAppPath(runDirectory); const root = assertAppPath(path.join(getExportsDir(), "ai-analysis", "runs")); const relative = path.relative(root, safe); if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("RUN_ARCHIVE_DELETE_OUTSIDE_ROOT"); fs.rmSync(safe, { recursive: true, force: false }); }