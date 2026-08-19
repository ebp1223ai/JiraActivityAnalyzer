import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AiAnalysisError, type AiRulesSnapshot } from "../shared/aiAnalysisContract.js";
import { loadManifestRulesSnapshot } from "./aiAnalysisRulesV0310.js";

export const V0322_RULE_BINDING = {
  ruleSetId: "JAA-SKILL-RULESET-2026-08-19-DRAFT-04", manifestSchemaVersion: "0.4.0", commonRulesVersion: "1.3.0", catalogVersion: "0.3.1",
  classificationEngineVersion: "JAA-CLASSIFICATION-1.3.0", promptVersion: "JAA-CHATGPT-ZH-TW-0.3.22", pipelineVersion: "JAA-ANALYSIS-PIPELINE-0.3.22",
  modelDecisionSchemaVersion: "jaa-ai-analysis-decisions-v3", qualityContractVersion: "jaa-ai-analysis-quality-v1", evidenceNormalizerVersion: "JAA-EVIDENCE-NORMALIZER-1.0.0",
  issueSnapshotContractVersion: "jaa-run-issue-snapshot-v1", canonicalResultContractVersion: "jaa-canonical-analysis-result-v4",
  templateFileName: "Skill_Analysis_HTML_Report_Template_v1.2.0.md", templateId: "JAA-SKILL-ANALYSIS-GOLDEN-HTML", templateVersion: "1.2.0", templateSchemaVersion: "jaa-html-report-template-v3", rendererVersion: "JAA-LOCAL-HTML-RENDERER-1.2.0"
} as const;
export const V0322_RULE_HASHES = { manifest: "e6f20f18166525ceaa62b65ca7e0c8c734e4f82f904026920098216af62936bd", rules: "154d6af73922434a0f5d73b4630c4fc8f9d50b88a25c9bcae43151e8835b0e9b", catalog: "dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d", template: "406afea52b6c0cb12680708c9da4cae9f41b024caf9ab12a7e6a9f2f8665b8a4" } as const;
const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");
function value(text: string, key: string) { const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return text.match(new RegExp(`\\|\\s*\\\`${escaped}\\\`\\s*\\|\\s*\\\`?([^|\\\`]+)`, "i"))?.[1]?.trim() ?? ""; }
function header(text: string, label: string) { const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return text.match(new RegExp(`^-\\s*${escaped}:\\s*\\\`([^\\\`]+)\\\``, "im"))?.[1]?.trim() ?? ""; }

