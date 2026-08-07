import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  aggregateSummaries,
  assertUniqueOutputRoot,
  parseJsonlFile,
  sha256File,
  validateHandoff
} from "../parse-codex-jsonl.mjs";

const root = new URL("../fixtures/", import.meta.url);
const fixture = (name) => new URL(name, root);

test("completed fixture parses required and optional usage", async () => {
  const summary = await parseJsonlFile(fixture("completed.jsonl"));
  assert.equal(summary.status, "AVAILABLE");
  assert.deepEqual(
    [summary.usage.inputTokens, summary.usage.cachedInputTokens, summary.usage.cacheWriteInputTokens, summary.usage.outputTokens, summary.usage.reasoningOutputTokens],
    [100, 40, 5, 30, 10]
  );
});

test("cached and reasoning tokens are not double counted", async () => {
  const summary = await parseJsonlFile(fixture("completed.jsonl"));
  assert.equal(summary.usage.totalTokens, 130);
});

test("total falls back to input plus output", async () => {
  const dir = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  const path = join(dir, "fallback.jsonl");
  writeFileSync(path, '{"type":"turn.started"}\n{"type":"turn.completed","usage":{"input_tokens":7,"cached_input_tokens":3,"output_tokens":5,"reasoning_output_tokens":2}}\n');
  const summary = await parseJsonlFile(path);
  assert.equal(summary.usage.totalTokens, 12);
  rmSync(dir, { recursive: true });
});

test("multi-turn summaries aggregate by task", async () => {
  const one = await parseJsonlFile(fixture("completed.jsonl"));
  const aggregate = aggregateSummaries([one, one]);
  assert.equal(aggregate.status, "AVAILABLE");
  assert.equal(aggregate.usage.totalTokens, 260);
  assert.equal(aggregate.usage.cachedInputTokens, 80);
});

test("missing usage is partial and never replaced with zero", async () => {
  const summary = await parseJsonlFile(fixture("missing-usage.jsonl"));
  assert.equal(summary.status, "PARTIAL");
  assert.equal(summary.usage, null);
  assert.equal(summary.parserErrors[0].code, "MISSING_USAGE");
});

test("failed turn remains failed", async () => {
  const summary = await parseJsonlFile(fixture("failed-turn.jsonl"));
  assert.equal(summary.status, "FAILED");
  assert.equal(summary.runtimeErrors[0].code, "TURN_FAILED");
});

test("malformed line reports line number", async () => {
  const summary = await parseJsonlFile(fixture("malformed-line.jsonl"));
  assert.equal(summary.status, "FAILED");
  assert.equal(summary.parserErrors[0].lineNumber, 3);
});

test("unknown future event is counted without crashing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  const path = join(dir, "unknown.jsonl");
  writeFileSync(path, '{"type":"future.event"}\n{"type":"turn.started"}\n{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1,"reasoning_output_tokens":0}}\n');
  const summary = await parseJsonlFile(path);
  assert.equal(summary.unknownEventCounts["future.event"], 1);
  rmSync(dir, { recursive: true });
});

test("commands, file changes, MCP, web and plan are separated", async () => {
  const summary = await parseJsonlFile(fixture("completed.jsonl"));
  assert.equal(summary.operations.commands.length, 1);
  assert.equal(summary.operations.fileChanges.length, 1);
  assert.equal(summary.operations.mcp.length, 1);
  assert.equal(summary.operations.web.length, 1);
  assert.equal(summary.operations.plan.length, 1);
  assert.deepEqual(summary.pathEvidence.telemetryObservedPaths, ["src/example.ts"]);
});

test("SHA-256 is reproducible", () => {
  assert.equal(sha256File(fixture("completed.jsonl")), sha256File(fixture("completed.jsonl")));
});

test("output collision fails closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "telemetry-collision-"));
  assert.throws(() => assertUniqueOutputRoot(dir), /OUTPUT_ROOT_COLLISION/);
  rmSync(dir, { recursive: true });
});

test("phase handoff gate accepts exact phase and thread", () => {
  const handoff = {
    phaseId: "implementation", status: "completed", threadId: "thread-1", branch: "branch", head: "1234567",
    startedAt: "start", endedAt: "end", inspectedPaths: ["src/a.ts"], modifiedPaths: ["src/a.ts"], commands: [], retries: [], nextPhaseReady: true, blockers: []
  };
  assert.equal(validateHandoff(handoff, "implementation", "thread-1").valid, true);
  assert.equal(validateHandoff(handoff, "other", "thread-1").valid, false);
});

test("phase handoff gate rejects thread mismatch and empty inspection", () => {
  const result = validateHandoff({ phaseId: "p", status: "completed", threadId: "wrong", branch: "b", head: "1234567", startedAt: "s", endedAt: "e", inspectedPaths: [], modifiedPaths: [], commands: [], retries: [], nextPhaseReady: true, blockers: [] }, "p", "expected");
  assert.ok(result.errors.includes("THREAD_MISMATCH"));
  assert.ok(result.errors.includes("EMPTY_INSPECTION_SCOPE"));
});

test("parser output never contains synthetic secret value", async () => {
  const summary = await parseJsonlFile(fixture("malformed-line.jsonl"));
  assert.equal(JSON.stringify(summary).includes("synthetic-secret-value"), false);
});

test("optional cache-write absence does not invalidate usage", async () => {
  const dir = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  const path = join(dir, "optional.jsonl");
  writeFileSync(path, '{"type":"turn.started"}\n{"type":"turn.completed","usage":{"input_tokens":2,"cached_input_tokens":1,"output_tokens":3,"reasoning_output_tokens":1}}\n');
  const summary = await parseJsonlFile(path);
  assert.equal(summary.status, "AVAILABLE");
  assert.equal(summary.usage.cacheWriteInputTokens, null);
  rmSync(dir, { recursive: true });
});

test("duplicate final event fails closed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "telemetry-test-"));
  const path = join(dir, "duplicate.jsonl");
  writeFileSync(path, '{"type":"turn.started"}\n{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1,"reasoning_output_tokens":0}}\n{"type":"turn.completed","usage":{"input_tokens":1,"cached_input_tokens":0,"output_tokens":1,"reasoning_output_tokens":0}}\n');
  const summary = await parseJsonlFile(path);
  assert.equal(summary.status, "FAILED");
  assert.equal(summary.parserErrors.at(-1).code, "DUPLICATE_OR_ORPHAN_FINAL_EVENT");
  rmSync(dir, { recursive: true });
});