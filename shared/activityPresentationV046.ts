import { buildCanonicalLineDiff, canonicalizeDescriptionContent, DESCRIPTION_DIFF_LIMITS } from './descriptionDiff.js';

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

export function presentationMetricsV046(row: Json) {
  const beforeAvailability = row.before == null ? 'UNAVAILABLE' : 'AVAILABLE';
  const unknown = { addedLineCount:null as number | null, removedLineCount:null as number | null, isSubstantiveChange:null as boolean | null, beforeAvailability };
  if (isCommentV046(row)) return { ...unknown, diffApplicability:'NOT_APPLICABLE', analysisScope:'FULL_COMMENT', diffText:commentTextV046(row.after) ?? '' };
  if (!isDescriptionV046(row)) return { ...unknown, diffApplicability:'OTHER' };
  const base = { ...unknown, diffApplicability:'DESCRIPTION' };
  if (row.before == null || row.after == null) {
    const lines = (row.diffHunks ?? []).flatMap((h: Json) => h.lines ?? []);
    if (row.contentSource === 'ANALYSIS_TIME' && lines.length && lines.every((l: Json) => ['insert','delete','context','add','remove'].includes(l.kind) && typeof l.text === 'string')) {
      const added = lines.filter((l: Json)=>['insert','add'].includes(l.kind)).length, removed = lines.filter((l: Json)=>['delete','remove'].includes(l.kind)).length;
      return { ...base, addedLineCount:added, removedLineCount:removed, isSubstantiveChange:added + removed > 0 };
    }
    return base;
  }
  const before = canonicalizeDescriptionContent(row.before), after = canonicalizeDescriptionContent(row.after);
  if (!before.parseable || !after.parseable || before.displayText.length + after.displayText.length > DESCRIPTION_DIFF_LIMITS.maxCharacters || before.displayText.split('\n').length > DESCRIPTION_DIFF_LIMITS.maxLines || after.displayText.split('\n').length > DESCRIPTION_DIFF_LIMITS.maxLines) return base;
  if (before.comparisonText === after.comparisonText) return { ...base, addedLineCount:0, removedLineCount:0, isSubstantiveChange:false };
  try {
    const lines = buildCanonicalLineDiff(String(row.id), before.displayText, after.displayText).flatMap(h=>h.lines);
    return { ...base, addedLineCount:lines.filter(l=>l.kind==='insert').length, removedLineCount:lines.filter(l=>l.kind==='delete').length, isSubstantiveChange:true };
  } catch { return base; }
}
