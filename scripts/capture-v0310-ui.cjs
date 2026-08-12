const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.argv[2] || 9339);
const output = path.resolve(process.argv[3] || "test-artifacts/v0.3.10-app-ui");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function target() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch {}
    await sleep(300);
  }
  throw new Error(`No Electron renderer target on CDP port ${port}.`);
}

async function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const value = JSON.parse(String(event.data));
    if (!value.id || !pending.has(value.id)) return;
    const { resolve, reject } = pending.get(value.id);
    pending.delete(value.id);
    if (value.error) reject(new Error(value.error.message)); else resolve(value.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return { socket, send };
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Renderer evaluation failed.");
  return result.result.value;
}

async function screenshot(send, name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(output, name), Buffer.from(result.data, "base64"));
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const page = await target();
  const { socket, send } = await connect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Runtime.enable");
  await evaluate(send, `location.hash = '#/ai-analysis'`);
  await sleep(4500);

  const tabs = [
    ["AI 連線與診斷", "1-diagnostics.png"],
    ["分析工作區", "2-workspace.png"],
    ["Activity Events 分析結果", "3-results.png"]
  ];
  const observedText = {};
  for (const [label, fileName] of tabs) {
    const clicked = await evaluate(send, `(() => { const element = [...document.querySelectorAll('[role="tab"]')].find((item) => (item.textContent || '').includes(${JSON.stringify(label)})); if (!element) return false; element.click(); return true; })()`);
    if (!clicked) throw new Error(`Missing tab: ${label}`);
    await sleep(500);
    observedText[label] = await evaluate(send, `document.body.innerText || ''`);
    await screenshot(send, fileName);
  }

  const audit = await evaluate(send, `(() => {
    const text = document.body.innerText || '';
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((item) => (item.textContent || '').trim());
    return {
      title: text.includes('AI Analysis'),
      tabs,
      whiteScreen: text.trim().length < 200,
      forbiddenDirectOpenAi: /OpenAI API|OpenAI Base URL|OPENAI_API_KEY|下載已分析 JSON|ANALYSIS DETAIL/.test(text),
      buildTime: text.includes('Build Time'),
      bodyLength: text.length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth
    };
  })()`);
  audit.analyzers = ["ChatGPT 分析", "地端 AI 分析", "離線分析"].every((label) => observedText["分析工作區"].includes(label));
  audit.workspaceStructure = ["共用分析依據", "選擇分析方式", "選擇資料檔"].every((label) => observedText["分析工作區"].includes(label));
  audit.resultsStructure = observedText["Activity Events 分析結果"].includes("選擇資料檔");
  fs.writeFileSync(path.join(output, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  socket.close();
  if (!audit.title || audit.tabs.length !== 3 || audit.whiteScreen || audit.forbiddenDirectOpenAi || !audit.analyzers || !audit.workspaceStructure || !audit.resultsStructure || !audit.buildTime || audit.horizontalOverflow) {
    throw new Error(`UI audit failed: ${JSON.stringify(audit)}`);
  }
  console.log(JSON.stringify({ ok: true, output, audit }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
