type Json = Record<string, any>;

export function projectManualReviewV043(findings: Json[], review: Json | null) {
  const groups: Record<string, Json[]> = { accepted: [], adjusted: [], added: [], rejected: [], pending: [], domainRequired: [] };
  for (const finding of findings) {
    const decision = review?.skillReviews?.find((item: Json) => item.skillId === finding.skillId);
    const item = { ...finding, originalConfidence: finding.confidence, proposedConfidence: decision?.proposedConfidence ?? null, verdict: decision?.verdict ?? "UNREVIEWED", notes: decision?.notes ?? "", origin: "AI" };
    const group = decision?.verdict === "ACCEPT" ? "accepted" : decision?.verdict === "ADJUST" ? "adjusted" : decision?.verdict === "REJECT" ? "rejected" : decision?.verdict === "DOMAIN_CONFIRMATION_REQUIRED" ? "domainRequired" : "pending";
    groups[group].push(item);
  }
  groups.added = (review?.missingSkillReviews ?? []).map((item: Json) => ({ ...item, origin: "MANUAL" }));
  return { state: !review ? "AI_ONLY" : review.completed ? "REVIEW_COMPLETED" : "REVIEW_PARTIAL", provisional: Boolean(review && !review.completed), expectedStatus: review?.expectedStatus ?? null, groups, confirmed: review ? [...groups.accepted, ...groups.adjusted, ...groups.added] : [] };
}

export function traceContentV043(trace: Json) {
  const ref = trace.reference ?? {}, diff = trace.diff ?? {};
  // Compact hunks are never reconstructed as historical full bodies.
  const before = diff.fullText?.before ?? diff.before ?? diff.beforeValue ?? null;
  const after = diff.fullText?.after ?? diff.after ?? diff.afterValue ?? null;
  const hunks = diff.diffHunks ?? diff.hunks ?? [];
  const beforeAvailability = diff.beforeAvailability ?? (before === null ? "UNAVAILABLE" : "AVAILABLE");
  const afterAvailability = diff.afterAvailability ?? (after === null ? "UNAVAILABLE" : "AVAILABLE");
  return {
    before, after, beforeAvailability, afterAvailability, diff, diffHunks: hunks,
    diffText: typeof diff.diffText === "string" ? diff.diffText : "",
    addedLineCount: typeof diff.addedLineCount === "number" ? diff.addedLineCount : null,
    removedLineCount: typeof diff.removedLineCount === "number" ? diff.removedLineCount : null,
    isSubstantiveChange: typeof diff.isSubstantiveChange === "boolean" ? diff.isSubstantiveChange : null,
    contentAvailability: before === null && after === null && hunks.length ? "COMPACT_ONLY" : "SOURCE_TRACE",
    eventType: ref.eventType ?? ref.action ?? diff.eventType ?? diff.action ?? "",
    action: ref.eventType ?? ref.action ?? diff.eventType ?? diff.action ?? "",
    sourceProvenance: ref.sourceProvenance ?? null
  };
}

export function projectActiveAiV043(record: Json, trace: Json, analysis: Json, review: Json | null, findings: Json[], batch: Json, link: Json | null) {
  const ref = trace.reference ?? {}, content = traceContentV043(trace);
  return {
    id: record.ai_record_id, aiRecordId: record.ai_record_id, analysisId: record.active_analysis_id,
    activityEventId: ref.activityEventId, sourceRecordId: ref.sourceRecordStableId, sourceDatabaseId: ref.sourceDatabaseId,
    eventTime: ref.eventTime, issueKey: ref.issueKey, projectKey: ref.projectKey ?? null,
    displayName: ref.actor?.displayValue ?? ref.actor?.stableIdentity ?? null, actorAccountId: ref.actor?.stableIdentity ?? null,
    fieldName: ref.fieldName, fieldId: ref.fieldId ?? null, historyId: ref.historyId ?? null, itemIndex: ref.historyItemIndex ?? null,
    summary: ref.summary ?? null, issueTypeName: ref.issueTypeName ?? null, currentStatusName: ref.currentStatusName ?? null, currentPriorityName: ref.currentPriorityName ?? null,
    ...content, analysisStatus: analysis.status, confidence: analysis.confidence, rationale: analysis.rationale,
    analysis, skillFindings: findings, skillIds: findings.map(item => item.skillId), skillId: findings.map(item => item.skillId),
    manualReview: review, manual: projectManualReviewV043(findings, review), reviewRank: batch.review_rank,
    sourceTrace: trace, sourceTraceStatus: record.source_trace_status, sourceLinkStatus: record.source_link_status, integrityStatus: record.integrity_status,
    link, contentSource: "ANALYSIS_TIME", rawSupplement: null as Json | null, sourceConflict: false
  };
}

const labels: Record<string, string> = {
  CLASSIFIED: "已分類", EXCLUDED: "排除分類", UNKNOWN: "無法判定", FAILED: "分析失敗",
  AI_ONLY: "尚未驗收", REVIEW_PARTIAL: "部分驗收", REVIEW_COMPLETED: "驗收完成",
  PRIMARY_MATCHED: "主鍵配對成功", FALLBACK_MATCHED: "備援配對成功", NOT_ATTEMPTED: "尚未配對", NOT_FOUND: "找不到來源", AMBIGUOUS: "多個候選", ERROR: "配對錯誤", SOURCE_DATABASE_MISMATCH: "來源資料庫不符", IDENTITY_CONFLICT: "身分衝突",
  COMPLETE: "追溯契約完整", PARTIAL: "部分追溯", MISSING: "未提供", INVALID: "無效",
  VERIFIED: "完整性已核對", MISMATCH: "完整性不符", UNVERIFIABLE: "無法核對完整性", NOT_CHECKED: "尚未核對",
  READY: "資料可用", READY_EMPTY: "空資料庫", READY_WITH_DATA: "資料庫可用", NOT_CREATED: "尚未建立", NOT_SELECTED: "尚未選擇", READ_ONLY_DIAGNOSTIC: "唯讀診斷", MIGRATION_REQUIRED: "需要遷移",
  AI_DATABASE_CLOSED: "AI 資料庫未開啟，仍可查詢原始事件", READY_NO_AI_RECORDS: "AI 資料庫沒有分析記錄", RELINK_REQUIRED: "尚無配對結果，請重新配對來源", PARTIAL_MATCH: "部分来源已配對", FULL_MATCH: "所有 AI 記錄已配對", QUERY_ERROR: "查詢失敗", BLOCKED_RAW_DB: "原始資料庫不可用", ANALYZED: "已有分析", UNANALYZED: "尚無已配對分析", NO_AI_DATABASE: "AI 資料庫未開啟"
};
export function aiStatusLabelV043(value: unknown) { const code = String(value ?? ""); return code ? `${labels[code] ?? "未識別狀態"} / ${code}` : "未提供"; }
