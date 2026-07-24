const fs = require("node:fs");
const path = require("node:path");

const ledgerPath = path.resolve(process.argv[2] || path.join(__dirname, "..", "reports", "JiraActivityAnalyzer_v0.2.33_execution_time_ledger.json"));
const allowedResults = new Set(["passed", "failed", "cancelled", "timeout", "interrupted"]);
const requiredTopLevel = [
  "schemaVersion", "project", "version", "timezone", "startedAt", "finishedAt",
  "wallClockSeconds", "officialUiElapsedSeconds", "officialUiElapsedStatus",
  "phases", "commands", "parallelGroups", "failedAttempts", "summary", "notes"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function secondsBetween(start, finish, label) {
  const startMs = Date.parse(start);
  const finishMs = Date.parse(finish);
  assert(Number.isFinite(startMs) && Number.isFinite(finishMs), `${label} has an invalid timestamp`);
  assert(finishMs >= startMs, `${label} has a negative interval`);
  return (finishMs - startMs) / 1000;
}

function nearlyEqual(left, right, tolerance = 0.01) {
  return Math.abs(left - right) <= tolerance;
}

const raw = fs.readFileSync(ledgerPath, "utf8");
const ledger = JSON.parse(raw);
for (const key of requiredTopLevel) assert(Object.prototype.hasOwnProperty.call(ledger, key), `missing required field: ${key}`);
assert(ledger.schemaVersion === 1, "unsupported schemaVersion");
assert(ledger.project === "JiraActivityAnalyzer", "unexpected project");
assert(ledger.version === "v0.2.33", "unexpected version");
assert(ledger.timezone === "Asia/Taipei", "unexpected timezone");
assert(ledger.officialUiElapsedSeconds === null, "official UI elapsed must be null when unavailable");
assert(ledger.officialUiElapsedStatus === "unavailable_to_codex", "official UI status must be explicit");

const measuredWallClock = secondsBetween(ledger.startedAt, ledger.finishedAt, "session");
assert(nearlyEqual(ledger.wallClockSeconds, measuredWallClock, 0.01), "wallClockSeconds does not match session timestamps");
assert(ledger.wallClockSeconds >= 0, "wallClockSeconds is negative");

const phaseIds = new Set();
assert(Array.isArray(ledger.phases) && ledger.phases.length >= 13, "ledger must retain all required implementation phases");
for (const phase of ledger.phases) {
  assert(phase.id && !phaseIds.has(phase.id), `duplicate or missing phase ID: ${phase.id}`);
  phaseIds.add(phase.id);
  const measured = secondsBetween(phase.startedAt, phase.finishedAt, `phase ${phase.id}`);
  assert(Number.isFinite(phase.wallClockSeconds) && phase.wallClockSeconds >= 0, `phase ${phase.id} has invalid duration`);
  assert(nearlyEqual(phase.wallClockSeconds, measured, 0.01), `phase ${phase.id} duration mismatch`);
  assert(typeof phase.status === "string" && phase.status.length > 0, `phase ${phase.id} is missing status`);
  assert(typeof phase.outcome === "string" && phase.outcome.length > 0, `phase ${phase.id} is missing outcome`);
  assert(Object.prototype.hasOwnProperty.call(phase, "overlap"), `phase ${phase.id} is missing overlap metadata`);
}

const commandIds = new Set();
for (const command of ledger.commands) {
  assert(command.id && !commandIds.has(command.id), `duplicate or missing command ID: ${command.id}`);
  commandIds.add(command.id);
  assert(phaseIds.has(command.phaseId), `command ${command.id} references missing phase ${command.phaseId}`);
  assert(Number.isInteger(command.attempt) && command.attempt >= 1, `command ${command.id} has invalid attempt`);
  assert(allowedResults.has(command.result), `command ${command.id} has invalid result`);
  assert(Number.isInteger(command.exitCode), `command ${command.id} is missing an exit code`);
  assert(command.parallelGroupId === null || typeof command.parallelGroupId === "string", `command ${command.id} has invalid parallelGroupId`);
  assert(typeof command.detail === "string" && command.detail.length > 0, `command ${command.id} is missing detail`);
  const measured = secondsBetween(command.startedAt, command.finishedAt, `command ${command.id}`);
  assert(Number.isFinite(command.elapsedSeconds) && command.elapsedSeconds >= 0, `command ${command.id} has invalid duration`);
  assert(nearlyEqual(command.elapsedSeconds, measured, 0.01), `command ${command.id} duration mismatch`);
}

const parallelGroupIds = new Set();
for (const group of ledger.parallelGroups) {
  assert(group.id && !parallelGroupIds.has(group.id), `duplicate or missing parallel group ID: ${group.id}`);
  parallelGroupIds.add(group.id);
  assert(Array.isArray(group.commandIds) && group.commandIds.length > 0, `parallel group ${group.id} has no commands`);
  for (const commandId of group.commandIds) assert(commandIds.has(commandId), `parallel group ${group.id} references missing command ${commandId}`);
  const measured = secondsBetween(group.startedAt, group.finishedAt, `parallel group ${group.id}`);
  assert(nearlyEqual(group.batchWallClockSeconds, measured, 0.01), `parallel group ${group.id} wall-clock mismatch`);
  const cumulative = group.commandIds.reduce((sum, commandId) => sum + ledger.commands.find((command) => command.id === commandId).elapsedSeconds, 0);
  assert(nearlyEqual(group.cumulativeCommandSeconds, cumulative, 0.01), `parallel group ${group.id} cumulative duration mismatch`);
  for (const commandId of group.commandIds) {
    const command = ledger.commands.find((candidate) => candidate.id === commandId);
    assert(command.parallelGroupId === group.id, `command ${commandId} does not reference parallel group ${group.id}`);
  }
}
for (const command of ledger.commands.filter((candidate) => candidate.parallelGroupId !== null)) {
  assert(parallelGroupIds.has(command.parallelGroupId), `command ${command.id} references missing parallel group ${command.parallelGroupId}`);
}

for (const failedId of ledger.failedAttempts) {
  const command = ledger.commands.find((candidate) => candidate.id === failedId);
  assert(command, `failed attempt references missing command ${failedId}`);
  assert(command.result !== "passed", `failed attempt ${failedId} is marked passed`);
}
for (const command of ledger.commands.filter((candidate) => candidate.result !== "passed")) {
  assert(ledger.failedAttempts.includes(command.id), `non-passing command ${command.id} is missing from failedAttempts`);
}

const cumulativeCommandSeconds = ledger.commands.reduce((sum, command) => sum + command.elapsedSeconds, 0);
const failedOrRetriedCommandSeconds = ledger.commands
  .filter((command) => command.result !== "passed" || command.attempt > 1)
  .reduce((sum, command) => sum + command.elapsedSeconds, 0);
assert(nearlyEqual(ledger.summary.cumulativeCommandSeconds, cumulativeCommandSeconds, 0.02), "cumulative command duration mismatch");
assert(nearlyEqual(ledger.summary.failedOrRetriedCommandSeconds, failedOrRetriedCommandSeconds, 0.02), "failed/retried command duration mismatch");
assert(ledger.summary.unaccountedSeconds >= 0, "unaccountedSeconds is negative");
assert(nearlyEqual(
  ledger.wallClockSeconds,
  ledger.summary.nonOverlappingPhaseSeconds + ledger.summary.unaccountedSeconds,
  ledger.summary.reconciliationToleranceSeconds
), "session/phase reconciliation mismatch");
assert(ledger.summary.reconciliationPassed === true, "reconciliationPassed is false");
assert(ledger.summary.officialUiDifferenceSeconds === null, "official UI difference must be null when UI elapsed is unavailable");

const forbiddenSecrets = [
  /authorization\s*[:=]\s*(?!\[masked\])\S+/i,
  /(?:api[_-]?token|password|cookie)\s*[:=]\s*(?!\[masked\])\S+/i,
  /bearer\s+[a-z0-9._~-]{12,}/i
];
for (const pattern of forbiddenSecrets) assert(!pattern.test(raw), `ledger contains a possible secret matching ${pattern}`);

console.log(`Execution ledger validation passed: ${ledgerPath}`);
