import "./syntheticIoAuditV044.js";
import { recoverDiagnosticSessionV044 } from "./diagnosticRecoveryV044.js";
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { createEnvelopeProducerV044 } from './diagnosticEnvelopeV044.js';

type Json = Record<string, any>;
const defaults = { quotaBytes: 512 * 1024 ** 2, reserveBytes: 8 * 1024 ** 2, chunkBytes: 25 * 1024 ** 2, normalCount: 20, abnormalCount: 10, normalDays: 14, abnormalDays: 30 };
const read = (p: string) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const atomic = (p: string, value: unknown, durable = true) => { const t = `${p}.${process.pid}.tmp`; const fd = fs.openSync(t, 'w'); try { fs.writeFileSync(fd, JSON.stringify(value)); if (durable) fs.fsyncSync(fd); } finally { fs.closeSync(fd); } const pause = new Int32Array(new SharedArrayBuffer(4)); for (let attempt = 0; ; attempt++) { try { fs.renameSync(t, p); break; } catch (error) { if (attempt >= 5 || !['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error; Atomics.wait(pause,0,0,10 * (attempt+1)); } } };
const bytes = (p: string): number => { try { const stat = fs.lstatSync(p); return stat.isSymbolicLink() ? 0 : stat.isDirectory() ? fs.readdirSync(p).reduce((n, f) => n + bytes(path.join(p, f)), 0) : stat.size; } catch { return 0; } };

// Independent process: the parent event loop may hang without stopping this writer/monitor.
export class DiagnosticWriterV044 {
  readonly sessionDir: string;
  readonly summary: Json;
  private limits: typeof defaults;
  private chunk = 1;
  private activeFd: number | null = null;
  private activeFile = '';
  private producer: ReturnType<typeof createEnvelopeProducerV044>;
  private beats = new Map<string, { at: number; suspected: boolean; details: Json }>();
  private server = net.createServer(socket => { socket.on('error', () => {}); socket.end(this.summary.instanceId); });
  private suspended = false;
  private lastTick = Date.now();
  private closed = false;
  private totalBytes = 0;
  private activeLegacyFiles = new Set<string>();
  private openSpanChunks = new Map<string, number>();
  private lastQuotaCheck = 0;
  private lastRetention = 0;
  private retentionPending = false;
  constructor(private config: Json) {
    this.limits = { ...defaults, ...(config.testMode === true ? config.limits : {}) };
    this.sessionDir = path.join(config.logsDir, 'sessions', config.sessionId);
    fs.mkdirSync(this.sessionDir, { recursive: true });
    this.producer = createEnvelopeProducerV044({ sessionId: config.sessionId, instanceId: config.instanceId, build: config.build, processType: 'monitor' });
    this.summary = { schemaVersion: 'jaa-automatic-session-v1', sessionId: config.sessionId, instanceId: config.instanceId, mainPid: config.mainPid, writerPid: process.pid, startedAt: new Date().toISOString(), status: 'running', rootCause: 'UNKNOWN', build: config.build, openSpans: {}, lastCompletedSpan: null, lastRoute: null, heartbeats: {}, writerFailed: false, droppedEventCount: 0, writeErrorCount: 0, gapCount: 0, cleanup: [], durability: 'critical NDJSON write + fsync acknowledged; summary atomic write-complete, periodic fsync; replay authoritative events; hardware/power-loss not guaranteed', previous: null };
  }
  async start() {
    await new Promise<void>((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', () => resolve()); });
    this.summary.identityPort = (this.server.address() as net.AddressInfo).port;
    const sessions = path.join(this.config.logsDir, 'sessions');
    const candidates = fs.readdirSync(sessions).filter(id => id !== this.config.sessionId).map(id => ({ id, summary: recoverDiagnosticSessionV044(path.join(sessions, id)) })).filter((x): x is { id: string; summary: Json } => Boolean(x.summary)).sort((a, b) => String(b.summary.updatedAt ?? b.summary.startedAt).localeCompare(String(a.summary.updatedAt ?? a.summary.startedAt)) || Number(a.summary.status === 'closed') - Number(b.summary.status === 'closed'));
    for (const candidate of candidates) {
      if (candidate.summary.status === 'closed') break;
      const live = candidate.summary.identityPort && await this.isLive(candidate.summary);
      if (live) continue;
      const { previous: _previousHistory, ...previousSummary } = candidate.summary;
      this.summary.previous = { ...previousSummary, sessionId: candidate.id, status: 'unclean', rootCause: 'UNKNOWN', autoReplay: false, diagnosticCompleteness: candidate.summary.schemaVersion === 'diagnostic_session_v1' ? 'LEGACY_NO_STAGE_DATA' : 'RECOVERED_FROM_SUMMARY', openSpans: candidate.summary.openSpans ?? {} };
      break;
    }
    this.beat('main', {}); this.save();
    this.record(this.producer('session-start', 'POINT', null, { previousSessionId: this.summary.previous?.sessionId ?? null }), true);
    await this.retention(); this.lastRetention = Date.now();
    return this.summary;
  }
  private isLive(summary: Json): Promise<boolean> {
    if (!Number.isInteger(summary.identityPort) || summary.identityPort < 1 || summary.identityPort > 65535 || !summary.instanceId) return Promise.resolve(false);
    return new Promise(resolve => {
      let settled = false;
      const finish = (live: boolean) => { if (!settled) { settled = true; socket.destroy(); resolve(live); } };
      const socket = net.connect(summary.identityPort, '127.0.0.1');
      socket.setTimeout(300); socket.on('data', b => finish(b.toString() === summary.instanceId)); socket.on('error', () => finish(false)); socket.on('timeout', () => finish(false)); socket.on('end', () => finish(false));
    });
  }
  private save(durable = true) { this.summary.updatedAt = new Date().toISOString(); atomic(path.join(this.sessionDir, 'automatic-summary.json'), this.summary, durable); }
  record(event: Json, critical = false) {
    try {
      if (this.config.testMode && this.config.failWrites) throw Object.assign(new Error('SYNTHETIC_WRITE_FAILURE'), { code: 'ENOSPC' });
      const body = JSON.stringify(event) + '\n';
      if (Date.now() - this.lastQuotaCheck > 1000) { this.totalBytes = bytes(this.config.logsDir); this.lastQuotaCheck = Date.now(); }
      const maximum = this.limits.quotaBytes - (critical ? 64 * 1024 : this.limits.reserveBytes);
      if (this.totalBytes + Buffer.byteLength(body) > maximum) { this.summary.droppedEventCount++; this.summary.gapCount++; this.summary.writerFailed = true; this.summary.lastError = 'DIAGNOSTIC_QUOTA_EXHAUSTED'; this.lastRetention = 0; if (critical) this.save(); return false; }
      let file = path.join(this.sessionDir, `automatic-${String(this.chunk).padStart(4, '0')}.ndjson`);
      if (bytes(file) + Buffer.byteLength(body) > this.limits.chunkBytes) { this.chunk++; file = path.join(this.sessionDir, `automatic-${String(this.chunk).padStart(4, '0')}.ndjson`); }
      if (this.activeFile !== file || this.activeFd === null) {
        if (this.activeFd !== null) { fs.fsyncSync(this.activeFd); fs.closeSync(this.activeFd); }
        this.activeFd = fs.openSync(file, 'a'); this.activeFile = file;
      }
      fs.writeFileSync(this.activeFd, body); if (critical) fs.fsyncSync(this.activeFd);
      this.totalBytes += Buffer.byteLength(body);
      if (event.phase === 'START') { this.summary.openSpans[event.spanId] = event; this.openSpanChunks.set(event.spanId, this.chunk); }
      if (event.phase === 'END') { this.openSpanChunks.delete(event.spanId); delete this.summary.openSpans[event.spanId]; this.summary.lastCompletedSpan = event; }
      if (event.route) this.summary.lastRoute = event.route;
      // The authoritative journal is fsynced before ACK. Periodic/close summaries replay it on recovery.
      if (critical && event.phase === 'POINT') this.save(false);
      return true;
    } catch (error) { this.summary.writerFailed = true; this.summary.writeErrorCount++; this.summary.gapCount++; this.summary.lastError = (error as NodeJS.ErrnoException).code ?? 'WRITE_FAILED'; return false; }
  }
  appendLegacy(file: string, line: string) {
    const relative = path.relative(path.resolve(this.config.logsDir), path.resolve(file));
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false;
    try {
      if (Date.now() - this.lastQuotaCheck > 1000) { this.totalBytes = bytes(this.config.logsDir); this.lastQuotaCheck = Date.now(); }
      if (this.totalBytes + Buffer.byteLength(line) > this.limits.quotaBytes - this.limits.reserveBytes) { this.summary.droppedEventCount++; this.summary.writerFailed = true; return false; }
      this.activeLegacyFiles.add(path.resolve(file));
      try { const item = JSON.parse(line); if (/render-process-gone|uncaughtException|unhandledRejection/.test(String(item.event))) this.summary.abnormalObserved = true; } catch { /* Legacy text log, not an event envelope. */ }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (bytes(file) > this.limits.chunkBytes) fs.renameSync(file, file + '.' + Date.now() + '.rotated');
      fs.appendFileSync(file, line + '\n'); this.totalBytes += Buffer.byteLength(line + '\n'); return true;
    } catch { this.summary.writeErrorCount++; this.summary.writerFailed = true; return false; }
  }
  beat(producer: string, details: Json) {
    const old = this.beats.get(producer);
    if (old?.suspected) this.record(this.producer('heartbeat-recovered', 'POINT', null, { producer, elapsedMs: Date.now() - old.at }), true);
    this.beats.set(producer, { at: Date.now(), suspected: false, details });
    this.summary.heartbeats[producer] = { at: new Date().toISOString(), ...details };
  }
  suspend(value: boolean) { this.suspended = value; this.lastTick = Date.now(); for (const beat of this.beats.values()) beat.at = Date.now(); this.record(this.producer(value ? 'system-suspend' : 'system-resume', 'POINT'), true); }
  tick() {
    const now = Date.now(), discontinuity = now - this.lastTick > 10000; this.lastTick = now;
    if (discontinuity) { for (const beat of this.beats.values()) beat.at = now; this.record(this.producer('monitor-scheduling-gap', 'POINT', null, { classification: 'UNKNOWN_PAUSE_OR_SLEEP' }), true); }
    if (!this.suspended) for (const [producer, beat] of this.beats) if (now - beat.at > 10000 && !beat.suspected) { beat.suspected = true; this.record(this.producer('heartbeat-missed', 'POINT', null, { producer, lastSeenUtc: new Date(beat.at).toISOString(), classification: 'SUSPECTED_UNRESPONSIVE', rootCause: 'UNKNOWN' }), true); }
    if (!this.retentionPending && now - this.lastRetention > 60000) { this.retentionPending = true; this.lastRetention = now; void this.retention().catch(() => { this.summary.writerFailed = true; }).finally(() => { this.retentionPending = false; }); }
    this.record(this.producer('monitor-heartbeat', 'POINT', null, { rssBytes: process.memoryUsage().rss, heapUsedBytes: process.memoryUsage().heapUsed }));
    try { this.save(); } catch { this.summary.writerFailed = true; }
  }
  async retention() {
    const base = path.join(this.config.logsDir, 'sessions');
    const entries = fs.readdirSync(base).filter(id => id !== this.config.sessionId && /^app-session-[\w-]+$/.test(id)).map(id => ({ id, path: path.join(base, id), summary: read(path.join(base, id, 'automatic-summary.json')) ?? read(path.join(base, id, 'session-summary.json')) })).filter(e => e.summary);
    const active = new Set<string>();
    for (const e of entries) if (e.summary.status === 'running' && (await this.isLive(e.summary))) active.add(e.id);
    let total = bytes(this.config.logsDir);
    const ordinary: Array<{ file: string; size: number; age: number }> = [];
    const scan = (dir: string) => { for (const name of fs.readdirSync(dir)) { const file = path.join(dir,name), stat = fs.lstatSync(file); if (stat.isSymbolicLink() || file === base) continue; if (stat.isDirectory()) scan(file); else if (/\.(?:log|ndjson|jsonl|rotated)$/.test(name)) ordinary.push({ file, size: stat.size, age: Date.now() - stat.mtimeMs }); } };
    scan(this.config.logsDir);
    // Never remove a file this writer has opened, or global logs while another instance is live.
    if (!active.size) for (const entry of ordinary.sort((a,b) => b.age-a.age)) {
      const expired = entry.age > this.limits.normalDays * 86400000;
      if (this.activeLegacyFiles.has(path.resolve(entry.file)) || (!expired && !(entry.file.endsWith('.rotated') && total > this.limits.quotaBytes-this.limits.reserveBytes))) continue;
      if (!path.resolve(entry.file).startsWith(path.resolve(this.config.logsDir)+path.sep)) continue;
      const audit = { path: path.relative(this.config.logsDir,entry.file), reason: expired ? 'GLOBAL_LOG_AGE' : 'ROTATED_LOG_QUOTA', bytes: entry.size, timestampUtc: new Date().toISOString() };
      this.summary.cleanup = [...this.summary.cleanup.slice(-99),audit];this.save();fs.unlinkSync(entry.file);total-=entry.size;this.record(this.producer('retention-deleted','POINT',null,audit),true);
    }
    const counts = { normal: 0, abnormal: 0 };
    const candidates = entries.sort((a,b) => String(b.summary.startedAt).localeCompare(String(a.summary.startedAt))).map(e => {
      const kind = e.summary.status === 'closed' && !e.summary.abnormalObserved ? 'normal' : 'abnormal';
      const count = ++counts[kind]; const age = Date.now() - Date.parse(e.summary.startedAt);
      return { ...e, kind, expired: count > (kind === 'normal' ? this.limits.normalCount : this.limits.abnormalCount) || age > (kind === 'normal' ? this.limits.normalDays : this.limits.abnormalDays) * 86400000 };
    }).sort((a,b) => (a.kind === 'normal' ? 0 : 1) - (b.kind === 'normal' ? 0 : 1) || String(a.summary.startedAt).localeCompare(String(b.summary.startedAt)));
    for (const e of candidates) {
      if (active.has(e.id) || e.id === this.summary.previous?.sessionId || (!e.expired && total < this.limits.quotaBytes - this.limits.reserveBytes)) continue;
      if (!path.resolve(e.path).startsWith(path.resolve(base) + path.sep) || fs.lstatSync(e.path).isSymbolicLink()) continue;
      const removedBytes = bytes(e.path);
      const audit = { sessionId: e.id, reason: e.expired ? 'RETENTION_AGE_OR_COUNT' : 'QUOTA', bytes: removedBytes, timestampUtc: new Date().toISOString() };
      this.summary.cleanup = [...this.summary.cleanup.slice(-99), audit]; this.save();
      fs.rmSync(e.path, { recursive: true }); total -= removedBytes;
      this.record(this.producer('retention-deleted', 'POINT', null, audit), true);
    }
    // Active summaries/open starts are pinned; only completed older chunks may rotate.
    if (total > this.limits.quotaBytes - this.limits.reserveBytes) {
      const pinned = new Set(this.openSpanChunks.values());
      for (let index = 1; index < this.chunk && total > this.limits.quotaBytes - this.limits.reserveBytes; index++) {
        if (pinned.has(index)) continue;
        const file = path.join(this.sessionDir, 'automatic-' + String(index).padStart(4, '0') + '.ndjson');
        if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) continue;
        const size = fs.statSync(file).size;
        const audit = { path: path.relative(this.config.logsDir, file), reason: 'ACTIVE_COMPLETED_CHUNK_QUOTA', bytes: size, timestampUtc: new Date().toISOString() };
        this.summary.cleanup = [...this.summary.cleanup.slice(-99), audit];
        this.summary.retainedTimelineIsPartial = true; this.save();
        fs.unlinkSync(file); total -= size;
      }
    }
    this.totalBytes = total; this.lastQuotaCheck = Date.now();
  }
  close(normal: boolean) {
    if (this.closed) return; this.closed = true;
    this.summary.status = normal ? 'closed' : 'unclean';
    this.summary.observedExit = normal ? (this.summary.abnormalObserved ? 'NORMAL_MAIN_SHUTDOWN_AFTER_RECORDED_FAILURE' : 'NORMAL_SHUTDOWN') : 'MAIN_IPC_DISCONNECTED_EXIT_UNKNOWN';
    this.record(this.producer('session-stop', 'POINT', null, { observedExit: this.summary.observedExit }), true);
    try { this.save(); } catch { this.summary.writerFailed = true; }
    if (this.activeFd !== null) { try { fs.fsyncSync(this.activeFd); fs.closeSync(this.activeFd); } catch { this.summary.writerFailed = true; } this.activeFd = null; }
    this.server.close();
  }
}

if (process.env.JAA_DIAGNOSTIC_SIDECAR === '1') {
  let writer: DiagnosticWriterV044 | undefined, timer: NodeJS.Timeout | undefined;
  process.on('message', async (m: any) => {
    try {
      if (m.type === 'init') { writer = new DiagnosticWriterV044(m.config); const summary = await writer.start(); timer = setInterval(() => { writer?.tick(); process.send?.({ type: 'health', summary: writer?.summary }); }, 2000); process.send?.({ id: m.id, ok: true, summary }); }
      else if (m.type === 'event') { const ok = writer!.record(m.event, m.critical); process.send?.({ id: m.id, ok, summary: ok ? undefined : writer!.summary }); }
      else if (m.type === 'legacy') { const ok = writer!.appendLegacy(m.file, m.line); process.send?.({ id: m.id, ok }); }
      else if (m.type === 'beat') writer!.beat(m.producer, m.details);
      else if (m.type === 'suspend') writer!.suspend(m.value);
      else if (m.type === 'close') { clearInterval(timer); writer?.close(!m.incompleteOperations); process.send?.({ id: m.id, ok: true }, () => process.exit(0)); }
    } catch { process.send?.({ id: m.id, ok: false }); }
  });
  process.on('disconnect', () => { clearInterval(timer); writer?.close(false); process.exit(0); });
}
