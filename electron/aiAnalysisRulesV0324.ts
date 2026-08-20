import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AiAnalysisError, type AiCatalogEntry, type AiRuleDocumentRole, type AiRuleRoleDocument, type AiRuleSelectionMode, type AiRulesSnapshot } from "../shared/aiAnalysisContract.js";

export const V0324_RULE_BINDING = {
  ruleSetId: "JAA-SKILL-RULESET-2026-08-20-DRAFT-06",
  manifestSchemaVersion: "0.6.0",
  commonRulesVersion: "1.5.0",
  catalogVersion: "0.3.1",
  classificationEngineVersion: "JAA-CLASSIFICATION-1.4.0",
  promptVersion: "JAA-CHATGPT-ZH-TW-0.3.24",
  pipelineVersion: "JAA-ANALYSIS-PIPELINE-0.3.24",
  modelDecisionSchemaVersion: "jaa-ai-analysis-decisions-v4",
  qualityContractVersion: "jaa-ai-analysis-quality-v2",
  evidenceNormalizerVersion: "JAA-EVIDENCE-NORMALIZER-1.0.0",
  evidenceSegmenterVersion: "JAA-EVIDENCE-SEGMENTER-1.0.0",
  issueSnapshotContractVersion: "jaa-issue-snapshot-profile-v1",
  canonicalResultContractVersion: "jaa-canonical-analysis-result-v5",
  reportDataPackageContractVersion: "jaa-analysis-report-data-package-v1",
  templateFileName: "Skill_Analysis_HTML_Report_Template_v1.4.0.md",
  templateId: "JAA-SKILL-ANALYSIS-GOLDEN-HTML",
  templateVersion: "1.4.0",
  templateSchemaVersion: "jaa-html-report-template-v5",
  rendererVersion: "JAA-LOCAL-HTML-RENDERER-1.4.0"
} as const;

export const V0324_RULE_HASHES = {
  manifest: "96dbdc78ee97f50c6025fbf21d4efb11a24c7973100edfd0bf72c1825c947d76",
  common_rules: "779f7afa569834535cd200895412097dbee13a775d588555deacae1ce8c47ccc",
  catalog: "dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d",
  html_template: "a2370c1a92bf3b504e23764ef8fdba54ca073f084b4c50605b7250f08a27c5d4"
} as const;

export type RuleSelectionV0324 = { mode: AiRuleSelectionMode; manifest: string; catalog: string; commonRules: string; htmlTemplate: string };
export type HtmlReportTemplateContractV0324 = {
  schemaVersion: string; templateId: string; templateVersion: string; locale: string; timeZone: string; minimumRendererVersion: string;
  requiredCapabilities: string[]; renderModes: Array<"FORMAL_CANONICAL" | "DIAGNOSTIC_NON_CANONICAL">;
  input: { formalRole: string; diagnosticRole: string; requiredReportDataPackageContract: string; requiredIssueSnapshotProfile: string; requiredCanonicalContract: string; requiredDecisionContract: string; requiredNormalizerVersion: string; requiredSegmenterVersion: string; requiredIssueSnapshotContract: string; legacyPreviewContracts: string[] };
  output: { formalFilePattern: string; diagnosticFilePattern: string; overwriteExisting: boolean; selfContained: boolean; networkAccess: boolean; defaultTheme: string; printEnabled: boolean; filteredCsvEnabled: boolean };
  sections: string[]; statistics: Record<string, unknown>; snapshot: Record<string, unknown>; filters: Record<string, unknown>; pagination: Record<string, unknown>; sorting: string[]; fieldVisibility: Record<string, unknown>; evidencePresentation: Record<string, unknown>; qualityMetrics: string[]; actions: string[]; compatibility: Record<string, unknown>; diagnosticMode: Record<string, unknown>; statusLabels: Record<string, string>; qualityLabels: Record<string, string>; confidenceMapping: Record<string, string>; security: Record<string, unknown>;
};

const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
const canonical = (value: string) => fs.realpathSync.native(path.resolve(value));
function manifestValue(text: string, key: string) { const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return (text.match(new RegExp(`\\|\\s*\\\`${escaped}\\\`\\s*\\|\\s*\\\`?([^|\\\`]+)`, "i"))?.[1] ?? "").trim(); }
function headerValue(text: string, label: string) { const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return text.match(new RegExp(`^-\\s*${escaped}:\\s*\\\`([^\\\`]+)\\\``, "im"))?.[1]?.trim() ?? ""; }

