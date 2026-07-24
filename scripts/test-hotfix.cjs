const path = require("node:path");
const { build } = require("esbuild");

const root = path.resolve(__dirname, "..");
const tests = [
  "queueTransitionHotfix.test.ts",
  "persistentDiagnostics.test.ts",
  "pathAudit.test.ts",
  "hotfixArchitecture.test.ts"
];

(async () => {
  for (const test of tests) {
    const outfile = path.join(root, "node_modules", ".cache", `${path.basename(test, ".test.ts")}.cjs`);
    await build({
      entryPoints: [path.join(root, "electron", test)],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile
    });
    require(outfile);
  }
  const rendererDiagnosticsOutfile = path.join(root, "node_modules", ".cache", "rendererDiagnostics-test.cjs");
  await build({
    entryPoints: [path.join(root, "src", "diagnostics", "rendererDiagnostics.ts")],
    bundle: true,
    platform: "browser",
    format: "cjs",
    outfile: rendererDiagnosticsOutfile,
    define: {
      __BUILD_TIME__: JSON.stringify("test"),
      __APP_VERSION__: JSON.stringify("0.2.33"),
      __GIT_COMMIT__: JSON.stringify("test"),
      __GIT_BRANCH__: JSON.stringify("test")
    }
  });
  const assert = require("node:assert/strict");
  const rendererDiagnostics = require(rendererDiagnosticsOutfile);
  assert.equal(rendererDiagnostics.maskRendererDiagnosticText("Authorization: Bearer secret-value").includes("secret-value"), false);
  assert.equal(rendererDiagnostics.maskRendererDiagnosticText("token: secret-value").includes("secret-value"), false);
  const circular = { label: "test" };
  circular.self = circular;
  assert.equal(JSON.stringify(rendererDiagnostics.safeDiagnosticValue(circular)).includes("[circular]"), true);
  assert.equal(JSON.stringify(rendererDiagnostics.safeDiagnosticValue(new Error("Authorization: Bearer secret-value"))).includes("secret-value"), false);
  assert.equal(rendererDiagnostics.safeDiagnosticValue("plain rejection"), "plain rejection");
  console.log("Renderer diagnostics tests passed: Error, string, circular rejection and credential masking.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
