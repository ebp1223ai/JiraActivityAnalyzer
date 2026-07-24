const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const asar = require("@electron/asar");

const projectRoot = path.resolve(__dirname, "..");
const releaseDir = path.join(projectRoot, "release");
const unpackedDir = path.join(releaseDir, "win-unpacked");
const resourcesDir = path.join(unpackedDir, "resources");
const appAsarPath = path.join(resourcesDir, "app.asar");
const appAsarUnpackedDir = path.join(resourcesDir, "app.asar.unpacked");
const label = process.argv[2] || "audit";
const outputPath = path.resolve(process.argv[3] || path.join(projectRoot, "test-artifacts", `package-size-${label}.json`));

function mib(bytes) {
  return Number((bytes / 1024 / 1024).toFixed(3));
}

function fileSize(filePath) {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile()) files.push({ absolute, relative: path.relative(root, absolute).replaceAll("\\", "/"), bytes: fs.statSync(absolute).size });
    }
  }
  return files;
}

function totalBytes(root) {
  return walkFiles(root).reduce((sum, item) => sum + item.bytes, 0);
}

function classify(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  if (/(^|\/)(test|tests|fixtures|coverage|debug|docs?)(\/|$)|\.map$/.test(normalized)) return "Test／Development Artifact";
  if (normalized.includes("node_modules/") && /\.(node|dll|exe)$/.test(normalized)) return "Native Module";
  if (normalized.includes("node_modules/")) return "Production Dependency";
  if (normalized.startsWith("resources/app.asar/dist/") || normalized.startsWith("resources/app.asar/dist-electron/") || normalized.endsWith("resources/app.asar/package.json")) return "Application Code";
  if (/\.(png|jpe?g|gif|svg|ico|woff2?|ttf|pak)$/.test(normalized)) return "Static Asset";
  if (/\.(dll|exe|bin|dat|pak|blob)$/.test(normalized) || /locales\/.+\.pak$/.test(normalized)) return "Electron Required Runtime";
  return "Application Code";
}

function necessaryReason(category, relativePath) {
  if (category === "Electron Required Runtime") return { necessary: true, basis: "Electron／Chromium／Node 啟動所需的基礎執行元件。" };
  if (category === "Native Module") return { necessary: true, basis: "目前封裝依賴的目標平台原生元件；需以冒煙測試確認後才能調整。" };
  if (category === "Application Code") return { necessary: true, basis: "正式應用程式程式碼或封裝中繼資料。" };
  if (category === "Static Asset") return { necessary: true, basis: "Electron 或應用程式執行時載入的靜態資產。" };
  if (category === "Test／Development Artifact") return { necessary: false, basis: "正式套件不應包含的測試或開發產物。" };
  return { necessary: true, basis: `正式執行依賴：${relativePath.split("/node_modules/")[1]?.split("/").slice(0, 2).join("/") || "套件內容"}。` };
}

function decorate(relativePath, bytes) {
  const category = classify(relativePath);
  return { path: relativePath, bytes, mib: mib(bytes), category, ...necessaryReason(category, relativePath) };
}

function directoryTotals(files) {
  const totals = new Map();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const directory = parts.slice(0, index).join("/");
      totals.set(directory, (totals.get(directory) || 0) + file.bytes);
    }
  }
  return [...totals].map(([directory, bytes]) => ({ path: directory, bytes, mib: mib(bytes) })).sort((a, b) => b.bytes - a.bytes);
}

function findArtifact(prefix) {
  const match = fs.readdirSync(releaseDir).find((name) => name.startsWith(prefix) && name.endsWith(".exe"));
  return match ? path.join(releaseDir, match) : "";
}

function asarFiles() {
  if (!fs.existsSync(appAsarPath)) return [];
  return asar.listPackage(appAsarPath).flatMap((entry) => {
    try {
      const stat = asar.statFile(appAsarPath, entry.slice(1), false);
      if (stat.files || stat.unpacked) return [];
      return [decorate(`resources/app.asar/${entry.slice(1).replaceAll("\\", "/")}`, stat.size || 0)];
    } catch {
      return [];
    }
  });
}