export function parseHtmlReportTemplateV0324(text: string) {
  const begin = "<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->", end = "<!-- END JAA_HTML_REPORT_TEMPLATE_JSON -->";
  if (text.split(begin).length !== 2 || text.split(end).length !== 2 || text.indexOf(end) <= text.indexOf(begin)) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", "Template markers must occur exactly once and in order.");
  const block = text.slice(text.indexOf(begin) + begin.length, text.indexOf(end)); const fences = [...block.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
  if (fences.length !== 1) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", "Template machine block must contain exactly one JSON object.");
  let contract: HtmlReportTemplateContractV0324; try { contract = JSON.parse(fences[0][1]); } catch (error) { throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", `Template JSON is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  if (!Array.isArray(contract.requiredCapabilities) || !Array.isArray(contract.renderModes) || !contract.input || !contract.output || !contract.security) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", "Template v5 contract is incomplete.");
  const capabilities = ["REPORT_DATA_PACKAGE_V1", "UNIQUE_ISSUE_SNAPSHOT_V1", "SNAPSHOT_FIELD_STATE_V1", "DECLARATIVE_STATISTICS_DSL_V1", "MULTI_TEMPLATE_OFFLINE_RENDER_V1"];
  const missing = capabilities.filter((item) => !contract.requiredCapabilities.includes(item));
  if (missing.length) throw new AiAnalysisError("AI_HTML_RENDERER_INCOMPATIBLE", `Template required capabilities are incomplete: ${missing.join(", ")}`);
  if (contract.security.allowArbitraryTemplateScript !== false || contract.security.allowRemoteResource !== false || contract.security.allowFetch !== false || contract.security.allowXhr !== false || contract.security.allowWebSocket !== false) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", "Template security contract permits forbidden executable or network behavior.");
  return { contract, machineBlock: fences[0][1] };
}

function parseCatalog(text: string): AiCatalogEntry[] {
  const records: AiCatalogEntry[] = []; let columns: { id: number; name: number; group: number; detail: number } | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) { columns = null; continue; }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim()); const id = cells.findIndex((cell) => /^skill[ _-]?id$/i.test(cell));
    if (id >= 0) { columns = { id, name: cells.findIndex((cell) => /^skill[ _-]?name$/i.test(cell)), group: cells.findIndex((cell) => /^group$/i.test(cell)), detail: cells.findIndex((cell) => /^(detail|detail[ _-]?description)$/i.test(cell)) }; continue; }
    if (!columns || cells.every((cell) => /^[-: ]+$/.test(cell))) continue; const raw = cells[columns.id] ?? ""; if (!/^[A-Z][A-Z0-9_-]{2,}$/.test(raw)) continue;
    records.push({ id: raw.normalize("NFC"), name: cells[columns.name] || raw, group: cells[columns.group] || raw.split("_")[0] || "General", catalogStatus: "review-draft", detailDescription: columns.detail >= 0 ? cells[columns.detail] || null : null });
  }
  if (!records.length) throw new AiAnalysisError("ANALYSIS_RULES_INVALID", "No Skill Catalog records were parsed from the explicitly selected Catalog.");
  if (new Set(records.map((row) => row.id.trim().normalize("NFKC"))).size !== records.length) throw new AiAnalysisError("ANALYSIS_RULES_DUPLICATE_SKILL_ID", "Skill Catalog contains duplicate normalized Skill IDs.");
  return records;
}

function roleDocument(role: AiRuleDocumentRole, filePath: string, version: string, providerVisible: boolean): AiRuleRoleDocument {
  const resolved = canonical(filePath); const bytes = fs.readFileSync(resolved); const stat = fs.statSync(resolved);
  return { role, fileName: path.basename(resolved), fullPath: resolved, version, sha256: sha256(bytes), sizeBytes: stat.size, status: "verified", providerVisible };
}

export function bundledRuleSelectionV0324(directory: string): RuleSelectionV0324 {
  const root = canonical(directory);
  return { mode: "BUNDLED_DEFAULT", manifest: path.join(root, "Skill_Analysis_Rule_Set_Manifest_v0.6.0.md"), catalog: path.join(root, "Skill_Catalog_v0.3.1.md"), commonRules: path.join(root, "Skill_Classification_Common_Rules_v1.5.0.md"), htmlTemplate: path.join(root, "Skill_Analysis_HTML_Report_Template_v1.4.0.md") };
}

