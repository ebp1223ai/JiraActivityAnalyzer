import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { directoryZipEntries, sanitizeFileForBundle } from "./debugBundleSanitizer.js";
import { sanitizeExportData, sanitizeTextForBundle } from "./export/sanitizeExport.js";
import { createStreamingZip, verifyStreamingZip } from "./streamingZip.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-debug-bundle-"));
try {
  const source = path.join(root, "source.ndjson");
  const destination = path.join(root, "bundle", "evidence.ndjson");
  fs.writeFileSync(source, `${JSON.stringify({ emailAddress: "alice@example.com", accountId: "account-123", displayName: "Alice Chen", authorization: "Bearer secret-token", url: "https://jira.invalid/path?token=secret", summary: "Keep this Issue summary", comments: ["alice@example.com commented"] })}\n`, "utf8");
  sanitizeFileForBundle(source, destination);
  const body = fs.readFileSync(destination, "utf8");
  assert.doesNotThrow(() => JSON.parse(body.trim()), "sanitizing JSON text must preserve its structure");
  assert.doesNotMatch(body, /alice@example\.com|account-123|Alice Chen|secret-token|token=secret/);
  assert.match(body, /Keep this Issue summary/);
  const firstEmail = sanitizeTextForBundle("alice@example.com");
  assert.equal(firstEmail, sanitizeTextForBundle("alice@example.com"), "pseudonyms must be deterministic within and across bundle files");
  const credentialText = "Authorization: secret-value\ntoken: secret-value\nJSESSIONID: secret-value";
  const sanitizedCredentialText = sanitizeTextForBundle(credentialText);
  assert.doesNotMatch(sanitizedCredentialText, /secret-value/);
  assert.equal(sanitizeTextForBundle(sanitizedCredentialText), sanitizedCredentialText, "credential masking must be idempotent");
  const sanitized = sanitizeExportData({ password: "secret", cookie: "JSESSIONID=secret", displayName: "Alice Chen", description: "Description remains" }) as Record<string, unknown>;
  assert.equal(sanitized.password, "[masked]"); assert.equal(sanitized.cookie, "[masked]"); assert.notEqual(sanitized.displayName, "Alice Chen"); assert.equal(sanitized.description, "Description remains");

  const zipPath = path.join(root, "debug-bundle.zip");
  const zip = createStreamingZip(zipPath, directoryZipEntries(path.join(root, "bundle")));
  assert.equal(verifyStreamingZip(zipPath, zip.entries).length, zip.entries.length);
  const failedZip = path.join(root, "failed.zip");
  assert.throws(() => createStreamingZip(failedZip, [{ name: "missing.json", filePath: path.join(root, "missing.json") }]));
  assert.equal(fs.existsSync(failedZip), false);
  assert.equal(fs.readdirSync(root).some((name) => name.startsWith("failed.zip.") && name.endsWith(".tmp")), false);
  console.log("Debug Bundle sanitizer and streaming ZIP failure tests passed.");
} finally { fs.rmSync(root, { recursive: true, force: true }); }
