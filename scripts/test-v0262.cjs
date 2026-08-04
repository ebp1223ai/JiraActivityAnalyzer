const path = require("node:path");
const { build } = require("esbuild");
const root = path.resolve(__dirname, "..");
const outfile = path.join(root, "node_modules", ".cache", "v0262-issue-changelog-all-users-test.cjs");
build({ entryPoints: [path.join(root, "tests", "v0262IssueChangelogAllUsers.test.ts")], bundle: true, platform: "node", format: "cjs", outfile })
  .then(() => require(outfile)).catch((error) => { console.error(error); process.exitCode = 1; });
