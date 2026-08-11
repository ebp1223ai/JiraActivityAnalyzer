import { analysisRecordsFixture } from "./fixtures";
import type { AiMode, AiServiceState, AnalysisBasisFile, AnalyzedDataset, PendingDataset, SkillCatalogEntry } from "./types";

const secretKey = /(api.?key|token|authorization|cookie|password|secret|proxy.?credential)/i;
const urlSecret = /([?&](?:api_?key|token|access_token|password|secret)=)[^&#\s]+/gi;
const bearerValue = /\bBearer\s+[A-Za-z0-9._~+\/-]+/gi;
const basicValue = /\bBasic\s+[A-Za-z0-9+/=]+/gi;

export function sanitizeText(value: string) {
  return value
    .replace(urlSecret, "$1[masked]")
    .replace(bearerValue, "Bearer [masked]")
    .replace(basicValue, "Basic [masked]")
    .replace(/(Authorization\s*[:=]\s*)[^\s,;]+/gi, "$1[masked]")
    .replace(/((?:api.?key|token|password|cookie|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[masked]");
}

export function sanitizeDiagnosticPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeDiagnosticPayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      secretKey.test(key) ? "[masked]" : sanitizeDiagnosticPayload(item)
    ]));
  }
  return typeof value === "string" ? sanitizeText(value) : value;
}

export function analyzedFileName(sourceFileName: string) {
  const name = sourceFileName.trim() || "pending-analysis.json";
  return /^分析-/u.test(name) ? name : "分析-" + name;
}

export function reportFileName(analyzedName: string) {
  return "skill-analysis-" + analyzedName.replace(/^分析-/u, "").replace(/\.json$/i, "") + ".html";
}

export function serviceLabel(mode: AiMode) {
  if (mode === "cloud") return "雲端 AI";
  if (mode === "local") return "地端 AI";
  return "離線分析";
}

export function serviceReady(service: AiServiceState) {
  return service.configured && service.testStatus === "passed" && service.testedSettingsVersion === service.settingsVersion;
}

export function analysisBlockers(mode: AiMode, service: AiServiceState | null, selected: PendingDataset | null, basis: AnalysisBasisFile[]) {
  const blockers: string[] = [];
  if (mode !== "offline" && service) {
    if (!service.configured) blockers.push(serviceLabel(mode) + "尚未儲存設定");
    else if (service.testStatus === "running") blockers.push("完整診斷仍在執行");
    else if (service.testStatus === "failed") blockers.push("最近一次完整診斷失敗");
    else if (service.testStatus !== "passed" || service.testedSettingsVersion !== service.settingsVersion) blockers.push("設定尚未完成有效診斷");
  }
  if (!selected) blockers.push("尚未選取有效的待分析資料檔");
  if (selected?.integrity !== "verified") blockers.push("待分析資料檔完整性檢查未通過");
  if (!basis.every((item) => item.status === "verified")) blockers.push("共用分析依據尚未全部驗證");
  return blockers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isPendingAnalysisPayload(value: unknown) {
  if (!isRecord(value)) return false;
  return String(value.schemaName ?? "").includes("pending-analysis") && Array.isArray(value.records) && !value.fileType;
}

export function isAnalyzedActivityPayload(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.records)) return false;
  return Boolean(value.analysisRun) && value.records.some((item) => isRecord(item) && Array.isArray(item.analyses));
}

function text(value: unknown, fallback = "-") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function previewFromRecord(record: unknown, index: number) {
  const item = isRecord(record) ? record : {};
  const reference = isRecord(item.reference) ? item.reference : {};
  const diff = isRecord(item.diff) ? item.diff : {};
  const actor = isRecord(reference.actor) ? reference.actor : {};
  const hunks = Array.isArray(diff.diffHunks) ? diff.diffHunks : [];
  const firstHunk = isRecord(hunks[0]) ? hunks[0] : {};
  const lines = Array.isArray(firstHunk.lines) ? firstHunk.lines : [];
  return {
    id: text(reference.activityEventId, "IMPORTED-" + (index + 1)),
    issueKey: text(reference.issueKey, "UNKNOWN"),
    actor: text(actor.displayName ?? actor.accountId, "Unknown actor"),
    field: text(reference.fieldName ?? reference.fieldId, "Activity Event"),
    occurredAt: text(reference.eventTime),
    summary: lines.map((line) => isRecord(line) ? text(line.text, "") : text(line, "")).filter(Boolean).join(" ").slice(0, 220) || "Compact Diff reference available in source SQLite.",
    added: Number(diff.addedLineCount ?? 0),
    deleted: Number(diff.removedLineCount ?? 0)
  };
}

