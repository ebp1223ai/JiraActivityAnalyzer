const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, session } = require("electron");

const reportPath = path.resolve(process.argv[2] || "");
const outputDir = path.resolve(process.argv[3] || "test-artifacts/v0.3.11-golden-report");
if (!fs.existsSync(reportPath)) throw new Error(`Golden report not found: ${reportPath}`);

async function capture(window, fileName) {
  await new Promise((resolve) => setTimeout(resolve, 200));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDir, fileName), image.toPNG());
}

app.whenReady().then(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const externalRequests = [];
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (!details.url.startsWith("file:")) externalRequests.push(details.url);
    callback({ cancel: !details.url.startsWith("file:") });
  });
  const window = new BrowserWindow({ show: false, width: 1600, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await window.loadFile(reportPath);
  await capture(window, "1-summary.png");
  const audit = await window.webContents.executeJavaScript(`(() => {
    const events = [...document.querySelectorAll('.event')];
    const requiredControls = ['search','actor','issue','group','status','attention','expand','collapse','print'];
    return {
      title: document.title,
      eventCount: events.length,
      controlsPresent: requiredControls.every((id) => document.getElementById(id)),
      visibleCount: document.getElementById('visibleCount')?.textContent || '',
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth,
      externalAssetTags: document.querySelectorAll('script[src],img[src],link[href]').length,
      bodyLength: document.body.innerText.length
    };
  })()`);
  await window.webContents.executeJavaScript(`(() => { const event=document.querySelector('.event'); event?.querySelector('.event-head')?.click(); event?.scrollIntoView({block:'start'}); })()`);
  await capture(window, "2-expanded-evidence.png");
  await window.webContents.executeJavaScript(`(() => { const select=document.getElementById('status'); select.value='EXCLUDED'; select.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('events')?.scrollIntoView({block:'start'}); })()`);
  await capture(window, "3-excluded-filter.png");
  audit.externalRequests = externalRequests;
  audit.appOnlyCapture = true;
  fs.writeFileSync(path.join(outputDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  window.destroy();
  if (!audit.controlsPresent || audit.eventCount < 1 || audit.horizontalOverflow || audit.externalAssetTags || externalRequests.length) throw new Error(`Golden report audit failed: ${JSON.stringify(audit)}`);
  console.log(JSON.stringify({ ok: true, reportPath, outputDir, audit }));
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });