import assert from "node:assert/strict";
import { buildSourceArchivePackage, findSensitiveData, listZipEntries } from "./sourceArchiveExporter.js";

const updated = "2026-07-20T01:02:03.000Z";
const jira = { issueKey: "COPGEN1-123", json: { key: "COPGEN1-123", fields: { updated, summary: "A" } }, sourceFileName: "COPGEN1-123.raw.json", sourceJsonPath: "$.issue.json" };
const confluence = { pageId: "1181160435", json: { id: "1181160435", version: { number: 17, when: updated }, title: "Page" } };
const pack = buildSourceArchivePackage({ jiraPayloads: [jira, jira], confluencePayloads: [confluence], selectedUser: "roger", exportedAt: updated });
assert.equal(pack.summary.jiraFullFetchObjectCount, 1);
assert.equal(pack.summary.confluenceFullFetchObjectCount, 1);
assert.equal(pack.summary.duplicateContentCount, 1);
assert.equal(pack.summary.uniquePayloadCount, 2);
assert.match(String(pack.refs[0].contentHash), /^sha256:[a-f0-9]{64}$/);
assert.deepEqual(Object.keys(pack.refs[0]).sort(), ["contentHash", "objectKey", "objectType", "sourceBundleName", "sourceFileName", "sourceJsonPath", "sourceSystem"].sort());
assert.equal(findSensitiveData({ nested: { apiToken: "secret" } })[0], "$.nested.apiToken");
const rejected = buildSourceArchivePackage({ jiraPayloads: [{ issueKey: "BAD-1", json: { key: "BAD-1", authorization: "Bearer abcdefghijklmnop" } }, { json: { fields: {} } }], exportedAt: updated });
assert.equal(rejected.summary.jiraFullFetchObjectCount, 0);
assert.equal(rejected.summary.missingObjectKeyCount, 1);
assert.equal(rejected.summary.exportErrorCount, 1);
const noConfluence = buildSourceArchivePackage({ jiraPayloads: [jira], exportedAt: updated });
assert.equal(noConfluence.summary.confluenceFullFetchObjectCount, 0);
assert.equal(noConfluence.files["source-archive-import-package/confluence-full-fetch-payloads.jsonl"].length, 0);
const versions = buildSourceArchivePackage({ confluencePayloads: [confluence, { ...confluence, json: { ...confluence.json, version: { number: 18, when: updated } } }], jiraPayloads: [], exportedAt: updated });
assert.equal(versions.summary.confluenceFullFetchObjectCount, 2);
assert.notEqual(JSON.parse(versions.files["source-archive-import-package/confluence-full-fetch-payloads.jsonl"].toString("utf8").split("\n")[0]).contentHash, JSON.parse(versions.files["source-archive-import-package/confluence-full-fetch-payloads.jsonl"].toString("utf8").split("\n")[1]).contentHash);
const missingTime = buildSourceArchivePackage({ jiraPayloads: [{ issueKey: "COPGEN1-999", json: { key: "COPGEN1-999", fields: {} } }], exportedAt: updated });
assert.equal(missingTime.summary.missingUpdatedTimeCount, 1);
const hashFailure = buildSourceArchivePackage({ jiraPayloads: [{ issueKey: "COPGEN1-998", json: { key: "COPGEN1-998", fields: { updated }, unsupported: 1n } }], exportedAt: updated });
assert.equal(hashFailure.summary.hashErrorCount, 1);
assert.equal(hashFailure.summary.jiraFullFetchObjectCount, 0);
assert.deepEqual(listZipEntries(pack.zip).sort(), Object.keys(pack.files).sort());
for (const name of ["jira-full-fetch-payloads.jsonl", "confluence-full-fetch-payloads.jsonl"]) {
  const content = pack.files[`source-archive-import-package/${name}`].toString("utf8").trim();
  for (const line of content.split("\n").filter(Boolean)) assert.doesNotThrow(() => JSON.parse(line));
}
console.log("Source archive exporter tests passed.");