export function pendingDatasetFromPayload(fileName: string, payload: unknown): PendingDataset | null {
  if (!isPendingAnalysisPayload(payload) || !isRecord(payload)) return null;
  const sourceDatabase = isRecord(payload.sourceDatabase) ? payload.sourceDatabase : {};
  const counts = isRecord(payload.counts) ? payload.counts : {};
  const querySnapshot = isRecord(payload.querySnapshot) ? payload.querySnapshot : {};
  const query = isRecord(querySnapshot.query) ? querySnapshot.query : {};
  const dateRange = isRecord(query.dateRange) ? query.dateRange : {};
  const records = payload.records as unknown[];
  return {
    id: "pending-import-" + Date.now(), fileName, fileType: "pending", subject: text(payload.sourceView, "Imported Activity Events"),
    dateRange: text(dateRange.startDate, "-") + " – " + text(dateRange.endDate, "-"), eventCount: Number(counts.exportedCount ?? records.length),
    issueCount: new Set(records.map((item) => isRecord(item) && isRecord(item.reference) ? item.reference.issueKey : null).filter(Boolean)).size,
    projectCount: new Set(records.map((item) => isRecord(item) && isRecord(item.reference) ? item.reference.projectKey : null).filter(Boolean)).size,
    jiraServer: text(sourceDatabase.jiraServerHost, "masked server"), sourceDatabase: text(sourceDatabase.sourceDatabaseId, "unknown database"),
    integrity: "verified", importedAt: new Date().toLocaleString("zh-TW"), previews: records.slice(0, 4).map(previewFromRecord), sourcePayload: payload
  };
}

export function analyzedDatasetFromPayload(fileName: string, payload: unknown): AnalyzedDataset | null {
  if (!isAnalyzedActivityPayload(payload) || !isRecord(payload)) return null;
  const sourceDatabase = isRecord(payload.sourceDatabase) ? payload.sourceDatabase : {};
  const analysisRun = isRecord(payload.analysisRun) ? payload.analysisRun : {};
  const summary = isRecord(payload.analysisSummary) ? payload.analysisSummary : {};
  const sourcePending = isRecord(payload.sourcePendingFile) ? payload.sourcePendingFile : {};
  const ruleSet = isRecord(payload.ruleSetSnapshot) ? payload.ruleSetSnapshot : {};
  const records = payload.records as unknown[];
  return {
    id: "analyzed-import-" + Date.now(), fileName, fileType: "analyzed", status: "completed", sourcePendingFileName: text(sourcePending.fileName, "unknown pending file"),
    subject: text(payload.sourceView, "Imported Activity Events"), dateRange: "Imported range", eventCount: Number(summary.sourceRecordCount ?? records.length), diffCount: records.length,
    issueCount: Number(summary.uniqueIssueCount ?? 0), projectCount: new Set(records.map((item) => isRecord(item) && isRecord(item.reference) ? item.reference.projectKey : null).filter(Boolean)).size,
    jiraServer: text(sourceDatabase.jiraServerHost, "masked server"), sourceDatabase: text(sourceDatabase.sourceDatabaseId, "unknown database"), integrity: "verified",
    importedAt: new Date().toLocaleString("zh-TW"), progress: 100, currentStep: "已分析完畢",
    snapshot: { mode: text(analysisRun.analyzerType).includes("LOCAL") ? "local" : text(analysisRun.analyzerType).includes("OFFLINE") ? "offline" : "cloud", provider: text(analysisRun.provider), model: text(analysisRun.modelId), settingsVersion: null, basisVersions: [text(ruleSet.skillCatalogVersion), text(ruleSet.commonRulesVersion)], basisHashes: [text(ruleSet.skillCatalogFileHash), text(ruleSet.commonRulesFileHash)] },
    records: analysisRecordsFixture.map((item) => ({ ...item, skills: item.skills.map((skill) => ({ ...skill })) })),
    summary: { analysisResultCount: Number(summary.analysisResultCount ?? 0), skillCandidateDiffCount: Number(isRecord(summary.recordsByDisposition) ? summary.recordsByDisposition.CANDIDATE_FOUND_CATALOG_DETAIL_MISSING ?? 0 : 0), needsReviewCount: Number(isRecord(summary.recordsByDisposition) ? summary.recordsByDisposition.NEEDS_REVIEW ?? 0 : 0), excludedOrUnknownCount: Number(isRecord(summary.recordsByDisposition) ? Number(summary.recordsByDisposition.EXCLUDED ?? 0) + Number(summary.recordsByDisposition.UNKNOWN ?? 0) : 0), catalogSkillCount: 279 },
    sourcePayload: payload
  };
}

export function downloadText(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}

