import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CodexJsonRpcClient } from "../electron/codexJsonRpcClient";
import { redactChatGptText } from "../electron/chatGptRedactor";
import { CODEX_RUNTIME_VERSION } from "../shared/chatGptContract";

async function main() {
  const root = process.cwd();
  const fake = path.join(root, "tests", "fixtures", "fake-codex-app-server.cjs");
  const client = new CodexJsonRpcClient(process.execPath, path.join(root, "test-artifacts", "fake-codex-home"), () => undefined, [fake, "malformed"]);
  let protocolErrors = 0; client.on("protocolError", () => protocolErrors++);
  await client.start();
  const account = await client.request("account/read", { refreshToken: false }) as { account: { type: string } };
  assert.equal(account.account.type, "chatgpt", "fragmented initialize and account response must parse");
  await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(protocolErrors, 1, "malformed JSONL must be diagnosed without corrupting the stream");
  await client.stop();

  const timeoutClient = new CodexJsonRpcClient(process.execPath, path.join(root, "test-artifacts", "fake-codex-home-timeout"), () => undefined, [fake, "timeout"]);
  await timeoutClient.start();
  await assert.rejects(timeoutClient.request("account/read", { refreshToken: false }, 25), /CODEX_REQUEST_TIMEOUT/);
  await timeoutClient.stop();

  const redacted = redactChatGptText("Bearer abc.def.ghi developer@example.test https://auth.openai.com/oauth?code=secret token=topsecret");
  assert(!redacted.includes("abc.def.ghi") && !redacted.includes("developer@example.test") && !redacted.includes("code=secret") && !redacted.includes("topsecret"));

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.version, "0.3.9"); assert.equal(pkg.dependencies["@openai/codex"], CODEX_RUNTIME_VERSION);
  assert(pkg.build.extraResources.some((item: { to: string }) => item.to === "codex-runtime"));
  const env = fs.readFileSync(path.join(root, ".env.version"), "utf8");
  assert(env.includes("ENV_FORMAT_VERSION=4") && env.includes("AI_NEXUS_TOKEN=") && !env.includes("AI_CLOUD_") && !env.includes("OPENAI_API_KEY"));
  const contract = fs.readFileSync(path.join(root, "shared", "chatGptContract.ts"), "utf8");
  assert(contract.includes('"chatgpt_codex" | "ai_nexus" | "offline_rule"'));
  const ipc = fs.readFileSync(path.join(root, "electron", "aiAnalysisIpc.ts"), "utf8");
  assert(!ipc.includes("api.openai.com") && !ipc.includes("AI_CLOUD_API_KEY") && ipc.includes("callAiNexus") && ipc.includes("chatgpt.runAnalysis"));
  const core = fs.readFileSync(path.join(root, "electron", "aiAnalysisCore.ts"), "utf8");
  assert(core.includes('if (run.status !== "completed")') && core.includes("Only completed analysis runs may be persisted"));
  console.log("v0.3.9 unit contract tests passed");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
