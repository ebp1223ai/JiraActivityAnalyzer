import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AiAnalysisError, type AiCatalogEntry, type AiRulesSnapshot } from "../shared/aiAnalysisContract.js";

type CatalogRecord = AiCatalogEntry & { sourcePath: string; lineNumber: number; recordIndex: number; rawId: string };

function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalExistingPath(value: string) {
  return fs.realpathSync.native(path.resolve(value));
}

function pathIdentity(value: string) {
  return canonicalExistingPath(value).replaceAll("/", "\\").toLocaleLowerCase("en-US");
}

function isInside(child: string, parent: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function manifestValue(manifest: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const table = manifest.match(new RegExp(`\\|\\s*\\\`${escaped}\\\`\\s*\\|\\s*\\\`?([^|\\\`]+)\\\`?\\s*\\|`, "i"));
  const list = manifest.match(new RegExp(`[-*]\\s*${escaped.replaceAll("_", "[ _-]?")}\\s*[:：]\\s*\\\`?([^\\\`\\r\\n]+)`, "i"));
  return (table?.[1] ?? list?.[1] ?? "").trim();
}

function metadata(kind: "manifest" | "catalog" | "rules", filePath: string, version: string) {
  const text = fs.readFileSync(filePath, "utf8");
  const stat = fs.statSync(filePath);
  return {
    kind,
    fileName: path.basename(filePath),
    fullPath: filePath,
    version,
    sha256: sha256(text),
    sizeBytes: stat.size,
    mtimeMs: stat.mtimeMs,
    status: "verified" as const
  };
}

function parseCatalog(catalogPath: string, text: string) {
  const records: CatalogRecord[] = [];
  let recordIndex = 0;
  let idColumn = -1;
  let nameColumn = -1;
  let groupColumn = -1;
  let detailColumn = -1;
  let inSkillTable = false;
  text.split(/\r?\n/).forEach((line, lineIndex) => {
    if (!line.trim().startsWith("|")) {
      inSkillTable = false;
      idColumn = -1;
      nameColumn = -1;
      groupColumn = -1;
      detailColumn = -1;
      return;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const headerIndex = cells.findIndex((cell) => /^skill[ _-]?id$/i.test(cell));
    if (headerIndex >= 0) {
      idColumn = headerIndex;
      nameColumn = cells.findIndex((cell) => /^skill[ _-]?name$/i.test(cell));
      groupColumn = cells.findIndex((cell) => /^group$/i.test(cell));
      detailColumn = cells.findIndex((cell) => /^(detail|detail[ _-]?description)$/i.test(cell));
      inSkillTable = true;
      return;
    }
    if (!inSkillTable || idColumn < 0 || cells.every((cell) => /^[-: ]+$/.test(cell))) return;
    const rawId = cells[idColumn] ?? "";
    if (!/^[A-Z][A-Z0-9_-]{2,}$/.test(rawId)) return;
    recordIndex += 1;
    records.push({
      id: rawId.trim().normalize("NFC"),
      rawId,
      name: cells[nameColumn >= 0 ? nameColumn : idColumn + 1] || rawId,
      group: groupColumn >= 0 && cells[groupColumn] ? cells[groupColumn] : rawId.includes("_") ? rawId.split("_")[0] : "General",
      catalogStatus: "review-draft",
      detailDescription: detailColumn >= 0 ? cells[detailColumn] || null : null,
      sourcePath: catalogPath,
      lineNumber: lineIndex + 1,
      recordIndex
    });
  });
  return records;
}

function duplicateGroups(records: CatalogRecord[]) {
  const modes = [
    { comparison: "exact" as const, key: (value: string) => value },
    { comparison: "trimmed" as const, key: (value: string) => value.trim() },
    { comparison: "unicode_normalized" as const, key: (value: string) => value.trim().normalize("NFKC") },
    { comparison: "case_insensitive" as const, key: (value: string) => value.trim().normalize("NFKC").toLocaleLowerCase("en-US") }
  ];
  const output: NonNullable<AiRulesSnapshot["duplicateDetails"]> = [];
  const seen = new Set<string>();
  for (const mode of modes) {
    const grouped = new Map<string, CatalogRecord[]>();
    for (const record of records) {
      const key = mode.key(record.rawId);
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    }
    for (const [normalizedId, values] of grouped) {
      if (values.length < 2) continue;
      const identity = `${mode.comparison}:${normalizedId}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      output.push({
        skillId: values[0].id,
        normalizedId,
        comparison: mode.comparison,
        severity: mode.comparison === "case_insensitive" ? "warning" : "error",
        definitions: values.map((value) => ({
          fullPath: value.sourcePath,
          lineNumber: value.lineNumber,
          recordIndex: value.recordIndex,
          loadSource: "manifest_reference" as const
        }))
      });
    }
  }
  return output;
}

export function loadManifestRulesSnapshot(directory: string, allowedRoots: string[]): AiRulesSnapshot {
  const root = canonicalExistingPath(directory);
  const approved = allowedRoots.map(canonicalExistingPath);
  if (!approved.some((allowed) => isInside(root, allowed))) {
    throw new AiAnalysisError("ANALYSIS_RULES_INVALID", "Rules folder is outside the approved roots.");
  }

  const manifestCandidates = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /manifest.*\.md$/i.test(entry.name))
    .map((entry) => canonicalExistingPath(path.join(root, entry.name)));
  if (manifestCandidates.length !== 1) {
    throw new AiAnalysisError("ANALYSIS_RULES_INVALID", `Exactly one canonical Manifest is required; found ${manifestCandidates.length}.`);
  }

  const manifestPath = manifestCandidates[0];
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const catalogReference = manifestValue(manifestText, "skill_catalog_file");
  const rulesReference = manifestValue(manifestText, "common_rules_file");
  if (!catalogReference || !rulesReference) {
    throw new AiAnalysisError("ANALYSIS_RULES_INVALID", "Manifest must bind skill_catalog_file and common_rules_file.");
  }

  const referenced = [manifestPath, path.resolve(root, catalogReference), path.resolve(root, rulesReference)].map(canonicalExistingPath);
  if (referenced.some((filePath) => !isInside(filePath, root))) {
    throw new AiAnalysisError("ANALYSIS_RULES_INVALID", "A Manifest reference escapes the selected rules folder.");
  }
  if (new Set(referenced.map(pathIdentity)).size !== referenced.length) {
    throw new AiAnalysisError("ANALYSIS_RULES_INVALID", "Manifest references must resolve to three distinct canonical files.");
  }

  const catalogPath = referenced[1];
  const rulesPath = referenced[2];
  const catalogText = fs.readFileSync(catalogPath, "utf8");
  const rulesText = fs.readFileSync(rulesPath, "utf8");
  const records = parseCatalog(catalogPath, catalogText);
  if (!records.length) throw new AiAnalysisError("ANALYSIS_RULES_INVALID", "No catalog records could be parsed from the Manifest-bound Catalog.");
  const duplicateDetails = duplicateGroups(records);
  const blockingDuplicates = duplicateDetails.filter((detail) => detail.severity === "error");
  const catalog = records.map(({ sourcePath: _sourcePath, lineNumber: _lineNumber, recordIndex: _recordIndex, rawId: _rawId, ...record }) => record);
  const now = new Date().toISOString();
  const manifestSchemaVersion = manifestValue(manifestText, "manifest_schema_version") || "unknown";
  const ruleSetId = manifestValue(manifestText, "rule_set_id") || sha256(manifestText).slice(0, 16);
  const catalogVersion = manifestValue(manifestText, "skill_catalog_version") || "unknown";
  const commonRulesVersion = manifestValue(manifestText, "common_rules_version") || "unknown";
  const classificationEngineVersion = manifestValue(manifestText, "classification_engine_version") || "offline-rule-v1";
  const promptVersion = manifestValue(manifestText, "prompt_version") || "unknown";
  const pipelineVersion = manifestValue(manifestText, "pipeline_version") || "unknown";
  const modelDecisionSchemaVersion = manifestValue(manifestText, "model_decision_schema_version") || "unknown";
  const files = [
    metadata("manifest", manifestPath, manifestSchemaVersion),
    metadata("catalog", catalogPath, catalogVersion),
    metadata("rules", rulesPath, commonRulesVersion)
  ];
  const snapshotId = sha256(JSON.stringify(files.map((file) => ({ path: pathIdentity(file.fullPath), sha256: file.sha256 }))));

  return {
    valid: blockingDuplicates.length === 0,
    rulesDirectoryLabel: path.basename(root),
    rulesDirectoryPath: root,
    snapshotId,
    validatedAt: now,
    ruleSetId,
    manifestSchemaVersion,
    catalogVersion,
    commonRulesVersion,
    classificationEngineVersion, promptVersion, pipelineVersion, modelDecisionSchemaVersion,
    parserVersion: "ai-rules-parser-v1",
    files,
    catalogCount: catalog.length,
    uniqueSkillIdCount: new Set(catalog.map((entry) => entry.id)).size,
    duplicateSkillIdCount: new Set(blockingDuplicates.map((detail) => detail.normalizedId.normalize("NFKC").toLocaleLowerCase("en-US"))).size,
    duplicateDetails,
    catalog,
    commonRulesNormalized: rulesText.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^#{2,4}\s|^[-*]\s/.test(line)).slice(0, 500),
    errors: blockingDuplicates.length
      ? ["ANALYSIS_RULES_DUPLICATE_SKILL_ID: Duplicate catalog Skill IDs are not allowed."]
      : [],
    warnings: duplicateDetails.filter((detail) => detail.severity === "warning").map((detail) => `Confusable Skill ID: ${detail.skillId}`)
  };
}

export function assertV0320RuleSetBinding(snapshot: AiRulesSnapshot) {
  const expected = { ruleSetId: "JAA-SKILL-RULESET-2026-08-14-DRAFT-02", manifestSchemaVersion: "0.2.0", commonRulesVersion: "1.2.0", catalogVersion: "0.3.1", classificationEngineVersion: "JAA-CLASSIFICATION-1.2.0", promptVersion: "JAA-CHATGPT-ZH-TW-0.3.20", pipelineVersion: "JAA-ANALYSIS-PIPELINE-0.3.20", modelDecisionSchemaVersion: "jaa-ai-analysis-decisions-v2" } as const;
  const mismatches = Object.entries(expected).filter(([key, value]) => snapshot[key as keyof AiRulesSnapshot] !== value).map(([key, value]) => ({ key, expected: value, observed: snapshot[key as keyof AiRulesSnapshot] ?? null }));
  if (mismatches.length) throw new AiAnalysisError("AI_RULE_SET_BINDING_MISMATCH", `v0.3.20 Rule Set binding mismatch: ${JSON.stringify(mismatches)}`);
  return snapshot;
}
