import fs from "./businessIoDiagnosticsV044.js";
import path from "node:path";
import crypto from "node:crypto";

type Json = Record<string, any>;
type Problem = { code: string; path: string; message: string };
const confidence = [0, 0.3, 0.6, 0.9];
const canonical = (value: any): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}` : JSON.stringify(value);

export function resolvePackageEvidenceV043(pkg: Json, index: number, evidence: Json) {
  if (typeof evidence?.sourceJsonPointer !== "string" || typeof evidence.quote !== "string" || !evidence.quote) return false;
  const prefix = `/records/${index}/`;
  let pointer = evidence.sourceJsonPointer;
  if (pointer.startsWith(`${prefix}diff/`)) pointer = pointer.replace(`${prefix}diff/`, `${prefix}sourceTrace/diff/`);
  if (!pointer.startsWith(`${prefix}sourceTrace/diff/`) || /~(?![01])/u.test(pointer)) return false;
  let value: any = pkg;
  for (const part of pointer.slice(1).split("/").map((p: string) => p.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) return false;
    value = value[part];
  }
  return typeof value === "string" && value.includes(evidence.quote);
}

export function validatePackageSemanticsV043(pkg: Json, contractsDirectory: string): Problem[] {
  const errors: Problem[] = [];
  const add = (code: string, pointer: string) => errors.push({ code, path: pointer, message: code });
  const catalog = JSON.parse(fs.readFileSync(path.join(contractsDirectory, "catalog-v0.3.5.json"), "utf8")) as Json;
  const versions = pkg.rulesBinding?.manifest?.version === "1.6.0" ? ["1.6.0", "2.6.0", "0.3.5", "1.13.1"] : pkg.rulesBinding?.manifest?.version === "1.6.1" ? ["1.6.1", "2.6.1", "0.3.5", "1.13.2"] : [];
  const names = ["Skill_Analysis_Rule_Set_Manifest", "Skill_Classification_Common_Rules", "Skill_Catalog", "Skill_Analysis_HTML_Report_Template"];
  ["manifest", "commonRules", "skillCatalog", "htmlTemplate"].forEach((role, i) => {
    const b = pkg.rulesBinding?.[role], name = `${names[i]}_v${versions[i]}.md`;
    if (!versions.length || b?.version !== versions[i] || b?.file !== name) { add("RULESET_BINDING_MISMATCH", `/rulesBinding/${role}`); return; }
    const bytes = fs.readFileSync(path.join(contractsDirectory, name));
    if (b.sha256 !== crypto.createHash("sha256").update(bytes).digest("hex") || (b.bytes !== undefined && b.bytes !== bytes.length)) add("RULESET_BINDING_MISMATCH", `/rulesBinding/${role}`);
  });
  for (const [i, record] of (pkg.records as Json[]).entries()) {
    const a = record.aiAnalysis, rv = record.manualReview, ref = record.sourceTrace.reference, prefix = `/records/${i}`;
    if (pkg.rulesBinding.manifest.version === "1.6.1" && record.dedupeKey !== `${ref.sourceDatabaseId}:${ref.activityEventId}`) add("DEDUPE_IDENTITY_MISMATCH", `${prefix}/dedupeKey`);
    if (!confidence.includes(a.confidence)) add("INVALID_CONFIDENCE", `${prefix}/aiAnalysis/confidence`);
    if ((a.status === "CLASSIFIED") !== Boolean(a.skillFindings.length)) add("STATUS_FINDINGS_MISMATCH", `${prefix}/aiAnalysis`);
    if ((a.status === "UNKNOWN") !== Boolean(a.unknownReasons.length)) add("STATUS_REASONS_MISMATCH", `${prefix}/aiAnalysis/unknownReasons`);
    if (["EXCLUDED", "FAILED"].includes(a.status) && a.confidence !== 0) add("INVALID_CONFIDENCE", `${prefix}/aiAnalysis/confidence`);
    const ids = new Set<string>();
    for (const f of a.skillFindings) {
      if (!catalog[f.skillId] || catalog[f.skillId].skillName !== f.skillName) add("UNKNOWN_SKILL_OR_NAME", `${prefix}/aiAnalysis/skillFindings`);
      if (ids.has(f.skillId)) add("DUPLICATE_SKILL", `${prefix}/aiAnalysis/skillFindings`);
      ids.add(f.skillId);
      if (!confidence.includes(f.confidence)) add("INVALID_CONFIDENCE", `${prefix}/aiAnalysis/skillFindings`);
      if (!f.evidence.every((e: Json) => resolvePackageEvidenceV043(pkg, i, e))) add("EVIDENCE_POINTER_QUOTE_MISMATCH", `${prefix}/aiAnalysis/skillFindings`);
    }
    if (!rv) continue;
    for (const key of ["evidenceId", "sourceRecordStableId", "issueKey"]) if (rv[key] !== undefined && rv[key] !== ref[key]) add("REVIEW_IDENTITY_MISMATCH", `${prefix}/manualReview/${key}`);
    if (rv.aiStatus !== undefined && rv.aiStatus !== a.status) add("REVIEW_AI_STATUS_MISMATCH", `${prefix}/manualReview/aiStatus`);
    const reviews = new Map<string, Json>();
    for (const r of rv.skillReviews) {
      if (!r || !ids.has(r.skillId) || reviews.has(r.skillId) || !["UNREVIEWED", "ACCEPT", "REJECT", "ADJUST", "DOMAIN_CONFIRMATION_REQUIRED"].includes(r.verdict)) add("INVALID_SKILL_REVIEW", `${prefix}/manualReview/skillReviews`);
      if (r?.proposedConfidence != null && !confidence.includes(r.proposedConfidence)) add("INVALID_REVIEW_CONFIDENCE", `${prefix}/manualReview/skillReviews`);
      if (r) reviews.set(r.skillId, r);
    }
    const added = new Set<string>();
    for (const m of rv.missingSkillReviews) {
      if (!m || !catalog[m.skillId] || ids.has(m.skillId) || added.has(m.skillId) || ![0.3, 0.6, 0.9].includes(m.suggestedConfidence) || typeof m.reason !== "string" || !m.reason.trim() || !Array.isArray(m.evidence) || !m.evidence.length || !m.evidence.every((e: Json) => resolvePackageEvidenceV043(pkg, i, e))) add("INVALID_MISSING_SKILL_REVIEW", `${prefix}/manualReview/missingSkillReviews`);
      if (m) added.add(m.skillId);
    }
    for (const e of rv.additionalEvidenceAssignments) if (!e || !ids.has(e.targetSkillId) || !resolvePackageEvidenceV043(pkg, i, e) || typeof e.reason !== "string" || !e.reason.trim()) add("INVALID_EVIDENCE_ASSIGNMENT", `${prefix}/manualReview/additionalEvidenceAssignments`);
    if (rv.completed) {
      if (rv.expectedStatus === "UNDECIDED" || rv.domainConfirmationRequired) add("REVIEW_NOT_COMPLETE", `${prefix}/manualReview`);
      for (const id of ids) {
        const r = reviews.get(id);
        if (!r || !["ACCEPT", "REJECT", "ADJUST"].includes(r.verdict) || (r.verdict === "ADJUST" && !confidence.includes(r.proposedConfidence))) add("REVIEW_NOT_COMPLETE", `${prefix}/manualReview/skillReviews`);
      }
      const retained = [...reviews.values()].filter(r => ["ACCEPT", "ADJUST"].includes(r.verdict)).length + added.size;
      if ((rv.expectedStatus === "CLASSIFIED") !== (retained > 0)) add("REVIEW_STATUS_SKILLS_MISMATCH", `${prefix}/manualReview`);
    }
  }
  const pd = pkg.sourceTrace.pendingDocument;
  for (const key of ["sourceDatabase", "sourceView", "querySnapshot", "exportMetadata"]) if (pd[key] !== undefined && canonical(pd[key]) !== canonical(pkg.sourceTrace[key])) add("PENDING_METADATA_MISMATCH", `/sourceTrace/${key}`);
  for (const n of [pd.counts?.exportedCount, pd.integrity?.recordCount]) if (n !== undefined && n !== pkg.records.length) add("PENDING_COUNT_MISMATCH", "/sourceTrace/pendingDocument");
  return errors;
}