export type HtmlReportTemplateContractV0322 = {
  schemaVersion: string; templateId: string; templateVersion: string; locale: string; timeZone: string; minimumRendererVersion: string;
  input: { role: string; requiredDecisionContract: string; requiredNormalizerVersion: string; requiredIssueSnapshotContract: string; legacyPreviewContracts: string[] };
  output: { fileNamePattern: string; selfContained: boolean; networkAccess: boolean; defaultTheme: string; printEnabled: boolean; filteredCsvEnabled: boolean };
  sections: string[]; statistics: Record<string, unknown>; filters: { fields: string[]; sameFieldOperator: string; crossFieldOperator: string; includeExcludeMode: boolean; skillMatchModes: string[] };
  pagination: { pageSizes: Array<number | string>; defaultPageSize: number }; sorting: string[]; fieldVisibility: { groups: Record<string, string[]>; csvFollowsSelection: boolean; printFollowsSelection: boolean };
  evidencePresentation: Record<string, unknown>; qualityMetrics: string[]; actions: string[]; statusLabels: Record<string, string>; qualityLabels: Record<string, string>; confidenceMapping: Record<string, string>;
  security: { escapeAllSourceText: boolean; renderSourceWithTextContentOnly: boolean; allowInlineDataScript: boolean; allowArbitraryTemplateScript: boolean; allowRemoteResource: boolean; allowFetch: boolean; allowXhr: boolean; allowWebSocket: boolean; contentSecurityPolicy: string };
};
export function parseHtmlReportTemplateV0322(text: string) {
  const begin = "<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->", end = "<!-- END JAA_HTML_REPORT_TEMPLATE_JSON -->";
  if (text.split(begin).length !== 2 || text.split(end).length !== 2 || text.indexOf(end) <= text.indexOf(begin)) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", "Template markers must occur exactly once and in order.");
  const block = text.slice(text.indexOf(begin) + begin.length, text.indexOf(end)); const fences = [...block.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
  if (fences.length !== 1) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", "Template machine block must contain one JSON object.");
  let contract: HtmlReportTemplateContractV0322; try { contract = JSON.parse(fences[0][1]); } catch (error) { throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", `Template JSON is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  if (!contract?.filters?.fields || !contract.fieldVisibility?.groups || !contract.security || !contract.statistics || !contract.pagination) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", "Template contract is incomplete.");
  return { contract, machineBlock: fences[0][1] };
}

export function loadV0322RulesSnapshot(directory: string, allowedRoots: string[]) {
  const base = loadManifestRulesSnapshot(directory, allowedRoots); const root = fs.realpathSync.native(path.resolve(directory)); const manifestFile = base.files.find((file) => file.kind === "manifest");
  if (!manifestFile?.fullPath) throw new AiAnalysisError("AI_RULE_SET_BINDING_MISMATCH", "Manifest metadata is missing.");
  const manifestText = fs.readFileSync(manifestFile.fullPath, "utf8"); const templateFileName = value(manifestText, "html_report_template_file"); const candidate = path.resolve(root, templateFileName);
  if (!templateFileName || !fs.existsSync(candidate)) throw new AiAnalysisError("AI_HTML_TEMPLATE_MISSING", `Manifest-bound template is missing: ${templateFileName || "<empty>"}`);
  const templatePath = fs.realpathSync.native(candidate); const relative = path.relative(root, templatePath); if (relative.startsWith("..") || path.isAbsolute(relative)) throw new AiAnalysisError("AI_HTML_TEMPLATE_BINDING_MISMATCH", "Template escapes the selected rules directory.");
  const templateText = fs.readFileSync(templatePath, "utf8"); const parsed = parseHtmlReportTemplateV0322(templateText);
  const observed = { ruleSetId: value(manifestText, "rule_set_id"), manifestSchemaVersion: header(manifestText, "Manifest Schema Version"), commonRulesVersion: value(manifestText, "common_rules_version"), catalogVersion: value(manifestText, "skill_catalog_version"), classificationEngineVersion: value(manifestText, "classification_engine_version"), promptVersion: value(manifestText, "prompt_version"), pipelineVersion: value(manifestText, "pipeline_version"), modelDecisionSchemaVersion: value(manifestText, "model_decision_schema_version"), qualityContractVersion: value(manifestText, "quality_contract_version"), evidenceNormalizerVersion: value(manifestText, "evidence_normalizer_version"), issueSnapshotContractVersion: value(manifestText, "issue_snapshot_contract_version"), canonicalResultContractVersion: value(manifestText, "canonical_result_contract_version"), templateFileName, templateId: parsed.contract.templateId, templateVersion: value(manifestText, "html_report_template_version"), templateSchemaVersion: parsed.contract.schemaVersion, rendererVersion: value(manifestText, "html_renderer_version") };
  const mismatches: Array<{ key: string; observed: unknown; expected: unknown }> = Object.entries(observed).filter(([key, observedValue]) => observedValue !== V0322_RULE_BINDING[key as keyof typeof V0322_RULE_BINDING]).map(([key, observedValue]) => ({ key, observed: observedValue, expected: V0322_RULE_BINDING[key as keyof typeof V0322_RULE_BINDING] }));
  const hashes = Object.fromEntries(base.files.map((file) => [file.kind, file.sha256])); for (const [kind, expectedHash] of Object.entries({ manifest: V0322_RULE_HASHES.manifest, catalog: V0322_RULE_HASHES.catalog, rules: V0322_RULE_HASHES.rules })) if (hashes[kind] !== expectedHash) mismatches.push({ key: `${kind}Sha256`, observed: hashes[kind], expected: expectedHash });
  const templateSha256 = sha256(fs.readFileSync(templatePath)); if (templateSha256 !== V0322_RULE_HASHES.template) throw new AiAnalysisError("AI_HTML_TEMPLATE_HASH_MISMATCH", `Template SHA-256 mismatch: ${templateSha256}`);
  if (parsed.contract.input.requiredDecisionContract !== V0322_RULE_BINDING.modelDecisionSchemaVersion || parsed.contract.input.requiredNormalizerVersion !== V0322_RULE_BINDING.evidenceNormalizerVersion || parsed.contract.minimumRendererVersion !== V0322_RULE_BINDING.rendererVersion) mismatches.push({ key: "templateCompatibility", observed: parsed.contract.input, expected: V0322_RULE_BINDING });
  if (mismatches.length) throw new AiAnalysisError("AI_RULE_SET_BINDING_MISMATCH", `v0.3.22 Rule/Template binding mismatch: ${JSON.stringify(mismatches)}`);
  const stat = fs.statSync(templatePath); const htmlReportTemplate = { kind: "html_template" as const, fileName: templateFileName, fullPath: templatePath, version: parsed.contract.templateVersion, templateId: parsed.contract.templateId, schemaVersion: parsed.contract.schemaVersion, minimumRendererVersion: parsed.contract.minimumRendererVersion, sha256: templateSha256, sizeBytes: stat.size, mtimeMs: stat.mtimeMs, status: "verified" as const, manifestBound: true as const, providerVisible: false as const };
  const snapshotId = sha256(JSON.stringify([...base.files.map((file) => ({ kind: file.kind, sha256: file.sha256 })), { kind: "html_template", sha256: templateSha256 }]));
  return { ...base, ...observed, valid: true, snapshotId, htmlReportTemplate } satisfies AiRulesSnapshot;
}
