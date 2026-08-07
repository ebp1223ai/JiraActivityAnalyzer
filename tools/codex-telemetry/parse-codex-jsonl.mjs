import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const REQUIRED_USAGE = [
  "input_tokens",
  "cached_input_tokens",
  "output_tokens",
  "reasoning_output_tokens"
];

export function redact(value) {
  return String(value)
    .replace(/(authorization\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?token|token|password|secret|cookie|session)\s*[:=]\s*)([^\s,;]+)/gi, "$1[REDACTED]")
    .slice(0, 500);
}

function integer(value) {
  return Number.isInteger(value) && value >= 0;
}

export function normalizeUsage(usage, lineNumber = null) {
  if (!usage || typeof usage !== "object") {
    return { error: { code: "MISSING_USAGE", lineNumber } };
  }
  for (const field of REQUIRED_USAGE) {
    if (!integer(usage[field])) {
      return { error: { code: "INVALID_USAGE_FIELD", field, lineNumber } };
    }
  }
  if (usage.cache_write_input_tokens !== undefined && !integer(usage.cache_write_input_tokens)) {
    return { error: { code: "INVALID_OPTIONAL_USAGE_FIELD", field: "cache_write_input_tokens", lineNumber } };
  }
  if (usage.total_tokens !== undefined && !integer(usage.total_tokens)) {
    return { error: { code: "INVALID_TOTAL_TOKENS", lineNumber } };
  }
  const totalTokens = usage.total_tokens ?? usage.input_tokens + usage.output_tokens;
  return {
    value: {
      input_tokens: usage.input_tokens,
      cached_input_tokens: usage.cached_input_tokens,
      cache_write_input_tokens: usage.cache_write_input_tokens ?? null,
      output_tokens: usage.output_tokens,
      reasoning_output_tokens: usage.reasoning_output_tokens,
      total_tokens: totalTokens,
      inputTokens: usage.input_tokens,
      cachedInputTokens: usage.cached_input_tokens,
      cacheWriteInputTokens: usage.cache_write_input_tokens ?? null,
      outputTokens: usage.output_tokens,
      reasoningOutputTokens: usage.reasoning_output_tokens,
      totalTokens,
      totalFormula: usage.total_tokens === undefined ? "inputTokens + outputTokens" : "runtime total_tokens"
    }
  };
}

function eventType(event) {
  return typeof event?.type === "string" ? event.type : "unknown";
}

function itemType(event) {
  return event?.item?.type ?? event?.item_type ?? "unknown_item";
}

function collectItem(summary, event) {
  const item = event.item ?? event;
  const type = itemType(event);
  if (["command_execution", "command", "shell_command"].includes(type)) {
    summary.operations.commands.push({
      command: redact(item.command ?? item.cmd ?? "UNAVAILABLE"),
      exitCode: item.exit_code ?? item.exitCode ?? null,
      status: item.status ?? null,
      durationMs: item.duration_ms ?? item.durationMs ?? null
    });
  } else if (["file_change", "file_changes"].includes(type)) {
    const changes = Array.isArray(item.changes) ? item.changes : [item];
    for (const change of changes) {
      const path = change.path ?? change.file_path ?? change.filePath;
      if (typeof path === "string") {
        summary.operations.fileChanges.push({ path, kind: change.kind ?? change.type ?? null });
        summary.pathEvidence.telemetryObservedPaths.push(path);
      }
    }
  } else if (["mcp_tool_call", "mcp_call"].includes(type)) {
    summary.operations.mcp.push({ name: item.name ?? item.tool ?? "unknown", status: item.status ?? null });
  } else if (["web_search", "web_search_call"].includes(type)) {
    summary.operations.web.push({ query: redact(item.query ?? "UNAVAILABLE"), status: item.status ?? null });
  } else if (["plan_update", "update_plan"].includes(type)) {
    summary.operations.plan.push({ status: item.status ?? null });
  } else {
    summary.operations.unknownItems[type] = (summary.operations.unknownItems[type] ?? 0) + 1;
  }
}

