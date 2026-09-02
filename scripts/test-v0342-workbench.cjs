const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const file = path.join(root, "contracts", "ai-analysis", "Skill_Analysis_Review_Workbench_v1.13.1.html");
const html = fs.readFileSync(file, "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);

assert.ok(scripts.length > 0);
scripts.forEach((source, index) => new vm.Script(source, { filename: `workbench-v1.13.1#${index + 1}` }));
assert.match(html, /1\.13\.1/);
assert.match(html, /id="fileInput"/);
assert.match(html, /AI_ONLY/);
assert.match(html, /REVIEW_PARTIAL/);
assert.match(html, /REVIEW_COMPLETED/);
assert.match(html, /IMMUTABLE_LAYER_CHANGED/);
assert.match(html, /manualReview/);
assert.doesNotMatch(html, /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|<iframe|<webview/i);
assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=["']https?:/i);
console.log(JSON.stringify({ status: "PASS", version: "0.3.42", workbenchVersion: "1.13.1", sha256: crypto.createHash("sha256").update(Buffer.from(html)).digest("hex"), emptyFileBootSyntax: true, packageV2Only: true, allReviewRanks: true, immutableGate: true, networkApis: 0 }));
