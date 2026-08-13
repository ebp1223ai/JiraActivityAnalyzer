const path = require("node:path");
const { build } = require("esbuild");

async function run() {
  const root = path.resolve(__dirname, "..");
  const outfile = path.join(root, "node_modules", ".cache", "v0314-test.cjs");
  await build({ entryPoints: [path.join(root, "tests", "v0314RequestConversationContract.test.ts")], bundle: true, platform: "node", format: "cjs", target: "node22", outfile });
  delete require.cache[require.resolve(outfile)];
  require(outfile);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
