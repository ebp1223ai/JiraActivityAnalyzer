const readline = require("node:readline");

const scenario = process.argv[2] || "connected";
let signedIn = scenario !== "signed_out";
let active = null;
const send = (value, fragmented = false) => {
  const line = JSON.stringify(value) + "\n";
  if (!fragmented) return process.stdout.write(line);
  const middle = Math.floor(line.length / 2);
  process.stdout.write(line.slice(0, middle));
  setTimeout(() => process.stdout.write(line.slice(middle)), 3);
};
const response = (id, result) => send({ id, result });
const notification = (method, params) => send({ method, params });

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.method === "initialize") return send({ id: message.id, result: { userAgent: "fake-codex/0.147.0", codexHome: process.env.CODEX_HOME, platformFamily: "windows", platformOs: "windows" } }, true);
  if (message.method === "initialized") { if (scenario === "malformed") process.stdout.write("{bad json}\n"); return; }
  if (scenario === "timeout" && message.method === "account/read") return;
  if (message.method === "account/read") return response(message.id, { account: signedIn ? { type: "chatgpt", email: "developer@example.test", planType: "pro" } : null, requiresOpenaiAuth: true });
  if (message.method === "account/login/start") {
    signedIn = true; response(message.id, { type: "chatgpt", loginId: "login-test-id", authUrl: "https://auth.openai.com/oauth/authorize?secret=masked-by-main" });
    setTimeout(() => { notification("account/login/completed", { loginId: "login-test-id", success: true, error: null, onboardingEntrypoint: null }); notification("account/updated", { authMode: "chatgpt", planType: "pro" }); }, 10); return;
  }
  if (message.method === "account/login/cancel") return response(message.id, { status: "cancelled" });
  if (message.method === "account/logout") { signedIn = false; return response(message.id, {}); }
  if (message.method === "model/list") return response(message.id, { data: [{ id: "gpt-test", model: "gpt-test", displayName: "GPT Test", description: "Deterministic fixture", hidden: false, isDefault: true, defaultReasoningEffort: "medium", supportedReasoningEfforts: [], inputModalities: ["text"], supportsPersonality: false, additionalSpeedTiers: [], serviceTiers: [], defaultServiceTier: null, upgrade: null, upgradeInfo: null, availabilityNux: null, modelSpecialty: null }], nextCursor: null });
  if (message.method === "account/rateLimits/read") return response(message.id, { rateLimits: { limitId: "codex", limitName: "Codex", primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1893456000 }, secondary: null, credits: null, individualLimit: null, spendControlReached: false, planType: "pro", rateLimitReachedType: null }, rateLimitsByLimitId: null, rateLimitResetCredits: null });
  if (message.method === "thread/start") return response(message.id, { thread: { id: "thread-test", ephemeral: true }, model: "gpt-test", modelProvider: "openai", serviceTier: null, cwd: process.cwd(), instructionSources: [], approvalPolicy: "never", approvalsReviewer: "user", sandbox: { type: "readOnly" }, reasoningEffort: "medium" });
  if (message.method === "turn/start") {
    active = { threadId: message.params.threadId, turnId: "turn-test" }; response(message.id, { turn: { id: active.turnId, items: [], itemsView: "all", status: "inProgress", error: null, startedAt: 1, completedAt: null, durationMs: null } });
    if (scenario === "crash") return setTimeout(() => process.exit(47), 5);
    send({ id: 900, method: "item/commandExecution/requestApproval", params: { threadId: active.threadId, turnId: active.turnId, itemId: "tool-test", command: "should-not-run" } }); return;
  }
  if (message.id === 900) {
    if (message.result?.decision !== "decline") return process.exit(48);
    if (scenario === "cancel") return;
    notification("item/agentMessage/delta", { ...active, itemId: "message-test", delta: '{"candidates":[]}' });
    notification("thread/tokenUsage/updated", { ...active, tokenUsage: { total: { totalTokens: 13, inputTokens: 8, cachedInputTokens: 2, cacheWriteInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 1 }, last: { totalTokens: 13, inputTokens: 8, cachedInputTokens: 2, cacheWriteInputTokens: 0, outputTokens: 5, reasoningOutputTokens: 1 }, modelContextWindow: 100000 } });
    notification("turn/completed", { threadId: active.threadId, turn: { id: active.turnId, items: [], itemsView: "all", status: "completed", error: null, startedAt: 1, completedAt: 2, durationMs: 10 } }); return;
  }
  if (message.method === "turn/interrupt") { response(message.id, {}); notification("turn/completed", { threadId: active.threadId, turn: { id: active.turnId, items: [], itemsView: "all", status: "interrupted", error: null, startedAt: 1, completedAt: 2, durationMs: 10 } }); return; }
  if (message.method === "thread/delete") return response(message.id, {});
});
