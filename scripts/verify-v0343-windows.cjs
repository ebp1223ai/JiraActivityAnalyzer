const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const release = path.resolve(process.env.JAA_DIST_OUTPUT_DIR || path.join(root, 'release'));
const work = path.join(root, 'test-artifacts/v0.3.43', `windows-${Date.now()}`);
fs.mkdirSync(work, { recursive: true });
const report = { version: '0.3.43', status: 'RUNNING', startedAt: new Date().toISOString(), manualGui: 'PENDING', installerInstallUninstall: 'NOT_RUN', checks: [], artifacts: [] };
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function runUi(name, executable, appRoot, reopen = false) {
  const evidence = path.join(work, name);
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(__dirname, 'test-v0343-ui.cjs')], {
    cwd: root, encoding: 'utf8', timeout: 240000, windowsHide: true,
    env: { ...process.env, JAA_UI_EXECUTABLE: executable, JAA_UI_APP_ROOT: appRoot, JAA_UI_EVIDENCE: evidence, JAA_UI_SHORT: '1', JAA_UI_REOPEN_ONLY: reopen ? '1' : '0' }
  });
  fs.writeFileSync(path.join(work, `${name}.log`), `${result.stdout || ''}\n${result.stderr || ''}`);
  report.checks.push({ name, exitCode: result.status, durationMs: Date.now() - started, evidence, error: result.error?.message });
  assert.equal(result.status, 0, `${name}: ${result.stderr || result.error || result.stdout}`);
  const ui = JSON.parse(fs.readFileSync(path.join(evidence, 'report.json')));
  assert.equal(ui.status, 'PASS');
  assert.equal(ui.runtime.version, '0.3.43');
  assert.ok(ui.runtime.userData.toLowerCase().startsWith(appRoot.toLowerCase() + path.sep), JSON.stringify(ui.runtime));
  return ui;
}
try {
  const names = ['Jira Activity Analyzer Setup 0.3.43.exe', 'Jira Activity Analyzer Portable 0.3.43.exe', 'win-unpacked/Jira Activity Analyzer.exe'];
  for (const name of names) {
    const file = path.join(release, name);
    const bytes = fs.statSync(file).size;
    assert.ok(bytes > 1000000);
    report.artifacts.push({ path: file, bytes, MiB: bytes / 1048576, sha256: digest(file) });
  }
  const archive = path.join(release, 'win-unpacked/resources/app.asar');
  const entries = asar.listPackage(archive);
  const prohibited = entries.filter(x => /(?:^|[\\/])(?:test-artifacts|fixtures|@playwright|playwright-core|08_private_local_only|token\.txt|\.env|backups)(?:[\\/]|$)|\.(?:sqlite3?|db|7z|zip)$/i.test(x));
  assert.deepEqual(prohibited, [], JSON.stringify(prohibited));
  const assets = ['jaa-ai-analysis-package_v2.0.0.schema.json', 'jaa-ai-analysis-package_v2.0.1.schema.json', 'jaa-source-trace_v1.0.0.schema.json', 'Skill_Analysis_Review_Workbench_v1.13.2.html'];
  report.assetHashes = assets.map(name => {
    const entry = entries.find(x => x.endsWith('/' + name) || x.endsWith('\\' + name));
    const external = path.join(release, 'win-unpacked/resources/ai-analysis-contracts', name);
    const bytes = entry ? asar.extractFile(archive, entry.replace(/^[\\/]/, '')) : fs.readFileSync(external);
    const expected = digest(path.join(root, 'contracts/ai-analysis', name));
    const observed = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(observed, expected, name); return { name, sha256: observed };
  });
  report.buildInfo = JSON.parse(fs.readFileSync(path.join(release, 'build-info.json')));
  const unpacked = path.join(release, 'win-unpacked');
  runUi('win-unpacked', path.join(unpacked, 'Jira Activity Analyzer.exe'), unpacked);
  const a = path.join(work, 'portable-root-a'), b = path.join(work, 'portable-root-b');
  assert.ok(!fs.existsSync(a) && !fs.existsSync(b));
  fs.mkdirSync(a);
  const portableName = names[1];
  fs.copyFileSync(path.join(release, portableName), path.join(a, portableName), fs.constants.COPYFILE_EXCL);
  runUi('portable-initial', path.join(a, portableName), a);
  // Copy the complete isolated root; never move/delete any pre-existing user data.
  fs.cpSync(a, b, { recursive: true, errorOnExist: true, force: false });
  runUi('portable-relocated', path.join(b, portableName), b, true);
  report.relocation = { original: a, relocated: b, method: 'complete isolated APP_ROOT copy; original retained', status: 'PASS' };
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = error.stack || String(error); console.error(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(work, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Windows evidence: ${work}`);
}
