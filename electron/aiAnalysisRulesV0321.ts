import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AiAnalysisError, type AiRulesSnapshot } from "../shared/aiAnalysisContract.js";
import { loadManifestRulesSnapshot } from "./aiAnalysisRulesV0310.js";

export const V0321_RULE_BINDING = {
  ruleSetId: "JAA-SKILL-RULESET-2026-08-14-DRAFT-03",
  manifestSchemaVersion: "0.3.0",
  commonRulesVersion: "1.2.1",
  catalogVersion: "0.3.1",
  classificationEngineVersion: "JAA-CLASSIFICATION-1.2.1",
  promptVersion: "JAA-CHATGPT-ZH-TW-0.3.21",
  pipelineVersion: "JAA-ANALYSIS-PIPELINE-0.3.21",
  modelDecisionSchemaVersion: "jaa-ai-analysis-decisions-v2",
  templateFileName: "Skill_Analysis_HTML_Report_Template_v1.0.0.md",
  templateId: "JAA-SKILL-ANALYSIS-GOLDEN-HTML",
  templateVersion: "1.0.0",
  templateSchemaVersion: "jaa-html-report-template-v1",
  rendererVersion: "JAA-LOCAL-HTML-RENDERER-1.0.0"
} as const;

export const V0321_RULE_HASHES = {
  manifest: "750284a585e45d50416236cceaafaba5b1bd0f328c086da243a4be9d1b654d3b",
  rules: "ad2bc33e9f519f7b752b130a6c73bed6eeddb928083d8a2e28732b306de2fa07",
  catalog: "dd1b4a366e4f7fdc3232776a7a6ff54070eae00cc41102c195de5b0deb749d7d",
  template: "aa3c7c0d4d919a7923eac3c3f43b2aad4f55ae4d39d4a4d407a63e0bce826ad9"
} as const;

const sha256 = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");

function manifestValue(text: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`\\|\\s*\\\`${escaped}\\\`\\s*\\|\\s*\\\`?([^|\\\`]+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function headerValue(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`^-\\s*${escaped}:\\s*\\\`([^\\\`]+)\\\``, "im"))?.[1]?.trim() ?? "";
}

export type HtmlReportTemplateContract = {
  schemaVersion: string;
  templateId: string;
  templateVersion: string;
  locale: string;
  timeZone: string;
  minimumRendererVersion: string;
  input: { role: string; requiredSchemaName: string; minimumSchemaVersion: string };
  output: { fileNamePattern: string; selfContained: boolean; networkAccess: boolean; defaultTheme: string; printEnabled: boolean };
  sections: string[];
  filters: string[];
  tableColumns: string[];
  recordDetails: string[];
  actions: string[];
  statusLabels: Record<string, string>;
  statusTokens: Record<string, string>;
  security: { escapeAllSourceText: boolean; allowInlineDataScript: boolean; allowArbitraryTemplateScript: boolean; allowRemoteResource: boolean; contentSecurityPolicy: string };
};

