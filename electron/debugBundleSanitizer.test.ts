import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { directoryZipEntries, sanitizeFileForBundle, sanitizedCopyTree, verifySanitizedFiles } from "./debugBundleSanitizer.js";
import { createSanitizationContext, sanitizeExportData, sanitizeTextForBundle } from "./export/sanitizeExport.js";
import { createStreamingZip, verifyStreamingZip } from "./streamingZip.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-debug-bundle-"));
try {
  const source = path.join(root, "source.ndjson");
  const destination = path.join(root, "bundle", "evidence.ndjson");
  const bundleContext = createSanitizationContext("synthetic-bundle-secret-a");
  fs.writeFileSync(source, `${JSON.stringify({ emailAddress: "user.one@example.invalid", accountId: "synthetic-account-123", displayName: "Synthetic User One", authorization: "Bearer synthetic-secret-token", url: "https://jira.invalid/path?token=synthetic-secret", profilePath: "C:\\Users\\SyntheticUser\\AppData\\Local", summary: "Keep this Issue summary", comments: ["user.one@example.invalid commented"] })}\n`, "utf8");
  const transformation = sanitizeFileForBundle(source, destination, bundleContext);
  const body = fs.readFileSync(destination, "utf8");
  assert.doesNotThrow(() => JSON.parse(body.trim()), "sanitizing JSON text must preserve its structure");
  assert.doesNotMatch(body, /user\.one@example\.invalid|synthetic-account-123|Synthetic User One|synthetic-secret-token|token=synthetic-secret|\\SyntheticUser\\/);
  assert.match(body, /Keep this Issue summary/);
  assert.notEqual(transformation.source.sha256, transformation.sanitized.sha256);
  const firstEmail = sanitizeTextForBundle("user.one@example.invalid", bundleContext);
  assert.equal(firstEmail, sanitizeTextForBundle("user.one@example.invalid", bundleContext), "pseudonyms must be deterministic within one bundle");
  assert.notEqual(firstEmail, sanitizeTextForBundle("user.one@example.invalid", createSanitizationContext("synthetic-bundle-secret-b")), "separate bundles must not share a stable identity mapping");
  assert.equal(sanitizeTextForBundle(firstEmail, bundleContext), firstEmail, "identity pseudonyms must be idempotent");
  const credentialText = "Authorization: secret-value\ntoken: secret-value\nJSESSIONID: secret-value";
  const sanitizedCredentialText = sanitizeTextForBundle(credentialText);
  assert.doesNotMatch(sanitizedCredentialText, /secret-value/);
  assert.equal(sanitizeTextForBundle(sanitizedCredentialText), sanitizedCredentialText, "credential masking must be idempotent");
  const sanitized = sanitizeExportData({ password: "synthetic-secret", cookie: "JSESSIONID=synthetic-secret", displayName: "Synthetic User One", description: "Description remains" }, bundleContext) as Record<string, unknown>;
  assert.equal(sanitized.password, "[masked]"); assert.equal(sanitized.cookie, "[masked]"); assert.notEqual(sanitized.displayName, "Synthetic User One"); assert.equal(sanitized.description, "Description remains");

  const treeSource = path.join(root, "tree-source");
  const treeBundle = path.join(root, "tree-bundle");
  fs.mkdirSync(treeSource);
  fs.writeFileSync(path.join(treeSource, "one.json"), JSON.stringify({ username: "synthetic-user", email: "user.one@example.invalid" }), "utf8");
  fs.writeFileSync(path.join(treeSource, "two.ndjson"), `${JSON.stringify({ actor: "user.one@example.invalid" })}\n`, "utf8");
  const manifest = sanitizedCopyTree(treeSource, treeBundle, bundleContext);
  assert.equal(manifest.length, 2);
  assert.deepEqual(verifySanitizedFiles(treeBundle, manifest), { verified: true, verifiedCount: 2 });
  assert.equal(sanitizeTextForBundle("user.one@example.invalid", bundleContext), JSON.parse(fs.readFileSync(path.join(treeBundle, "two.ndjson"), "utf8")).actor);

  const zipPath = path.join(root, "debug-bundle.zip");
  const zip = createStreamingZip(zipPath, directoryZipEntries(path.join(root, "bundle")));
  assert.equal(verifyStreamingZip(zipPath, zip.entries).length, zip.entries.length);
  fs.appendFileSync(path.join(treeBundle, "one.json"), "tampered", "utf8");
  assert.throws(() => verifySanitizedFiles(treeBundle, manifest), /hash mismatch/);
  const failedZip = path.join(root, "failed.zip");
  assert.throws(() => createStreamingZip(failedZip, [{ name: "missing.json", filePath: path.join(root, "missing.json") }]));
  assert.equal(fs.existsSync(failedZip), false);
  assert.equal(fs.readdirSync(root).some((name) => name.startsWith("failed.zip.") && name.endsWith(".tmp")), false);
  console.log("Debug Bundle sanitizer and streaming ZIP failure tests passed.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
