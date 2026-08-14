import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const CODEX_SANDBOX_CONTRACT_VERSION = "jaa-codex-sandbox-v0317" as const;

export type CodexWorkspaceWritePolicy = {
  type: "workspaceWrite";
  writableRoots: string[];
  networkAccess: false;
  excludeTmpdirEnvVar: true;
  excludeSlashTmp: true;
};

export type TokenBucket = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
};

export type AccurateTokenTelemetry = {
  availability: "actual" | "actual_zero_no_model_dispatch" | "unavailable";
  turnCumulative: TokenBucket;
  lastModelCall: TokenBucket;
  modelContextWindow: number | null;
  maxObservedSingleCallTokens: number | null;
  maxObservedContextUtilizationPercent: number | null;
  usageEventCount: number;
  anomalies: Array<{ code: "TOKEN_CUMULATIVE_ROLLBACK"; previousTotal: number; observedTotal: number; eventIndex: number }>;
};

const EMPTY_BUCKET: TokenBucket = { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null };
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const normalized = (value: Record<string, unknown>): TokenBucket => ({
  inputTokens: numeric(value.inputTokens),
  cachedInputTokens: numeric(value.cachedInputTokens),
  outputTokens: numeric(value.outputTokens),
  reasoningTokens: numeric(value.reasoningTokens ?? value.reasoningOutputTokens),
  totalTokens: numeric(value.totalTokens)
});

export function createTokenTelemetry(modelContextWindow: number | null = null): AccurateTokenTelemetry {
  return { availability: "unavailable", turnCumulative: { ...EMPTY_BUCKET }, lastModelCall: { ...EMPTY_BUCKET }, modelContextWindow, maxObservedSingleCallTokens: null, maxObservedContextUtilizationPercent: null, usageEventCount: 0, anomalies: [] };
}

export function updateTokenTelemetry(current: AccurateTokenTelemetry, raw: unknown): AccurateTokenTelemetry {
  const root = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const total = normalized((root.total && typeof root.total === "object" ? root.total : {}) as Record<string, unknown>);
  const last = normalized((root.last && typeof root.last === "object" ? root.last : {}) as Record<string, unknown>);
  const eventIndex = current.usageEventCount + 1;
  const anomalies = [...current.anomalies];
  if (current.turnCumulative.totalTokens !== null && total.totalTokens !== null && total.totalTokens < current.turnCumulative.totalTokens) anomalies.push({ code: "TOKEN_CUMULATIVE_ROLLBACK", previousTotal: current.turnCumulative.totalTokens, observedTotal: total.totalTokens, eventIndex });
  const keepCurrent = current.turnCumulative.totalTokens !== null && (total.totalTokens === null || total.totalTokens < current.turnCumulative.totalTokens);
  const turnCumulative = keepCurrent ? current.turnCumulative : total;
  const maxObservedSingleCallTokens = last.totalTokens === null ? current.maxObservedSingleCallTokens : Math.max(current.maxObservedSingleCallTokens ?? 0, last.totalTokens);
  const maxObservedContextUtilizationPercent = current.modelContextWindow && maxObservedSingleCallTokens !== null ? Math.min(100, maxObservedSingleCallTokens / current.modelContextWindow * 100) : null;
  return { ...current, availability: total.totalTokens === null && last.totalTokens === null ? current.availability : "actual", turnCumulative, lastModelCall: last.totalTokens === null ? current.lastModelCall : last, maxObservedSingleCallTokens, maxObservedContextUtilizationPercent, usageEventCount: eventIndex, anomalies };
}

export function zeroDispatchTokenTelemetry(modelContextWindow: number | null = null): AccurateTokenTelemetry {
  return { ...createTokenTelemetry(modelContextWindow), availability: "actual_zero_no_model_dispatch", turnCumulative: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 }, lastModelCall: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 } };
}

