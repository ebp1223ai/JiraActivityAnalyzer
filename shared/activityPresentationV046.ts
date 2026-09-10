import { buildCanonicalLineDiff, canonicalizeDescriptionContent, DESCRIPTION_DIFF_LIMITS, DiffGuardError } from './descriptionDiff.js';

type Json = Record<string, any>;
export function isCommentV046(row: Json) {
  return /comment/i.test(String(row.eventType ?? row.action ?? '')) || /^comments?$/i.test(String(row.fieldId || row.fieldName || ''));
}
export function isDescriptionV046(row: Json) {
  return !isCommentV046(row) && String(row.fieldId || row.fieldName || '').trim().toLowerCase() === 'description';
}

// Decode one known JSON envelope only. Literal backslash sequences in text stay literal.
export function commentTextV046(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('{')) {
      try { const parsed = JSON.parse(text); if (parsed && ('body' in parsed || parsed.type === 'doc')) return commentTextV046(parsed); } catch { /* Source text, not an envelope. */ }
    }
    return value.replace(/\r\n?/g, '\n');
  }
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Json;
  if (Object.prototype.hasOwnProperty.call(source, 'body')) return commentTextV046(source.body);
  if (source.type === 'doc' && Array.isArray(source.content)) {
    const walk = (node: Json): string => typeof node.text === 'string' ? node.text : node.type === 'hardBreak' ? '\n' : (node.content ?? []).map(walk).join('') + (/^(paragraph|heading|listItem|codeBlock)$/.test(node.type) ? '\n' : '');
    return source.content.map(walk).join('').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  }
  return null;
}

export function presentationMetricsV046(row: Json, diagnosticHash?: (text: string) => string) {
  const beforeAvailability = row.before == null ? 'UNAVAILABLE' : 'AVAILABLE';
  const unknown = { addedLineCount:null as number | null, removedLineCount:null as number | null, isSubstantiveChange:null as boolean | null, beforeAvailability };
  if (isCommentV046(row)) return { ...unknown, diffApplicability:'NOT_APPLICABLE', analysisScope:'FULL_COMMENT', diffText:commentTextV046(row.after) ?? '' };
  if (!isDescriptionV046(row)) return { ...unknown, diffApplicability:'OTHER' };
  const base = { ...unknown, diffApplicability:'DESCRIPTION', diffText:'', computedDiffHunks:[] as any[], diffStatus:'UNAVAILABLE', diffReason:'DIFF_CONTENT_UNAVAILABLE', diffSearchUnknown:true, diffDiagnostic:null as Json | null, diffComputationCount:0, diffComputationMs:0 };
  if (row.before == null || row.after == null) {
    const lines = (row.diffHunks ?? []).flatMap((h: Json) => h.lines ?? []);
    if (row.contentSource === 'ANALYSIS_TIME' && lines.length && lines.every((l: Json) => ['insert','delete','context','add','remove'].includes(l.kind) && typeof l.text === 'string')) {
      const added = lines.filter((l: Json)=>['insert','add'].includes(l.kind)).length, removed = lines.filter((l: Json)=>['delete','remove'].includes(l.kind)).length;
      return { ...base, addedLineCount:added, removedLineCount:removed, isSubstantiveChange:added + removed > 0, diffStatus:'COMPACT', diffReason:'', diffSearchUnknown:false, computedDiffHunks:row.diffHunks, diffText:lines.map((l: Json)=>(['insert','add'].includes(l.kind)?'+ ':['delete','remove'].includes(l.kind)?'- ':'  ')+l.text).join('\n') };
    }
    return base;
  }
  const before = canonicalizeDescriptionContent(row.before), after = canonicalizeDescriptionContent(row.after);
  if (!before.parseable || !after.parseable) return { ...base, diffReason:'DESCRIPTION_CANONICALIZE_FAILED' };
  const beforeLines = before.displayText.split('\n').length, afterLines = after.displayText.split('\n').length;
  const started = performance.now();
  try {
    if (before.displayText.length + after.displayText.length > DESCRIPTION_DIFF_LIMITS.maxCharacters) throw new DiffGuardError('DIFF_CHARACTER_GUARD');
    if (beforeLines > DESCRIPTION_DIFF_LIMITS.maxLines || afterLines > DESCRIPTION_DIFF_LIMITS.maxLines) throw new DiffGuardError('DIFF_LINE_GUARD');
    if (before.comparisonText === after.comparisonText) return { ...base, addedLineCount:0, removedLineCount:0, isSubstantiveChange:false, diffStatus:'UNCHANGED', diffReason:'', diffSearchUnknown:false };
    const hunks = buildCanonicalLineDiff(String(row.id), before.displayText, after.displayText), lines = hunks.flatMap(h=>h.lines);
    return { ...base, addedLineCount:lines.filter(l=>l.kind==='insert').length, removedLineCount:lines.filter(l=>l.kind==='delete').length, isSubstantiveChange:true, computedDiffHunks:hunks, diffText:lines.map(l=>(l.kind==='insert'?'+ ':l.kind==='delete'?'- ':'  ')+l.text).join('\n'), diffStatus:'READY', diffReason:'', diffSearchUnknown:false, diffComputationCount:1, diffComputationMs:performance.now()-started };
  } catch (error) {
    if (!(error instanceof DiffGuardError)) throw error;
    const hash = (text: string) => diagnosticHash?.(text) ?? null;
    return { ...base, diffStatus:'GUARD', diffReason:error.message, diffComputationCount:error.distance===null?0:1, diffComputationMs:performance.now()-started,
      diffDiagnostic:{ reasonCode:error.message, beforeSha256:hash(before.displayText), afterSha256:hash(after.displayText), hashBasis:'canonical-display-utf8', beforeLength:before.displayText.length, afterLength:after.displayText.length, beforeLines, afterLines, distance:error.distance, workUnits:error.distance===null?null:(error.distance+1)**2, distanceUnavailableReason:error.distance===null?'PRECHECK_LIMIT':null, limits:DESCRIPTION_DIFF_LIMITS, stack:error.stack?.split('\n').slice(0,8).join('\n') ?? null } };
  }
}
