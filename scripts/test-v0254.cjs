const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
const version = read("VERSION").trim();
const changelog = read("CHANGELOG.md");
const viteConfig = read("vite.config.ts");
const electronBuild = read("scripts/build-electron.cjs");
const electronMain = read("electron/main.ts");

assert.equal(version, "0.2.54");
assert.equal(packageJson.version, version);
assert.equal(packageLock.version, version);
assert.equal(packageLock.packages[""].version, version);
assert.match(changelog, /^## 0\.2\.54 - Development Manual Verification Candidate/);

assert.match(packageJson.scripts.dev, /vite --host 127\.0\.0\.1/);
assert.match(packageJson.scripts.dev, /wait-on http:\/\/127\.0\.0\.1:5173/);
assert.match(packageJson.scripts.dev, /npm run electron:dev/);
assert.match(packageJson.scripts["electron:dev"], /electron dist-electron\/main\.cjs/);
assert.match(viteConfig, /__APP_VERSION__:\s*JSON\.stringify\(packageJson\.version\)/);
assert.match(electronBuild, /__MAIN_APP_VERSION__:\s*JSON\.stringify\(packageJson\.version\)/);
assert.match(electronMain, /const devServerUrl = process\.env\.VITE_DEV_SERVER_URL/);
assert.match(electronMain, /window\.loadURL\(devServerUrl\)/);
assert.match(electronMain, /developmentRoot:\s*process\.env\.JAA_DEV_APP_ROOT \|\| path\.resolve\(__dirname, "\.\.\/\.runtime"\)/);

assert.match(read("electron/currentStateArchive.ts"), /CURRENT_STATE_SCHEMA_VERSION = 3/);
assert.match(read("electron/activityEvents.ts"), /EVENT_IDENTITY_POLICY_VERSION = 3/);
assert.equal(packageJson.scripts.dist, "node scripts/dist-electron.cjs");

console.log("v0.2.54 focused checks passed: version consistency, Electron Development Mode, schema v3, and event identity policy v3.");
