import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import path from 'node:path';
type Json = Record<string, any>;
export function recoverDiagnosticSessionV044(dir: string): Json | null {
  let saved: Json | null = null;
  for (const name of ['automatic-summary.json', 'session-summary.json']) {
    try { const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); if (typeof parsed.sessionId === 'string') { saved = parsed; break; } } catch { /* Recover complete lines without modifying original evidence. */ }
  }
  let result: Json | null = saved ? { ...saved } : null, malformedLines = 0;
  let eventCount = 0;
  const openSpans: Json = {};
  for (const name of fs.readdirSync(dir).filter(n => /^automatic-\d+\.ndjson$/.test(n)).sort()) {
    const fd = fs.openSync(path.join(dir, name), 'r'); const buffer = Buffer.alloc(65536); let tail = ''; const decoder = new StringDecoder('utf8');
    try {
      let length: number;
      while ((length = fs.readSync(fd, buffer)) > 0) {
        const lines = (tail + decoder.write(buffer.subarray(0, length))).split('\n'); tail = lines.pop() ?? '';
        for (const line of lines) {
          try { const e = JSON.parse(line); if (e.schemaVersion !== 'jaa-diagnostic-event-v1') continue; eventCount++;
            result ??= { schemaVersion: 'jaa-recovered-session-v1', sessionId: e.sessionId, instanceId: e.instanceId, startedAt: e.timestampUtc, status: 'unclean', rootCause: 'UNKNOWN', build: e.build };
            result.updatedAt = e.timestampUtc;
            if (e.phase === 'START') openSpans[e.spanId] = e;
            if (e.phase === 'END') { delete openSpans[e.spanId]; result.lastCompletedSpan = e; }
            if (e.route) result.lastRoute = e.route;
          } catch { malformedLines++; }
        }
        if (tail.length > 1024 * 1024) { malformedLines++; tail = ''; }
      }
      if (tail.trim()) malformedLines++;
    } finally { fs.closeSync(fd); }
  }
  return result ? { ...result, openSpans: eventCount ? openSpans : saved?.openSpans ?? {}, malformedLines, diagnosticCompleteness: saved ? 'SUMMARY_PLUS_AUTHORITATIVE_EVENT_REPLAY' : 'RECOVERED_COMPLETE_LINES_SUMMARY_UNAVAILABLE', missing: saved ? [] : ['valid summary'], provenance: 'derived; original files preserved' } : null;
}

export async function exportPreviousDiagnosticsV044(logsDir: string, exportsDir: string, sessionId: string) {
  if (!/^app-session-[\w-]+$/.test(sessionId)) throw Error('INVALID_DIAGNOSTIC_SESSION_ID');
  const source = path.join(logsDir, 'sessions', sessionId);
  const summary = recoverDiagnosticSessionV044(source);
  if (!summary) throw Error('PREVIOUS_DIAGNOSTICS_UNAVAILABLE');
  const target = path.join(exportsDir, `previous-diagnostics-${Date.now()}`);
  await fs.promises.mkdir(target, { recursive: false });
  const files: Json[] = [], missing: string[] = [];
  for (const file of (await fs.promises.readdir(source)).filter(f => /^(?:automatic-\d+\.ndjson|automatic-summary\.json|session-summary\.json|(?:main|renderer|transitions)\.ndjson)$/.test(f))) {
    const p = path.join(source, file);
    try { const before = await fs.promises.stat(p); await fs.promises.copyFile(p, path.join(target, file), fs.constants.COPYFILE_EXCL); const after = await fs.promises.stat(p); files.push({ file, bytes: before.size, stableDuringCopy: before.size === after.size && before.mtimeMs === after.mtimeMs }); }
    catch { missing.push(file); }
  }
  if (!files.some(f => f.file.startsWith('automatic-'))) missing.push('structured operation timeline (legacy or unavailable)');
  const manifest = { schemaVersion: 'jaa-previous-diagnostics-export-v1', sourceSessionId: sessionId, generatedAt: new Date().toISOString(), files, missing, derivedSummary: summary, provenance: 'Copied original sanitized diagnostics; summary is derived, not a fabricated terminal result' };
  await fs.promises.writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  return { ok: true, folderPath: target, missing };
}