function duplicateGroups(files) {
  const candidates = files.filter((file) => file.bytes >= 100 * 1024 && !file.path.includes("resources/app.asar/"));
  const hashes = new Map();
  for (const file of candidates) {
    const absolute = path.join(unpackedDir, file.path.replaceAll("/", path.sep));
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
    const hash = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
    const group = hashes.get(hash) || [];
    group.push(file);
    hashes.set(hash, group);
  }
  return [...hashes.values()].filter((group) => group.length > 1).map((group) => ({
    bytesEach: group[0].bytes,
    mibEach: group[0].mib,
    paths: group.map((file) => file.path)
  }));
}

if (!fs.existsSync(unpackedDir) || !fs.existsSync(appAsarPath)) {
  throw new Error("找不到 release/win-unpacked 或 resources/app.asar，請先執行 Windows 封裝。");
}

const physicalFiles = walkFiles(unpackedDir).map((item) => decorate(item.relative, item.bytes));
const virtualAsarFiles = asarFiles();
const combinedFiles = [...physicalFiles, ...virtualAsarFiles].sort((a, b) => b.bytes - a.bytes);
const unpackedNodeModulesBytes = walkFiles(path.join(appAsarUnpackedDir, "node_modules")).reduce((sum, item) => sum + item.bytes, 0);
const packedNodeModulesBytes = virtualAsarFiles.filter((item) => item.path.startsWith("resources/app.asar/node_modules/")).reduce((sum, item) => sum + item.bytes, 0);
const installerPath = findArtifact("Jira Activity Analyzer Setup");
const portablePath = findArtifact("Jira Activity Analyzer Portable");
const unexpectedPatterns = virtualAsarFiles.filter((item) => item.category === "Test／Development Artifact").slice(0, 200);
const report = {
  label,
  auditedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  electronVersion: require("electron/package.json").version,
  asarEnabled: true,
  asarUnpackActualScope: fs.existsSync(appAsarUnpackedDir) ? "resources/app.asar.unpacked/**" : "none",
  metrics: {
    installer: { path: path.basename(installerPath), bytes: fileSize(installerPath), mib: mib(fileSize(installerPath)) },
    portable: { path: path.basename(portablePath), bytes: fileSize(portablePath), mib: mib(fileSize(portablePath)) },
    winUnpacked: { bytes: totalBytes(unpackedDir), mib: mib(totalBytes(unpackedDir)) },
    appAsar: { bytes: fileSize(appAsarPath), mib: mib(fileSize(appAsarPath)) },
    appAsarUnpacked: { exists: fs.existsSync(appAsarUnpackedDir), bytes: totalBytes(appAsarUnpackedDir), mib: mib(totalBytes(appAsarUnpackedDir)) },
    resources: { bytes: totalBytes(resourcesDir), mib: mib(totalBytes(resourcesDir)) },
    packagedNodeModules: {
      packedBytes: packedNodeModulesBytes,
      unpackedBytes: unpackedNodeModulesBytes,
      bytes: packedNodeModulesBytes + unpackedNodeModulesBytes,
      mib: mib(packedNodeModulesBytes + unpackedNodeModulesBytes)
    }
  },
  largestFiles: combinedFiles.slice(0, 50),
  largestDirectories: directoryTotals(combinedFiles).map((item) => ({
    ...item,
    packagePercentage: Number(((item.bytes / totalBytes(unpackedDir)) * 100).toFixed(2))
  })).slice(0, 20),
  capacityByCategory: Object.entries(combinedFiles.reduce((totals, item) => {
    totals[item.category] = (totals[item.category] || 0) + item.bytes;
    return totals;
  }, {})).map(([category, bytes]) => ({ category, bytes, mib: mib(bytes) })).sort((a, b) => b.bytes - a.bytes),
  duplicatePhysicalFiles: duplicateGroups(physicalFiles),
  unexpectedPackagedContent: unexpectedPatterns,
  notes: [
    "app.asar 虛擬檔案與 win-unpacked 實體檔案同時列入檔案／目錄排行；app.asar 容器因此與其內容是兩種不同觀察口徑。",
    "Production Dependencies 為 app.asar 內 node_modules 非 unpacked 檔案，加上 app.asar.unpacked/node_modules 實體檔案。",
    "重複檔案偵測只掃描 100 KiB 以上的 win-unpacked 實體檔案，避免把 app.asar 虛擬內容重複計算。"
  ]
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, metrics: report.metrics, largestFileCount: report.largestFiles.length, largestDirectoryCount: report.largestDirectories.length, unexpectedCount: unexpectedPatterns.length }, null, 2));
