const fs = require("node:fs");
const path = require("node:path");
const port = Number(process.argv[2] || 9341);
const output = path.resolve(process.argv[3] || "test-artifacts/v0.3.11-packaged-smoke");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function findTarget() {
  const deadline = Date.now() + 30000;
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
  socket.addEventListener("message", (event) => { const value=JSON.parse(String(event.data)); if(!pending.has(value.id))return; const pair=pending.get(value.id); pending.delete(value.id); value.error?pair.reject(new Error(value.error.message)):pair.resolve(value.result); });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params}));});
  return { socket, send };
}
async function value(send, expression) { const result=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true}); if(result.exceptionDetails)throw new Error(result.exceptionDetails.text); return result.result.value; }
async function capture(send, name) { await sleep(250); const result=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false}); fs.writeFileSync(path.join(output,name),Buffer.from(result.data,"base64")); }
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const target=await findTarget(); const {socket,send}=await connect(target.webSocketDebuggerUrl);
  await send("Page.enable"); await send("Runtime.enable");
  await value(send,`location.hash='#/ai-analysis'`); await sleep(1800);
  const tabCount=await value(send,`document.querySelectorAll('[role="tab"]').length`);
  const tabLabels=[];
  for(let index=0;index<tabCount;index+=1){
    const label=await value(send,`(() => { const tab=document.querySelectorAll('[role="tab"]')[${index}]; tab?.click(); return (tab?.textContent||'').trim(); })()`);
    tabLabels.push(label); await capture(send,`${index+1}-tab.png`);
  }
  const audit=await value(send,`(() => { const text=document.body.innerText||''; return {url:location.href,title:document.title,bodyLength:text.length,tabCount:document.querySelectorAll('[role="tab"]').length,buildTime:text.includes('Build Time'),version:text.includes('0.3.11'),whiteScreen:text.trim().length<300,horizontalOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth||document.body.scrollWidth>document.body.clientWidth}; })()`);
  audit.tabLabels=tabLabels; audit.appOnlyCapture=true;
  fs.writeFileSync(path.join(output,"audit.json"),`${JSON.stringify(audit,null,2)}\n`,"utf8"); socket.close();
  if(audit.tabCount!==3||audit.whiteScreen||audit.horizontalOverflow||!audit.buildTime||!audit.version)throw new Error(`Packaged UI audit failed: ${JSON.stringify(audit)}`);
  console.log(JSON.stringify({ok:true,output,audit}));
})().catch((error)=>{console.error(error);process.exitCode=1;});