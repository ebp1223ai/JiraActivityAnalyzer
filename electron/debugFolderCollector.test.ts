import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectDebugFolderSources, describeFullFetchFailureEvidence, listDebugFolderFiles, summarizeDebugEvidence } from "./debugFolderCollector.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-debug-folder-test-"));
const source = path.join(root, "source");
const output = path.join(root, "output");
fs.mkdirSync(path.join(source, "nested"), { recursive: true });
fs.writeFileSync(path.join(source, "root.txt"), "source-content-unchanged", "utf8");
fs.writeFileSync(path.join(source, "nested", "payload.json"), "{\"Token\":\"original-source-value\"}\n", "utf8");

try {
  const result = collectDebugFolderSources(output, [
    { sourcePath: source, relativePath: "full-fetch" },
    { sourcePath: path.join(root, "missing.log"), relativePath: "logs/missing.log" }
  ]);
  assert.equal(result.successful.length, 2);
  assert.equal(result.failed.length, 1);
  assert.equal(result.successful.every((entry) => entry.status === "copied"), true);
  assert.equal(result.failed[0]?.status, "copy_failed");
  assert.equal(fs.readFileSync(path.join(output, "full-fetch", "root.txt"), "utf8"), "source-content-unchanged");
  assert.equal(fs.readFileSync(path.join(output, "full-fetch", "nested", "payload.json"), "utf8"), "{\"Token\":\"original-source-value\"}\n");
  const files = listDebugFolderFiles(output);
  assert.deepEqual(files.map((item) => item.relativePath).sort(), ["full-fetch/nested/payload.json", "full-fetch/root.txt"]);
  assert.equal(files.some((item) => /\.(zip|7z|tar|gz)$/i.test(item.relativePath)), false);
  assert.equal(fs.existsSync(path.join(output, "full-fetch", "root.txt")), true, "a failed source must not block other copies");
  assert.deepEqual(summarizeDebugEvidence([
    { id: "copied", status: "copied", reason: "" },
    { id: "not-observed", status: "not_observed", reason: "" },
    { id: "not-run", status: "not_run", reason: "" },
    { id: "source-missing", status: "source_missing", reason: "" },
    { id: "copy-failed", status: "copy_failed", reason: "" }
  ], 2), {
    filesCopied: 1,
    sourcesNotObserved: 1,
    featuresNotRun: 1,
    sourcesMissing: 1,
    copyFailures: 1,
    placeholderFilesCreated: 2
  });
  assert.deepEqual(describeFullFetchFailureEvidence(false, 0), { runStatus: "not_run", failedCount: null, hasFailedIssuesFile: false });
  assert.deepEqual(describeFullFetchFailureEvidence(true, 0), { runStatus: "executed", failedCount: 0, hasFailedIssuesFile: true });
  console.log("Debug Folder collector tests passed: 2 copied, 1 expected failure, 0 archives.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
