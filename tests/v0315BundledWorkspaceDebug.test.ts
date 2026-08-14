import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeAppRoot } from "../electron/appPaths.js";
import { collectDebugFolderSources } from "../electron/debugFolderCollector.js";
import { createPersistentDiagnostics } from "../electron/persistentDiagnostics.js";
import { prepareSingleRunOutputSchema, validateValueAgainstOutputSchema } from "../electron/aiAnalysisOutputSchemaV0313.js";
import { buildRequestPackage } from "../electron/aiAnalysisRequestPackageV0314.js";
import { resolveChatGptRuntime } from "../electron/chatGptRuntimeResolver.js";

const sha256 = (value: Buffer | string) => crypto.createHash("sha256").update(value).digest("hex");
const root = fs.mkdtempSync(path.join(process.cwd(), "test-artifacts", "v0315-"));
initializeAppRoot(root);
try {
  const generatedManifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "dist-electron", "codex-runtime-manifest.json"), "utf8"));
  assert.equal(generatedManifest.runtimeMode, "BUNDLED_ONLY");
  assert.equal(generatedManifest.version, "0.147.0");
  assert.equal(generatedManifest.systemPathDiscovery, false);
  const runtimeRoot = path.join(root, "runtime"); const runtimeBin = path.join(runtimeRoot, "bin"); fs.mkdirSync(runtimeBin, { recursive: true });
  const realBinary = path.join(process.cwd(), "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");
  fs.linkSync(realBinary, path.join(runtimeBin, "codex.exe"));
  fs.writeFileSync(path.join(runtimeRoot, "codex-runtime-manifest.json"), JSON.stringify(generatedManifest), "utf8");
  const resolved = resolveChatGptRuntime(runtimeRoot); assert.equal(resolved.integrity, "verified"); assert.equal(resolved.sha256, generatedManifest.sha256);
  const mismatchRoot = path.join(root, "mismatch"); fs.mkdirSync(path.join(mismatchRoot, "bin"), { recursive: true }); fs.linkSync(realBinary, path.join(mismatchRoot, "bin", "codex.exe"));
  const mismatchManifest = { ...generatedManifest, sha256: "0".repeat(64) }; fs.writeFileSync(path.join(mismatchRoot, "codex-runtime-manifest.json"), JSON.stringify(mismatchManifest));
  assert.throws(() => resolveChatGptRuntime(mismatchRoot), /CODEX_BUNDLED_RUNTIME_HASH_MISMATCH/);
  const versionRoot = path.join(root, "version"); fs.mkdirSync(path.join(versionRoot, "bin"), { recursive: true }); fs.linkSync(realBinary, path.join(versionRoot, "bin", "codex.exe"));
  fs.writeFileSync(path.join(versionRoot, "codex-runtime-manifest.json"), JSON.stringify({ ...generatedManifest, version: "0.0.0" }));
  assert.throws(() => resolveChatGptRuntime(versionRoot), /CODEX_BUNDLED_RUNTIME_VERSION_MISMATCH/);
  assert.throws(() => resolveChatGptRuntime(path.join(root, "missing")), /CODEX_BUNDLED_RUNTIME_MISSING/);

  const source = path.join(root, "pending.json"); const rulesDir = path.join(root, "rules"); fs.mkdirSync(rulesDir);
  fs.writeFileSync(source, JSON.stringify({ records: [{ reference: { sourceRecordStableId: "stable-1", evidenceId: "evidence-1" } }] }));
  const ruleFiles = { manifest: path.join(rulesDir, "manifest.md"), catalog: path.join(rulesDir, "catalog.md"), rules: path.join(rulesDir, "rules.md") };
  for (const [kind, file] of Object.entries(ruleFiles)) fs.writeFileSync(file, `# ${kind}\n`);
  const metadata = (kind: "manifest" | "catalog" | "rules", file: string) => ({ kind, fileName: path.basename(file), fullPath: file, version: "1", sha256: sha256(fs.readFileSync(file)), sizeBytes: fs.statSync(file).size, mtimeMs: fs.statSync(file).mtimeMs, status: "verified" as const });
  const rules: any = { files: [metadata("manifest", ruleFiles.manifest), metadata("catalog", ruleFiles.catalog), metadata("rules", ruleFiles.rules)], catalog: [{ id: "SKILL_1" }] };
  const dataset: any = { sourceFilePath: source, sourceFileSha256: sha256(fs.readFileSync(source)), eventCount: 1, diffs: [{ sourceDiffId: "stable-1" }] };
  const runDirectory = path.join(root, "run"); fs.mkdirSync(runDirectory);
  const schema = prepareSingleRunOutputSchema(1); const request = buildRequestPackage({ runId: "analysis_test", runDirectory, dataset, rules, selectedRecordCount: 1 });
  assert.deepEqual(fs.readdirSync(request.workspace).sort(), ["common-rules.md", "pending-analysis.json", "rule-set-manifest.md", "skill-catalog.md"]);
  assert.equal(request.requestPackage.deliveryMode, "LOCAL_FILE_WORKSPACE"); assert.equal(request.requestPackage.inlineFileContentCount, 0);
  assert.equal(request.prompt.includes(fs.readFileSync(source, "utf8")), false); assert.equal(request.prompt.includes("BEGIN_FILE"), false);
  assert.equal((schema.schema.properties as any).records.minItems, 1); assert.equal((schema.schema.properties as any).records.maxItems, 1);
  assert.equal(validateValueAgainstOutputSchema({ schemaVersion: "ai-analysis-output-v3", records: [] }, schema.schema as Record<string, unknown>).isValid, false);

  const debugSource = path.join(root, "debug-source"); const debugOutput = path.join(root, "debug-output"); fs.mkdirSync(debugSource); fs.writeFileSync(path.join(debugSource, "evidence.json"), "{\"ok\":true}");
  const copied = collectDebugFolderSources(debugOutput, [{ sourcePath: debugSource, relativePath: "canonical" }]);
  assert.equal(copied.failed.length, 0); assert.equal(copied.successful[0].hashMatch, true); assert.equal(copied.successful[0].sourceSha256, copied.successful[0].destinationSha256);
  const diagnostics = createPersistentDiagnostics({ logsDir: path.join(root, "logs"), sessionId: "session", build: { version: "0.3.15", buildTime: "test", gitCommit: "test", gitBranch: "test" }, appRoot: root, sanitizeText: (value) => value });
  diagnostics.write("main", "undefined_error", { error: undefined }); diagnostics.close();
  assert.match(fs.readFileSync(diagnostics.fileFor("main"), "utf8"), /\[unavailable\]/);

  const ipc = fs.readFileSync(path.join(process.cwd(), "electron", "aiAnalysisIpc.ts"), "utf8");
  assert.equal(ipc.includes('deliveryMode: "INLINE_EXACT_CONTENT"'), false); assert.equal(ipc.includes("createFailedStaging"), false); assert.equal(ipc.includes('path.join(getAppDataDir(), "ai-analysis", "staging"'), false);
  assert.match(ipc, /AI_INPUT_RECEIPT_INCOMPLETE/); assert.match(ipc, /completedBatches = 0/);
  const main = fs.readFileSync(path.join(process.cwd(), "electron", "main.ts"), "utf8");
  assert.match(main, /debug-completeness-manifest\.json/); assert.match(main, /ai-analysis\/runs/);
  console.log("v0.3.15 bundled runtime, local workspace, count schema, canonical debug, and error serializer tests passed.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