function emptySummary(source) {
  return {
    schemaVersion: 1,
    source,
    status: "UNAVAILABLE",
    threadIds: [],
    eventCounts: {},
    unknownEventCounts: {},
    turns: [],
    usage: null,
    parserErrors: [],
    runtimeErrors: [],
    operations: { commands: [], fileChanges: [], mcp: [], web: [], plan: [], unknownItems: {} },
    pathEvidence: {
      telemetryObservedPaths: [],
      workerDeclaredInspectedPaths: [],
      gitConfirmedModifiedPaths: [],
      limitation: "Inspection coverage is declared by the Worker and corroborated where possible; it is not guaranteed to be a complete automatic read trace."
    }
  };
}

export async function parseJsonlFile(inputPath) {
  const summary = emptySummary(inputPath);
  const threads = new Set();
  let lineNumber = 0;
  let currentTurn = null;
  const reader = createInterface({ input: createReadStream(inputPath, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const rawLine of reader) {
    lineNumber += 1;
    if (!rawLine.trim()) continue;
    let event;
    try {
      event = JSON.parse(rawLine);
    } catch (error) {
      summary.parserErrors.push({ code: "MALFORMED_JSONL", lineNumber, message: redact(error.message) });
      continue;
    }
    const type = eventType(event);
    summary.eventCounts[type] = (summary.eventCounts[type] ?? 0) + 1;
    if (type === "thread.started") {
      const id = event.thread_id ?? event.threadId;
      if (typeof id === "string") threads.add(id);
    } else if (type === "turn.started") {
      if (currentTurn) summary.parserErrors.push({ code: "OVERLAPPING_TURN_STARTED", lineNumber });
      currentTurn = { status: "started", startedLine: lineNumber, usage: null };
      summary.turns.push(currentTurn);
    } else if (type === "turn.completed") {
      if (!currentTurn || currentTurn.status !== "started") {
        summary.parserErrors.push({ code: "DUPLICATE_OR_ORPHAN_FINAL_EVENT", lineNumber });
        continue;
      }
      const normalized = normalizeUsage(event.usage, lineNumber);
      currentTurn.status = normalized.error ? "completed_without_valid_usage" : "completed";
      currentTurn.completedLine = lineNumber;
      currentTurn.usage = normalized.value ?? null;
      if (normalized.error) summary.parserErrors.push(normalized.error);
      currentTurn = null;
    } else if (type === "turn.failed") {
      summary.runtimeErrors.push({ code: "TURN_FAILED", lineNumber, message: redact(event.error?.message ?? event.message ?? "turn failed") });
      if (currentTurn) {
        currentTurn.status = "failed";
        currentTurn.completedLine = lineNumber;
        currentTurn = null;
      } else {
        summary.turns.push({ status: "failed", completedLine: lineNumber, usage: null });
      }
    } else if (type === "error") {
      summary.runtimeErrors.push({ code: "RUNTIME_ERROR", lineNumber, message: redact(event.message ?? event.error?.message ?? "runtime error") });
    } else if (["item.started", "item.updated", "item.completed"].includes(type)) {
      collectItem(summary, event);
    } else {
      summary.unknownEventCounts[type] = (summary.unknownEventCounts[type] ?? 0) + 1;
    }
  }
  summary.threadIds = [...threads];
  const completed = summary.turns.filter((turn) => turn.status === "completed");
  summary.usage = completed.length ? aggregateUsage(completed.map((turn) => turn.usage)) : null;
  const hasMissingUsage = summary.turns.some((turn) => turn.status === "completed_without_valid_usage");
  const fatalParserError = summary.parserErrors.some((error) => error.code !== "MISSING_USAGE");
  if (fatalParserError || summary.runtimeErrors.length || summary.turns.some((turn) => turn.status === "failed")) {
    summary.status = "FAILED";
  } else if (!completed.length || hasMissingUsage) {
    summary.status = "PARTIAL";
  } else {
    summary.status = "AVAILABLE";
  }
  summary.pathEvidence.telemetryObservedPaths = [...new Set(summary.pathEvidence.telemetryObservedPaths)].sort();
  return summary;
}

export function aggregateUsage(usages) {
  const total = {
    availability: "AVAILABLE",
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    totalFormula: "sum of per-turn totalTokens; cached/reasoning breakdowns are not added again"
  };
  let optionalAvailable = true;
  for (const usage of usages) {
    if (!usage) return { availability: "UNAVAILABLE" };
    total.inputTokens += usage.inputTokens;
    total.cachedInputTokens += usage.cachedInputTokens;
    total.outputTokens += usage.outputTokens;
    total.reasoningOutputTokens += usage.reasoningOutputTokens;
    total.totalTokens += usage.totalTokens;
    if (usage.cacheWriteInputTokens === null) optionalAvailable = false;
    else total.cacheWriteInputTokens += usage.cacheWriteInputTokens;
  }
  if (!optionalAvailable) {
    total.cacheWriteInputTokens = null;
    total.cacheWriteAvailability = "UNAVAILABLE_OPTIONAL_FIELD";
  }
  return total;
}

export function aggregateSummaries(summaries) {
  const valid = summaries.filter((summary) => summary.status === "AVAILABLE" && summary.usage);
  return {
    schemaVersion: 1,
    status: valid.length === summaries.length ? "AVAILABLE" : valid.length ? "PARTIAL" : "UNAVAILABLE",
    phases: summaries,
    usage: valid.length ? aggregateUsage(valid.map((summary) => summary.usage)) : { availability: "UNAVAILABLE" }
  };
}

export function validateHandoff(handoff, expectedPhase, expectedThread) {
  const errors = [];
  for (const field of ["phaseId", "status", "threadId", "branch", "head", "startedAt", "endedAt", "inspectedPaths", "modifiedPaths", "commands", "retries", "nextPhaseReady", "blockers"]) {
    if (!(field in handoff)) errors.push(`MISSING_${field}`);
  }
  if (handoff.phaseId !== expectedPhase) errors.push("PHASE_MISMATCH");
  if (handoff.threadId !== expectedThread) errors.push("THREAD_MISMATCH");
  if (handoff.status !== "completed") errors.push("PHASE_NOT_COMPLETED");
  if (handoff.nextPhaseReady !== true) errors.push("NEXT_PHASE_NOT_READY");
  for (const field of ["inspectedPaths", "modifiedPaths", "commands", "retries", "blockers"]) {
    if (field in handoff && !Array.isArray(handoff[field])) errors.push(`INVALID_${field}`);
  }
  if (Array.isArray(handoff.inspectedPaths) && handoff.inspectedPaths.length === 0 && !handoff.notApplicableReason) errors.push("EMPTY_INSPECTION_SCOPE");
  return { valid: errors.length === 0, errors };
}

export function assertUniqueOutputRoot(path) {
  if (existsSync(path)) throw new Error("OUTPUT_ROOT_COLLISION");
  return true;
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function main(argv) {
  const [command, ...args] = argv;
  const value = (flag) => args[args.indexOf(flag) + 1];
  if (command === "parse") {
    const input = value("--input");
    const output = value("--output");
    const summary = await parseJsonlFile(input);
    writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    if (summary.status !== "AVAILABLE") process.exitCode = 2;
  } else if (command === "handoff") {
    const input = value("--input");
    const result = validateHandoff(JSON.parse(readFileSync(input, "utf8")), value("--phase"), value("--thread"));
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.valid) process.exitCode = 3;
  } else if (command === "sha256") {
    process.stdout.write(`${sha256File(value("--input"))}\n`);
  } else {
    throw new Error("Usage: parse-codex-jsonl.mjs parse|handoff|sha256 ...");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${redact(error.message)}\n`);
    process.exitCode = 1;
  });
}