function isReparsePoint(target: string) {
  const stats = fs.lstatSync(target);
  return stats.isSymbolicLink() || Boolean((stats.mode & 0o120000) === 0o120000);
}

export function canonicalArtifactPaths(runDirectory: string, outputDirectory: string) {
  const runRoot = fs.realpathSync(path.resolve(runDirectory));
  const outputRoot = fs.realpathSync(path.resolve(outputDirectory));
  const relative = path.relative(runRoot, outputRoot);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.basename(outputRoot).toLowerCase() !== "ai-output") throw new Error("AI_ARTIFACT_PATH_ESCAPE");
  let cursor = runRoot;
  for (const segment of relative.split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (isReparsePoint(cursor)) throw new Error("AI_ARTIFACT_PATH_ESCAPE:REPARSE_POINT");
  }
  return { runRoot, outputRoot };
}

export function workspaceWritePolicy(outputRoot: string): CodexWorkspaceWritePolicy {
  return { type: "workspaceWrite", writableRoots: [path.resolve(outputRoot)], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true };
}

export function sanitizedPolicyConfig(runId: string, cwd: string, policy: CodexWorkspaceWritePolicy) {
  return { schemaVersion: CODEX_SANDBOX_CONTRACT_VERSION, runId, cwd, approvalPolicy: "never", approvalsReviewer: "user", sandboxPolicy: policy, runtimeWorkspaceRoots: [...policy.writableRoots] };
}

export function compareSandboxPolicies(probe: ReturnType<typeof sanitizedPolicyConfig>, thread: ReturnType<typeof sanitizedPolicyConfig>, turn: ReturnType<typeof sanitizedPolicyConfig>) {
  const canonical = (value: ReturnType<typeof sanitizedPolicyConfig>) => JSON.stringify({ runId: value.runId, cwd: path.resolve(value.cwd), approvalPolicy: value.approvalPolicy, sandboxPolicy: { ...value.sandboxPolicy, writableRoots: value.sandboxPolicy.writableRoots.map((item) => path.resolve(item)) }, runtimeWorkspaceRoots: value.runtimeWorkspaceRoots.map((item) => path.resolve(item)) });
  const matched = canonical(probe) === canonical(thread) && canonical(thread) === canonical(turn);
  return { schemaVersion: "jaa-sandbox-policy-comparison-v1", matched, probe, thread, turn, errorCode: matched ? null : "AI_SANDBOX_POLICY_MISMATCH" };
}

export function validateConfigRequirements(raw: unknown) {
  const root = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const requirements = root.requirements && typeof root.requirements === "object" ? root.requirements as Record<string, unknown> : null;
  const allowedSandboxModes = requirements && Array.isArray(requirements.allowedSandboxModes) ? requirements.allowedSandboxModes.map(String) : null;
  const allowedApprovalPolicies = requirements && Array.isArray(requirements.allowedApprovalPolicies) ? requirements.allowedApprovalPolicies.map(String) : null;
  const workspaceWriteAllowed = !allowedSandboxModes || allowedSandboxModes.includes("workspace-write");
  const neverApprovalAllowed = !allowedApprovalPolicies || allowedApprovalPolicies.includes("never");
  return { requirements: requirements ? { allowedSandboxModes, allowedApprovalPolicies, allowedWindowsSandboxImplementations: requirements.allowedWindowsSandboxImplementations ?? null, defaultPermissions: requirements.defaultPermissions ?? null } : null, workspaceWriteAllowed, neverApprovalAllowed, accepted: workspaceWriteAllowed && neverApprovalAllowed };
}

export function sha256File(filePath: string) { return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"); }

export function rootArtifactError(providerEvents: unknown[], fallback: string) {
  for (const event of providerEvents) {
    const text = JSON.stringify(event);
    if (/"status":"declined"/i.test(text) && /blocked by policy/i.test(text) && /ai-output/i.test(text)) return "AI_OUTPUT_WRITE_BLOCKED_BY_POLICY";
  }
  return fallback;
}
