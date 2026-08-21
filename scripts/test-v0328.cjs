const { spawnSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
for (const command of [
  ["node", ["scripts/test-runtime-manifest-contract-v0328.cjs"]],
  ["node", ["scripts/test-v0327.cjs"]],
  ["node", ["scripts/test-v0326.cjs"]]
]) {
  const result = spawnSync(command[0], command[1], { cwd: root, stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
