import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { atomicExport, loadRulesSnapshot } from "../electron/aiAnalysisCore.js";

function fixture(options: { duplicate?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0310-rules-"));
  const manifest = `# Rule Set Manifest
- Manifest Schema Version: \`0.1.0\`
- Rule Set ID: \`RULESET-TEST\`
| Binding | Value | Status |
|---|---|---|
| \`common_rules_version\` | \`1.1.0\` | approved |
| \`common_rules_file\` | \`Common_Rules.md\` | approved |
| \`skill_catalog_version\` | \`0.3.0\` | approved |
| \`skill_catalog_file\` | \`Skill_Catalog.md\` | approved |
`;
  const duplicate = options.duplicate ? "| TEST_001 | Duplicate |\n" : "";
  const catalog = `# Catalog
- Catalog Version: \`0.3.0\`
| Skill ID | Skill Name |
|---|---|
| TEST_001 | First Skill |
| TEST_002 | Second Skill |
${duplicate}`;
  fs.writeFileSync(path.join(root, "Rule_Set_Manifest.md"), manifest, "utf8");
  fs.writeFileSync(path.join(root, "Skill_Catalog.md"), catalog, "utf8");
  fs.writeFileSync(path.join(root, "Common_Rules.md"), "# Rules\n- Rules Version: `1.1.0`\n- Evidence must be attributable.\n", "utf8");
  return root;
}

test("Manifest is the sole source of canonical rule files", () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, "Ignored_Skill_Catalog_Copy.md"), "| Skill ID | Skill Name |\n|---|---|\n| BAD_001 | Must not load |", "utf8");
  const snapshot = loadRulesSnapshot(root, [root]);
  assert.equal(snapshot.valid, true);
  assert.equal(snapshot.catalogCount, 2);
  assert.equal(snapshot.uniqueSkillIdCount, 2);
  assert.equal(snapshot.duplicateSkillIdCount, 0);
  assert.equal(snapshot.files.length, 3);
  assert.equal(new Set(snapshot.files.map((file) => file.fullPath?.toLocaleLowerCase())).size, 3);
  assert.ok(snapshot.files.every((file) => path.isAbsolute(file.fullPath ?? "")));
  fs.rmSync(root, { recursive: true, force: true });
});

test("duplicate Skill IDs include source path and location", () => {
  const root = fixture({ duplicate: true });
  const snapshot = loadRulesSnapshot(root, [root]);
  assert.equal(snapshot.valid, false);
  assert.equal(snapshot.duplicateSkillIdCount, 1);
  const exact = snapshot.duplicateDetails?.find((detail) => detail.comparison === "exact");
  assert.equal(exact?.skillId, "TEST_001");
  assert.equal(exact?.definitions.length, 2);
  assert.ok(exact?.definitions.every((definition) => path.isAbsolute(definition.fullPath) && definition.lineNumber > 0 && definition.recordIndex > 0));
  fs.rmSync(root, { recursive: true, force: true });
});

test("atomic export is durable and digest-verifiable", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0310-export-"));
  const destination = path.join(root, "analysis.json");
  const result = atomicExport(destination, "{\"status\":\"completed\"}\n");
  assert.equal(result.filePath, destination);
  assert.equal(result.sizeBytes, fs.statSync(destination).size);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.readdirSync(root).filter((name) => name.endsWith(".tmp")).length, 0);
  fs.rmSync(root, { recursive: true, force: true });
});
