import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectDebugFolderSources } from "./debugFolderCollector.js";
import { createPersistentDiagnostics } from "./persistentDiagnostics.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-persistent-diagnostics-"));
const logsDir = path.join(root, "logs");
const sanitizeText = (value: string) => value
  .replace(/(Authorization\s*:\s*)[^\s"]+/gi, "$1[masked]")
  .replace(/(token\s*:\s*)[^\s"]+/gi, "$1[masked]");
const build = { version: "0.2.33", buildTime: "test", gitCommit: "test", gitBranch: "test" };

try {
  const sessionA = createPersistentDiagnostics({ logsDir, sessionId: "session-a", appRoot: root, build, sanitizeText });
  const circular: Record<string, unknown> = { token: "secret" };
  circular.self = circular;
  sessionA.write("renderer", "window.unhandledrejection", { reason: circular, Authorization: "Bearer secret" });
  sessionA.write("transitions", "FULL_FETCH_QUEUE_TRANSITION_REQUESTED", { selectedCount: 51 });
  sessionA.close("crashed");

  const sessionB = createPersistentDiagnostics({ logsDir, sessionId: "session-b", appRoot: root, build, sanitizeText });
  assert.equal(sessionB.previousSessionId, "session-a");
  sessionB.write("main", "did-finish-load", {});
  assert.equal(fs.existsSync(path.join(logsDir, "sessions", "session-a", "renderer.ndjson")), true);
  assert.equal(fs.existsSync(path.join(logsDir, "sessions", "session-a", "transitions.ndjson")), true);
  assert.equal(fs.existsSync(path.join(logsDir, "sessions", "session-b", "main.ndjson")), true);
  const previousRenderer = fs.readFileSync(path.join(logsDir, "sessions", "session-a", "renderer.ndjson"), "utf8");
  assert.equal(previousRenderer.includes("secret"), false);
  assert.equal(previousRenderer.includes("[circular]"), true);
  const latest = JSON.parse(fs.readFileSync(path.join(logsDir, "latest-session.json"), "utf8"));
  assert.equal(latest.currentSessionId, "session-b");
  assert.equal(latest.previousSessionId, "session-a");
  const debugFolder = path.join(root, "exports", "debug-folders", "cross-session-test");
  const collected = collectDebugFolderSources(debugFolder, [
    { sourcePath: path.join(logsDir, "sessions", "session-a"), relativePath: "sessions/previous" },
    { sourcePath: path.join(logsDir, "sessions", "session-b"), relativePath: "sessions/current" }
  ]);
  assert.equal(collected.failed.length, 0);
  assert.equal(fs.existsSync(path.join(debugFolder, "sessions", "previous", "renderer.ndjson")), true);
  assert.equal(fs.existsSync(path.join(debugFolder, "sessions", "current", "main.ndjson")), true);
  const failingWriter = createPersistentDiagnostics({ logsDir: path.join(root, "writer-failure-logs"), sessionId: "writer-failure", appRoot: root, build, sanitizeText: () => { throw new Error("simulated sanitizer failure"); } });
  assert.doesNotThrow(() => failingWriter.write("renderer", "window.error", { message: "test" }));
  sessionB.close();
  console.log("Persistent diagnostics tests passed: cross-session retention, circular rejection safety, masking and session pointers.");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
