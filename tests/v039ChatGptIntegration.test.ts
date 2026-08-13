import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configureAppRoot } from "../electron/appRoot";
import { ChatGptService } from "../electron/chatGptService";

const providerRequest = (prompt: string, extra: Record<string, unknown> = {}) => ({ prompt, deliveryMode: "INLINE_EXACT_CONTENT" as const, finalProviderPayloadSha256: crypto.createHash("sha256").update(prompt, "utf8").digest("hex"), ...extra });

async function waitFor(predicate: () => boolean, timeout = 1000) { const started = Date.now(); while (!predicate()) { if (Date.now() - started > timeout) throw new Error("waitFor timeout"); await new Promise((resolve) => setTimeout(resolve, 10)); } }

async function main() {
  const root = process.cwd(); const temp = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v039-")); configureAppRoot(temp);
  const fake = path.join(root, "tests", "fixtures", "fake-codex-app-server.cjs");
  let opened = "";
  const signedOut = new ChatGptService({ runtimePath: process.execPath, runtimeArgs: [fake, "signed_out"], openExternal: async (url) => { opened = url; } });
  assert.equal((await signedOut.start()).state, "signed_out"); await signedOut.login(); assert(opened.startsWith("https://auth.openai.com/"));
  await waitFor(() => signedOut.getStatus().state === "connected"); assert.equal(signedOut.getStatus().accountEmailMasked, "d***@example.test"); assert.equal(signedOut.getStatus().models[0].id, "gpt-test");
  await signedOut.stop();

  const service = new ChatGptService({ runtimePath: process.execPath, runtimeArgs: [fake, "connected"] });
  const status = await service.start(); assert.equal(status.state, "connected"); assert.equal(status.primaryRateLimit?.usedPercent, 12);
  const events: string[] = []; service.subscribeRun((event) => events.push(event.type));
  const result = await service.runAnalysis(providerRequest("Untrusted Jira evidence. Return JSON.", { outputSchema: { type: "object" } }));
  assert.equal(result.text, '{"candidates":[]}'); assert.equal(result.usage.totalTokens, 13); assert.deepEqual(events, ["thread_starting", "thread_created", "started", "turn_starting", "turn_started", "delta", "usage", "completed"]); await service.stop();

  const cancelling = new ChatGptService({ runtimePath: process.execPath, runtimeArgs: [fake, "cancel"] }); await cancelling.start();
  let cancellingRunId = ""; cancelling.subscribeRun((event) => { if (event.type === "started") cancellingRunId = event.runId; });
  const cancelledRun = cancelling.runAnalysis(providerRequest("cancel")); await waitFor(() => Boolean(cancellingRunId));
  assert.equal(await cancelling.cancelRun(cancellingRunId), true); await assert.rejects(cancelledRun, /RUN_CANCELLED/); await cancelling.stop();

  const crashing = new ChatGptService({ runtimePath: process.execPath, runtimeArgs: [fake, "crash"] }); await crashing.start();
  await assert.rejects(crashing.runAnalysis(providerRequest("crash")), /OUTCOME_UNKNOWN|CODEX_RUNTIME_EXITED/); assert.equal(crashing.getStatus().state, "runtime_error"); await crashing.stop();
  fs.rmSync(temp, { recursive: true, force: true });
  console.log("v0.3.9 fake App Server integration tests passed");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
