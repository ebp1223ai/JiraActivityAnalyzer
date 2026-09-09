import fs from 'node:fs';
import { aiResultsServiceV044 } from './aiResultsServiceV044.js';
import { automaticDiagnosticsV044 } from './automaticDiagnosticsV044.js';
import path from 'node:path';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { app, BrowserWindow, dialog } from 'electron';

// Explicit isolated test capability; normal production launches expose no control listener.
export function prepareUiTestV044(root: string) {
  const nonce = process.env.JAA_UI_TEST_NONCE ?? '';
  if (process.env.JAA_UI_TEST_MODE !== '1' || !/^[a-f0-9]{64}$/.test(nonce)) return;
  const marker = path.join(root, '.jaa-ui-test.json');
  let config: any;
  try { config = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch { return; }
  if (config.nonce !== nonce || config.syntheticOnly !== true) return;
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
  app.commandLine.appendSwitch('remote-debugging-port', '0');
  return async () => {
    let pendingPicker: ((value: Electron.SaveDialogReturnValue) => void) | null = null;
    let workbench: BrowserWindow | null = null; let downloadState: Record<string, unknown> = {};
    const server = http.createServer(async (req, res) => {
      const supplied = req.headers['x-jaa-test-nonce'];
      if (typeof supplied !== 'string' || supplied.length !== nonce.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(nonce))) { res.writeHead(403); res.end(); return; }
      const window = BrowserWindow.getAllWindows()[0];
      try {
        if (req.url === '/ready') {
          const port = fs.readFileSync(path.join(app.getPath('sessionData'), 'DevToolsActivePort'), 'utf8').split('\n')[0];
          res.end(JSON.stringify({ pid: process.pid, exe: app.getPath('exe'), appRoot: root, version: app.getVersion(), port: Number(port), ready: Boolean(window?.webContents.getURL()) }));
        }
        else if (req.url === '/fault/main-hang') { res.end('{}'); setTimeout(() => { const end = performance.now() + 13000; while (performance.now() < end) { /* isolated fault */ } }, 50); }
        else if (req.url === '/fault/renderer-hang') { res.end('{}'); void window.webContents.executeJavaScript('(() => { const end = performance.now() + 13000; while (performance.now() < end) {} })()').catch(() => {}); }
        else if (req.url === '/fault/renderer-crash') { res.end('{}'); setTimeout(() => window.webContents.forcefullyCrashRenderer(), 50); }
        else if (req.url === '/fault/exit-after-durable-start') { automaticDiagnosticsV044()?.armIsolatedStartAckFault(() => app.exit(74)); res.end('{}'); }
        else if (req.url === '/fault/main-exit') { res.end('{}'); setTimeout(() => app.exit(73), 50); }
        else if (req.url === '/hold-test-query') { aiResultsServiceV044.holdTestQuery(); res.end('{}'); }
        else if (req.url === '/test-query-state') { res.end(JSON.stringify(aiResultsServiceV044.testQueryState())); }
        else if (req.url === '/release-test-query') { aiResultsServiceV044.releaseTestQuery(); res.end('{}'); }
        else if (req.url === '/capture') { res.setHeader('Content-Type', 'image/png'); res.end((await window.capturePage(undefined, { stayHidden: true })).toPNG()); }
        else if (req.url?.startsWith('/resize?')) {
          const params = new URL(req.url, 'http://127.0.0.1').searchParams;
          const width = Number(params.get('width')), height = Number(params.get('height'));
          if (![800,1024,1280,1366,1440,1600,1920].includes(width) || ![600,720,768,900,1080].includes(height)) throw Error('SIZE_NOT_ALLOWED');
          window.setMinimumSize(400,300); window.setContentSize(width,height); res.end('{}');
        } else if (req.url === '/hold-test-export') {
          if (pendingPicker) throw Error('PICKER_ALREADY_PENDING');
          const original = dialog.showSaveDialog;
          (dialog as any).showSaveDialog = () => { dialog.showSaveDialog = original; return new Promise<Electron.SaveDialogReturnValue>(resolve => { pendingPicker = resolve; }); };
          res.end('{}');
        } else if (req.url === '/test-export-state') { res.end(JSON.stringify({pending: Boolean(pendingPicker)}));
        } else if (req.url === '/release-test-export' || req.url === '/cancel-test-export') {
          if (!pendingPicker) throw Error('NO_PENDING_PICKER');
          pendingPicker({ canceled: req.url === '/cancel-test-export', filePath: path.join(root,'exports','synthetic-table-export.json') }); pendingPicker = null; res.end('{}');
        } else if (req.url === '/select-test-export') {
          const original = dialog.showSaveDialog;
          (dialog as any).showSaveDialog = async () => { dialog.showSaveDialog = original; return { canceled: false, filePath: path.join(root,'exports','synthetic-table-export.json') }; };
          res.end('{}');
        } else if (req.url?.startsWith('/workbench?')) {
          const version = new URL(req.url, 'http://127.0.0.1').searchParams.get('version');
          if (!['2.0.0','2.0.1'].includes(version ?? '')) throw Error('VERSION_NOT_ALLOWED');
          workbench?.close();
          workbench = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, partition: 'test-workbench-' + version } });
          const out = path.join(root, 'exports', 'workbench-test-' + version + '.json');fs.mkdirSync(path.dirname(out), { recursive: true });
          downloadState = { status: 'waiting', output: out };
          workbench.webContents.session.on('will-download', (_event, item) => { downloadState = { status: 'downloading', output: out }; item.setSavePath(out); item.once('done', (_event, state) => { downloadState = { status: state, output: out }; }); });
          await workbench.loadFile(path.join(app.isPackaged ? path.join(process.resourcesPath,'ai-analysis-contracts') : path.join(app.getAppPath(),'contracts','ai-analysis'), 'Skill_Analysis_Review_Workbench_v1.13.2.html'));res.end('{}');
        } else if (req.url === '/workbench-state') { res.end(JSON.stringify(downloadState)); }
        else if (req.url === '/workbench-close') { workbench?.close(); workbench = null;res.end('{}'); }
        else if (req.url === '/quit') { res.end('{}'); setTimeout(() => app.quit(), 10); }
        else { res.writeHead(404); res.end(); }
      } catch { res.writeHead(503); res.end('{}'); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    fs.writeFileSync(path.join(root, '.jaa-ui-ready.json'), JSON.stringify({ controlPort: address.port, pid: process.pid }));
    app.once('will-quit', () => server.close());
  };
}