export function buildStaticSkillReport(dataset: AnalyzedDataset, catalog: SkillCatalogEntry[]) {
  const people = Array.from(new Set(dataset.records.map((item) => item.actor))).sort();
  const issues = Array.from(new Set(dataset.records.map((item) => item.issueKey))).sort();
  const groups = Array.from(new Set(catalog.map((item) => item.group))).sort();
  const option = (value: string) => "<option value=\"" + escapeHtml(value) + "\">" + escapeHtml(value) + "</option>";
  const rows = dataset.records.map((record) => {
    const skills = record.skills.map((skill) => {
      const item = catalog.find((entry) => entry.id === skill.skillId);
      const tip = [skill.skillId, item?.name ?? skill.skillName, item?.group ?? skill.group, "Catalog: review-draft", item?.detailDescription ?? "尚待補齊"].join(" · ");
      return "<button class=\"skill\" data-skill=\"" + escapeHtml(skill.skillId) + "\" title=\"" + escapeHtml(tip) + "\">" + escapeHtml(skill.skillId) + "</button>";
    }).join(" ") || "—";
    return "<tr data-person=\"" + escapeHtml(record.actor) + "\" data-issue=\"" + escapeHtml(record.issueKey) + "\" data-status=\"" + escapeHtml(record.disposition) + "\" data-group=\"" + escapeHtml(record.skills.map((item) => item.group).join(" ")) + "\" data-skill=\"" + escapeHtml(record.skills.map((item) => item.skillId).join(" ")) + "\"><td>" + escapeHtml(record.id) + "<small>" + escapeHtml(record.evidenceId) + "</small></td><td>" + escapeHtml(record.issueKey) + "<small>" + escapeHtml(record.actor) + "</small></td><td>" + escapeHtml(record.diffSummary) + "<details><summary>完整 Diff／Evidence／理由</summary><pre>" + escapeHtml(record.fullDiff) + "</pre><p><b>正面證據：</b>" + escapeHtml(record.positiveEvidence.join("；") || "—") + "</p><p><b>負面證據：</b>" + escapeHtml(record.negativeEvidence.join("；") || "—") + "</p><p><b>Rules：</b>" + escapeHtml(record.matchedRules.join("；")) + "</p><p><b>Trace：</b>" + escapeHtml(record.traceId) + "</p></details></td><td>" + skills + "</td><td>" + escapeHtml(record.dispositionLabel) + "</td></tr>";
  }).join("");
  const catalogRows = catalog.map((item) => "<tr data-catalog=\"" + escapeHtml([item.id, item.name, item.group].join(" ").toLowerCase()) + "\"><td><button class=\"catalog-skill\" data-skill=\"" + escapeHtml(item.id) + "\">" + escapeHtml(item.id) + "</button></td><td>" + escapeHtml(item.name) + "</td><td>" + escapeHtml(item.group) + "</td><td>review-draft</td><td>" + escapeHtml(item.detailDescription ?? "尚待補齊") + "</td><td>" + dataset.records.reduce((count, record) => count + record.skills.filter((skill) => skill.skillId === item.id).length, 0) + "</td></tr>").join("");
  const safeData = JSON.stringify({ fileName: dataset.fileName, generatedAt: new Date().toISOString() }).replace(/</g, "\\u003c");
  return "<!doctype html><html lang=\"zh-Hant\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>技能分析報告 - " + escapeHtml(dataset.fileName) + "</title><style>" +
    "*{box-sizing:border-box}body{margin:0;background:#f5f8fc;color:#14213d;font:14px system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:28px}header{border-top:5px solid #2463df;background:white;padding:24px;border-radius:6px}h1{margin:6px 0;font-size:28px}.eyebrow{font-size:11px;font-weight:800;color:#2463df;letter-spacing:.08em}.stats,.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:16px 0}.stat,.panel{border:1px solid #d9e2ef;background:#fff;border-radius:6px;padding:14px}.stat b{display:block;font-size:24px}.toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}input,select,button{border:1px solid #cbd7e8;border-radius:5px;background:white;padding:9px;font:inherit}button{font-weight:750;color:#1558d6;cursor:pointer}.primary{background:#1558d6;color:white}.table-wrap{overflow:auto;max-height:650px}table{width:100%;border-collapse:collapse;min-width:900px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e5ecf5;padding:10px}th{position:sticky;top:0;background:#f8fbff}td small{display:block;color:#66758d;margin-top:4px}.skill{padding:4px 6px;background:#eef4ff}.hidden{display:none}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0f172a;color:#f8fafc;padding:10px;border-radius:4px}.views{display:flex;gap:8px;margin-top:18px}@media(max-width:720px){main{padding:12px}header{padding:16px}.table-wrap{max-height:none}}" +
    "</style></head><body><main><header><span class=\"eyebrow\">JIRA ACTIVITY ANALYZER · SELF-CONTAINED STATIC REPORT</span><h1>Activity Event Diff 技能分析結果</h1><p>來源：" + escapeHtml(dataset.fileName) + " · " + escapeHtml(dataset.snapshot.provider + " / " + dataset.snapshot.model) + " · Catalog review-draft</p></header><section class=\"stats\"><div class=\"stat\">Diff<b>" + dataset.diffCount + "</b></div><div class=\"stat\">分析結果<b>" + dataset.summary.analysisResultCount + "</b></div><div class=\"stat\">技能候選 Diff<b>" + dataset.summary.skillCandidateDiffCount + "</b></div><div class=\"stat\">需要覆核<b>" + dataset.summary.needsReviewCount + "</b></div><div class=\"stat\">Catalog Skills<b>" + catalog.length + "</b></div></section><div class=\"views\"><button id=\"show-results\" class=\"primary\">逐筆分析結果</button><button id=\"show-catalog\">技能編號查詢</button></div><section id=\"results\" class=\"panel\"><div class=\"filters\"><select id=\"person\"><option value=\"\">所有人員</option>" + people.map(option).join("") + "</select><select id=\"issue\"><option value=\"\">所有 Issue</option>" + issues.map(option).join("") + "</select><select id=\"status\"><option value=\"\">所有狀態</option><option value=\"candidate\">技能候選</option><option value=\"needs_review\">需要覆核</option><option value=\"excluded\">已排除</option><option value=\"unknown\">無法判定</option></select><select id=\"group\"><option value=\"\">所有 Group</option>" + groups.map(option).join("") + "</select><input id=\"skill-filter\" placeholder=\"技能編號\"><input id=\"keyword\" placeholder=\"關鍵字\"></div><div class=\"toolbar\"><button id=\"clear\">清除篩選</button><button id=\"csv\">匯出目前篩選 CSV</button><span id=\"count\"></span></div><div class=\"table-wrap\"><table><thead><tr><th>Activity / Evidence</th><th>Issue / Actor</th><th>Diff / Evidence</th><th>技能候選</th><th>狀態</th></tr></thead><tbody id=\"result-body\">" + rows + "</tbody></table></div></section><section id=\"catalog\" class=\"panel hidden\"><div class=\"toolbar\"><input id=\"catalog-query\" placeholder=\"搜尋技能編號、名稱、Group、關鍵字\"><span>完整 fixture：" + catalog.length + " 項</span></div><div class=\"table-wrap\"><table><thead><tr><th>Skill ID</th><th>Name</th><th>Group</th><th>Catalog</th><th>Detail</th><th>引用</th></tr></thead><tbody id=\"catalog-body\">" + catalogRows + "</tbody></table></div></section></main><script>const reportMeta=" + safeData + ";function visibleRows(){return [...document.querySelectorAll('#result-body tr')].filter(r=>!r.classList.contains('hidden'))}function apply(){const p=person.value,i=issue.value,s=status.value,g=group.value.toLowerCase(),sk=document.getElementById('skill-filter').value.toLowerCase(),q=keyword.value.toLowerCase();[...document.querySelectorAll('#result-body tr')].forEach(r=>{const ok=(!p||r.dataset.person===p)&&(!i||r.dataset.issue===i)&&(!s||r.dataset.status===s)&&(!g||r.dataset.group.toLowerCase().includes(g))&&(!sk||r.dataset.skill.toLowerCase().includes(sk))&&(!q||r.innerText.toLowerCase().includes(q));r.classList.toggle('hidden',!ok)});count.textContent='顯示 '+visibleRows().length+' 筆'}document.querySelectorAll('#results input,#results select').forEach(e=>e.addEventListener('input',apply));clear.onclick=()=>{document.querySelectorAll('#results input,#results select').forEach(e=>e.value='');apply()};document.getElementById('show-results').onclick=()=>{results.classList.remove('hidden');catalog.classList.add('hidden')};document.getElementById('show-catalog').onclick=()=>{catalog.classList.remove('hidden');results.classList.add('hidden')};document.getElementById('catalog-query').oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#catalog-body tr').forEach(r=>r.classList.toggle('hidden',!r.dataset.catalog.includes(q)))};document.querySelectorAll('.catalog-skill').forEach(b=>b.onclick=()=>{document.getElementById('skill-filter').value=b.dataset.skill;document.getElementById('show-results').click();apply()});csv.onclick=()=>{const dq=String.fromCharCode(34);const lines=[['Activity Event','Issue','Actor','Status'].join(',')];visibleRows().forEach(r=>lines.push([...r.children].slice(0,2).map(c=>dq+c.innerText.replaceAll(dq,dq+dq)+dq).join(',')+','+dq+r.dataset.status+dq));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\\ufeff'+lines.join('\\n')],{type:'text/csv'}));a.download='skill-analysis-filtered.csv';a.click()};apply();</script></body></html>";
}
