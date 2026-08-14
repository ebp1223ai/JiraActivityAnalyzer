const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function main() {
  if (process.platform !== "win32") { console.log("Bundled Codex write probe contract skipped: Windows only."); return; }
  const root = path.resolve(__dirname, "..");
  const executable = path.join(root, "node_modules", "@openai", "codex-win32-x64", "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");
  const contractRoot = fs.mkdtempSync(path.join(root, "test-artifacts", "v0317-codex-contract-"));
  const codexHome = path.join(contractRoot, "codex-home");
  const runRoot = path.join(contractRoot, "run");
  const outputRoot = path.join(runRoot, "ai-output");
  fs.mkdirSync(codexHome, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(codexHome, "config.toml"), 'cli_auth_credentials_store = "keyring"\nforced_login_method = "chatgpt"\n', "utf8");
  const child = spawn(executable, ["app-server", "--stdio"], { cwd: runRoot, env: { ...process.env, CODEX_HOME: codexHome }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.setEncoding("utf8");
  let buffer = ""; let id = 0; const pending = new Map();
  child.stdout.on("data", (chunk) => { buffer += chunk; let newline; while ((newline = buffer.indexOf("\n")) >= 0) { const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1); if (!line) continue; const message = JSON.parse(line); if (typeof message.id === "number" && pending.has(message.id)) { const entry = pending.get(message.id); pending.delete(message.id); message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result); } } });
  const request = (method, params) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); child.stdin.write(JSON.stringify({ id: requestId, method, ...(params === undefined ? {} : { params }) }) + "\n"); });
  const policy = { type: "workspaceWrite", writableRoots: [fs.realpathSync(outputRoot)], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true };
  const probePath = path.join(outputRoot, ".jaa-contract-probe.tmp");
  try {
    await request("initialize", { clientInfo: { name: "jaa-v0317-contract", title: "JAA v0.3.17 Contract", version: "0.3.17" }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
    const requirements = await request("configRequirements/read");
    const nonce = crypto.randomBytes(24).toString("hex");
    const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const script = "& { param([string]$file,[string]$content) [IO.File]::WriteAllText($file,$content,[Text.UTF8Encoding]::new($false)) }";
    const response = await request("command/exec", { command: [powershell, "-NoProfile", "-NonInteractive", "-Command", script, probePath, nonce], cwd: runRoot, timeoutMs: 30_000, sandboxPolicy: policy });
    assert.equal(response.exitCode, 0, response.stderr);
    assert.equal(fs.readFileSync(probePath, "utf8"), nonce);
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(probePath)).digest("hex"), crypto.createHash("sha256").update(nonce).digest("hex"));
    console.log(JSON.stringify({ status: "passed", runtime: "0.147.0", method: "command/exec", modelDispatchCount: 0, totalTokens: 0, requirementsPresent: requirements.requirements !== undefined }, null, 2));
  } finally {
    child.stdin.end(); setTimeout(() => child.kill(), 500).unref();
    await new Promise((resolve) => child.once("exit", resolve));
    try { fs.rmSync(contractRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch (error) { console.warn(`Write probe cleanup retained test artifact: ${error.code ?? error.message}`); }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
