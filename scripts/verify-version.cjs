const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const versionFile = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();
if (packageJson.version !== versionFile) {
  console.error(`Version mismatch: package.json=${packageJson.version} VERSION=${versionFile}`);
  process.exit(1);
}
console.log(`Version sources verified: ${packageJson.version}`);
