const fs = require("node:fs");
const path = require("node:path");
const port = Number(process.argv[2]);
const expectedVersion = process.argv[3] || "0.3.37";
const outputPath = path.resolve(process.argv[4] || "test-artifacts/v0.3.37-packaged-startup.json");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function findTarget() {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error(`No packaged Electron renderer target on port ${port}.`);
}
async function connect(url) {
  const socket = new WebSocket(url); const pending = new Map(); let id = 0;
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => { const value = JSON.parse(String(event.data)); if (!pending.has(value.id)) return; const pair = pending.get(value.id); pending.delete(value.id); value.error ? pair.reject(new Error(value.error.message)) : pair.resolve(value.result); });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
  return { socket, send };
}
async function evaluate(send, expression) { const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result.value; }
(async () => {
  const target = await findTarget(); const { socket, send } = await connect(target.webSocketDebuggerUrl);
  await send("Runtime.enable"); await evaluate(send, `location.hash='#/ai-analysis'`); await sleep(1500);
  const audit = await evaluate(send, `(() => { const text = document.body.innerText || ''; const labels = [...document.querySelectorAll('[role="tab"]')].map((item) => (item.textContent || '').trim()); return { url: location.href, title: document.title, bodyLength: text.length, tabCount: labels.length, tabLabels: labels, versionVisible: text.includes('${expectedVersion}'), buildTimeVisible: text.includes('Build Time'), whiteScreen: text.trim().length < 300, rendererCrashVisible: /renderer crash|white screen/i.test(text) }; })()`);
  audit.status = !audit.whiteScreen && !audit.rendererCrashVisible && audit.versionVisible && audit.buildTimeVisible && audit.tabCount >= 3 ? "PASS" : "FAIL";
  audit.appOnlyDomInspection = true; audit.desktopCaptured = false; fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2) + "\n");
  try { await send("Browser.close"); } catch {} socket.close(); console.log(JSON.stringify(audit)); if (audit.status !== "PASS") process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });