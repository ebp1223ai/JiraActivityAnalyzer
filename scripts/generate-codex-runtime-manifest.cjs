const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageRoot = path.join(root, "node_modules", "@openai", "codex-win32-x64");
const vendorRoot = path.join(packageRoot, "vendor", "x86_64-pc-windows-msvc");
const executable = path.join(vendorRoot, "bin", "codex.exe");
const packageMetadata = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const expectedVersion = "0.147.0-win32-x64";
if (packageMetadata.version !== expectedVersion) throw new Error(`CODEX_BUNDLED_RUNTIME_VERSION_MISMATCH: expected ${expectedVersion}, received ${packageMetadata.version}`);
if (!fs.statSync(executable).isFile()) throw new Error("CODEX_BUNDLED_RUNTIME_MISSING");
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(executable)).digest("hex");
const manifest = {
  schemaVersion: "jaa-codex-runtime-manifest-v1", source: "bundled", runtimeMode: "BUNDLED_ONLY", version: "0.147.0", packageVersion: packageMetadata.version,
  platform: "win32", arch: "x64", relativeExecutablePath: "bin/codex.exe", sha256, license: packageMetadata.license,
  licenseSource: "docs/CODEX_RUNTIME_NOTICE.txt", packageSource: packageMetadata.repository?.url ?? "https://github.com/openai/codex",
  systemPathDiscovery: false, externalFallback: false, autoDownload: false
};
const destination = path.join(root, "dist-electron", "codex-runtime-manifest.json");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`  codex runtime manifest  version=${manifest.version} sha256=${sha256}`);