export function loadExplicitRulesSnapshotV0324(selection: RuleSelectionV0324): AiRulesSnapshot {
  const selected = [selection.manifest, selection.catalog, selection.commonRules, selection.htmlTemplate].map(canonical);
  if (new Set(selected.map((item) => item.toLocaleLowerCase("en-US"))).size !== 4) throw new AiAnalysisError("ANALYSIS_RULES_INVALID", "The four Rule/Template roles must use four distinct explicitly selected files.");
  const [manifestText, catalogText, rulesText, templateText] = selected.map((item) => fs.readFileSync(item, "utf8")); const parsedTemplate = parseHtmlReportTemplateV0324(templateText);
  const observed = {
    ruleSetId: manifestValue(manifestText, "rule_set_id"), manifestSchemaVersion: headerValue(manifestText, "Manifest Schema Version") || manifestValue(manifestText, "manifest_schema_version"), commonRulesVersion: manifestValue(manifestText, "common_rules_version"), catalogVersion: manifestValue(manifestText, "skill_catalog_version"), classificationEngineVersion: manifestValue(manifestText, "classification_engine_version"), promptVersion: manifestValue(manifestText, "prompt_version"), pipelineVersion: manifestValue(manifestText, "pipeline_version"), modelDecisionSchemaVersion: manifestValue(manifestText, "model_decision_schema_version"), qualityContractVersion: manifestValue(manifestText, "quality_contract_version"), evidenceNormalizerVersion: manifestValue(manifestText, "evidence_normalizer_version"), evidenceSegmenterVersion: manifestValue(manifestText, "evidence_segmenter_version"), issueSnapshotContractVersion: manifestValue(manifestText, "issue_snapshot_contract_version"), canonicalResultContractVersion: manifestValue(manifestText, "canonical_result_contract_version"), reportDataPackageContractVersion: manifestValue(manifestText, "report_data_package_contract_version"), rendererVersion: manifestValue(manifestText, "html_renderer_version")
  };
  const expectedSubset = { ...V0324_RULE_BINDING } as Record<string, unknown>; const mismatches: Array<{ key: string; expected: unknown; observed: unknown }> = Object.entries(observed).filter(([key, value]) => value !== expectedSubset[key]).map(([key, value]) => ({ key, expected: expectedSubset[key], observed: value || null }));
  if (parsedTemplate.contract.schemaVersion !== V0324_RULE_BINDING.templateSchemaVersion || parsedTemplate.contract.templateId !== V0324_RULE_BINDING.templateId || parsedTemplate.contract.templateVersion !== V0324_RULE_BINDING.templateVersion || parsedTemplate.contract.minimumRendererVersion !== V0324_RULE_BINDING.rendererVersion || parsedTemplate.contract.input.requiredReportDataPackageContract !== V0324_RULE_BINDING.reportDataPackageContractVersion || parsedTemplate.contract.input.requiredDecisionContract !== V0324_RULE_BINDING.modelDecisionSchemaVersion || parsedTemplate.contract.input.requiredSegmenterVersion !== V0324_RULE_BINDING.evidenceSegmenterVersion) mismatches.push({ key: "templateCompatibility", expected: V0324_RULE_BINDING, observed: parsedTemplate.contract.input });
  const roleDocuments = [roleDocument("manifest", selected[0], V0324_RULE_BINDING.manifestSchemaVersion, true), roleDocument("catalog", selected[1], V0324_RULE_BINDING.catalogVersion, true), roleDocument("common_rules", selected[2], V0324_RULE_BINDING.commonRulesVersion, true), roleDocument("html_template", selected[3], V0324_RULE_BINDING.templateVersion, false)];
  for (const document of roleDocuments) if (document.sha256 !== V0324_RULE_HASHES[document.role]) mismatches.push({ key: `${document.role}Sha256`, expected: V0324_RULE_HASHES[document.role], observed: document.sha256 });
  const expectedNames = { manifest: "Skill_Analysis_Rule_Set_Manifest_v0.6.0.md", catalog: "Skill_Catalog_v0.3.1.md", common_rules: "Skill_Classification_Common_Rules_v1.5.0.md", html_template: V0324_RULE_BINDING.templateFileName } as const;
  for (const document of roleDocuments) if (document.fileName !== expectedNames[document.role]) mismatches.push({ key: `${document.role}FileName`, expected: expectedNames[document.role], observed: document.fileName });
  if (mismatches.length) throw new AiAnalysisError("AI_RULE_SET_BINDING_MISMATCH", `v0.3.24 explicit Rule/Template binding mismatch: ${JSON.stringify(mismatches)}`);
  const catalog = parseCatalog(catalogText); const templateStat = fs.statSync(selected[3]); const snapshotId = sha256(JSON.stringify(roleDocuments.map(({ role, sha256: hash }) => ({ role, sha256: hash }))));
  return { valid: true, rulesDirectoryLabel: selection.mode === "BUNDLED_DEFAULT" ? "Bundled v0.3.24" : "Manual explicit v0.3.24", rulesDirectoryPath: selection.mode === "BUNDLED_DEFAULT" ? path.dirname(selected[0]) : undefined, snapshotId, validatedAt: new Date().toISOString(), ...observed, parserVersion: "ai-rules-parser-v1", files: roleDocuments.slice(0, 3).map((item) => ({ kind: item.role === "common_rules" ? "rules" as const : item.role === "manifest" ? "manifest" as const : "catalog" as const, fileName: item.fileName, fullPath: item.fullPath, version: item.version, sha256: item.sha256, sizeBytes: item.sizeBytes, status: item.status })), htmlReportTemplate: { kind: "html_template", fileName: roleDocuments[3].fileName, fullPath: roleDocuments[3].fullPath, version: V0324_RULE_BINDING.templateVersion, templateId: V0324_RULE_BINDING.templateId, schemaVersion: V0324_RULE_BINDING.templateSchemaVersion, minimumRendererVersion: V0324_RULE_BINDING.rendererVersion, sha256: roleDocuments[3].sha256, sizeBytes: templateStat.size, mtimeMs: templateStat.mtimeMs, status: "verified", manifestBound: true, providerVisible: false }, catalogCount: catalog.length, uniqueSkillIdCount: catalog.length, duplicateSkillIdCount: 0, duplicateDetails: [], catalog, commonRulesNormalized: rulesText.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^#{2,4}\s|^[-*]\s/.test(line)).slice(0, 500), errors: [], warnings: [], selectionMode: selection.mode, roleDocuments };
}