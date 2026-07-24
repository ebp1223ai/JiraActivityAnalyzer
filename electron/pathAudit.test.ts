import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPathAudit } from "./pathAudit.js";

const parent = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-path-audit-"));
const appRoot = path.join(parent, "App");
const sibling = path.join(parent, "Application");
fs.mkdirSync(appRoot, { recursive: true });
fs.mkdirSync(sibling, { recursive: true });

try {
  const passed = buildPathAudit({
    appRoot,
    executablePath: path.join(appRoot, "app.exe"),
    isPackaged: true,
    paths: {
      logs: path.join(appRoot, "logs"),
      traversalNormalizedInside: path.join(appRoot, "data", "..", "exports")
    }
  });
  assert.equal(passed.containment.allInsideAppRoot, true);
  assert.equal(passed.writablePreflight.status, "passed");

  const failed = buildPathAudit({
    appRoot,
    executablePath: path.join(appRoot, "app.exe"),
    isPackaged: true,
    paths: {
      siblingPrefixAttack: path.join(sibling, "logs"),
      traversalOutside: path.join(appRoot, "..", "outside")
    }
  });
  assert.equal(failed.containment.allInsideAppRoot, false);
  assert.deepEqual(failed.containment.violations.map((item) => item.name).sort(), ["siblingPrefixAttack", "traversalOutside"]);
  assert.equal(JSON.stringify(failed).includes("token"), false);
  console.log("Path audit tests passed: containment, sibling-prefix and traversal violations.");
} finally {
  fs.rmSync(parent, { recursive: true, force: true });
}