export function parseHtmlReportTemplate(text: string) {
  const begin = "<!-- BEGIN JAA_HTML_REPORT_TEMPLATE_JSON -->";
  const end = "<!-- END JAA_HTML_REPORT_TEMPLATE_JSON -->";
  const beginCount = text.split(begin).length - 1;
  const endCount = text.split(end).length - 1;
  const start = text.indexOf(begin);
  const finish = text.indexOf(end);
  if (beginCount !== 1 || endCount !== 1 || start < 0 || finish <= start) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", `Template markers must occur exactly once and in order; begin=${beginCount} end=${endCount}.`);
  const machineBlock = text.slice(start + begin.length, finish);
  const fences = [...machineBlock.matchAll(/```json\s*([\s\S]*?)\s*```/gi)];
  if (fences.length !== 1) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", `Template machine block must contain exactly one fenced JSON object; observed=${fences.length}.`);
  let contract: HtmlReportTemplateContract;
  try { contract = JSON.parse(fences[0][1]) as HtmlReportTemplateContract; }
  catch (error) { throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", `Template JSON is invalid: ${error instanceof Error ? error.message : String(error)}`); }
  const requiredArrays = ["sections", "filters", "tableColumns", "recordDetails", "actions"] as const;
  if (!contract || typeof contract !== "object" || requiredArrays.some((key) => !Array.isArray(contract[key])) || !contract.input || !contract.output || !contract.security) throw new AiAnalysisError("AI_HTML_TEMPLATE_INVALID", "Template JSON does not satisfy jaa-html-report-template-v1.");
  return { contract, machineBlock: fences[0][1] };
}

export function loadV0321RulesSnapshot(directory: string, allowedRoots: string[]) {
  const base = loadManifestRulesSnapshot(directory, allowedRoots);
  const root = fs.realpathSync.native(path.resolve(directory));
  const manifestFile = base.files.find((file) => file.kind === "manifest");
  if (!manifestFile?.fullPath) throw new AiAnalysisError("AI_RULE_SET_BINDING_MISMATCH", "Manifest file metadata is missing.");
  const manifestText = fs.readFileSync(manifestFile.fullPath, "utf8");
  const templateFileName = manifestValue(manifestText, "html_report_template_file");
  const unresolvedTemplatePath = path.resolve(root, templateFileName);
  if (!templateFileName || !fs.existsSync(unresolvedTemplatePath)) throw new AiAnalysisError("AI_HTML_TEMPLATE_MISSING", `Manifest-bound HTML template is missing: ${templateFileName || "<empty binding>"}`);
  const templatePath = fs.realpathSync.native(unresolvedTemplatePath);
  const relative = path.relative(root, templatePath);
  if (!templateFileName || relative.startsWith("..") || path.isAbsolute(relative)) throw new AiAnalysisError("AI_HTML_TEMPLATE_BINDING_MISMATCH", "Manifest-bound HTML template escapes the selected rules directory.");
  const templateText = fs.readFileSync(templatePath, "utf8");
  const parsed = parseHtmlReportTemplate(templateText);
  const manifestSchemaVersion = headerValue(manifestText, "Manifest Schema Version");
  const observed = {
    ruleSetId: manifestValue(manifestText, "rule_set_id"), manifestSchemaVersion,
    commonRulesVersion: manifestValue(manifestText, "common_rules_version"), catalogVersion: manifestValue(manifestText, "skill_catalog_version"),
    classificationEngineVersion: manifestValue(manifestText, "classification_engine_version"), promptVersion: manifestValue(manifestText, "prompt_version"),
    pipelineVersion: manifestValue(manifestText, "pipeline_version"), modelDecisionSchemaVersion: manifestValue(manifestText, "model_decision_schema_version"),
    templateFileName, templateId: manifestValue(manifestText, "html_report_template_id"), templateVersion: manifestValue(manifestText, "report_template_version"),
    rendererVersion: manifestValue(manifestText, "html_renderer_version")
  };
  const expected = { ...V0321_RULE_BINDING };
  const mismatches: Array<{ key: string; expected: unknown; observed: unknown }> = Object.entries(observed).filter(([key, value]) => value !== expected[key as keyof typeof expected]).map(([key, value]) => ({ key, expected: expected[key as keyof typeof expected], observed: value || null }));
  const hashes = Object.fromEntries(base.files.map((file) => [file.kind, file.sha256]));
  for (const [key, expectedHash] of Object.entries({ manifest: V0321_RULE_HASHES.manifest, catalog: V0321_RULE_HASHES.catalog, rules: V0321_RULE_HASHES.rules })) if (hashes[key] !== expectedHash) mismatches.push({ key: `${key}Sha256`, expected: expectedHash, observed: hashes[key] ?? null });
  const templateSha256 = sha256(templateText);
  if (templateSha256 !== V0321_RULE_HASHES.template) throw new AiAnalysisError("AI_HTML_TEMPLATE_HASH_MISMATCH", `Manifest-bound HTML template SHA-256 mismatch: expected=${V0321_RULE_HASHES.template} observed=${templateSha256}`);
  if (parsed.contract.schemaVersion !== V0321_RULE_BINDING.templateSchemaVersion || parsed.contract.templateId !== observed.templateId || parsed.contract.templateVersion !== observed.templateVersion || parsed.contract.minimumRendererVersion !== observed.rendererVersion) mismatches.push({ key: "templateMachineContract", expected: V0321_RULE_BINDING, observed: parsed.contract });
  if (mismatches.length) throw new AiAnalysisError("AI_RULE_SET_BINDING_MISMATCH", `v0.3.21 Rule/Template binding mismatch: ${JSON.stringify(mismatches)}`);
  const stat = fs.statSync(templatePath);
  const htmlReportTemplate = { kind: "html_template" as const, fileName: templateFileName, fullPath: templatePath, version: parsed.contract.templateVersion, templateId: parsed.contract.templateId, schemaVersion: parsed.contract.schemaVersion, minimumRendererVersion: parsed.contract.minimumRendererVersion, sha256: templateSha256, sizeBytes: stat.size, mtimeMs: stat.mtimeMs, status: "verified" as const, manifestBound: true as const, providerVisible: false as const };
  const snapshotId = sha256(JSON.stringify([...base.files.map((file) => ({ kind: file.kind, sha256: file.sha256 })), { kind: htmlReportTemplate.kind, sha256: htmlReportTemplate.sha256 }]));
  return { ...base, ...observed, valid: true, snapshotId, htmlReportTemplate } satisfies AiRulesSnapshot;
}
