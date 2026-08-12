import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_ENV_TEXT,
  ENV_FORMAT_VERSION,
  assertRuntimeEnvPath,
  atomicPatchEnv,
  parseEnvText,
  patchEnvText,
  redactConfigValue,
  runtimeConfigFromValues
} from "./runtimeConfig.js";
import {
  databasePathForEnv,
  resolveAppPaths,
  resolveLocalDatabasePath
} from "./appPathResolver.js";
import {
  SOURCE_ARCHIVE_DATABASE_TYPE,
  SOURCE_ARCHIVE_PRODUCT_ID,
  SOURCE_ARCHIVE_SCHEMA_VERSION,
  SOURCE_ARCHIVE_TABLES,
  SourceArchiveRepository,
  canonicalContentHash,
  canonicalJson,
  checkDatabaseCompatibility,
  createSourceArchiveDatabase,
  normalizeSourceObjectKey
} from "./sourceArchiveDatabase.js";
import {
  StartupCheckCoordinator,
  initialRuntimeState,
  selectRuntimeCapabilities,
  type DatabaseRuntimeState,
  type JiraRuntimeState
} from "./runtimeStatus.js";
import { checkJiraConnection } from "./jiraConnectionCheck.js";

async function main() {
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jaa-v0237-"));
const finish = () => fs.rmSync(tempRoot, { recursive: true, force: true });

try {
  const legacy = runtimeConfigFromValues(parseEnvText([
    "JIRA_BASE_URL=https://jira.example.invalid/",
    "JIRA_USER=legacy-user",
    "JIRA_API_TOKEN=test-token",
    "JIRA_AUTH_TYPE=basic",
    "JIRA_API_VERSION=v2",
    "UNKNOWN_SETTING=preserved"
  ].join("\n")));
  assert.equal(legacy.envFormatVersion, ENV_FORMAT_VERSION);
  assert.equal(legacy.sources.envFormatVersion, "default");
  assert.equal(legacy.jiraUsername, "legacy-user");
  assert.equal(legacy.sources.jiraUsername, "legacy_alias");
  assert.equal(legacy.jiraAuthMode, "basic");
  assert.equal(legacy.values.UNKNOWN_SETTING, "preserved");
  assert.match(DEFAULT_ENV_TEXT, new RegExp(`ENV_FORMAT_VERSION=${ENV_FORMAT_VERSION}`));
  assert.match(DEFAULT_ENV_TEXT, /環境設定格式版本/);
  assert.throws(() => assertRuntimeEnvPath(path.join(tempRoot, ".env.Version")), /cannot be loaded/);

  const originalEnv = [
    "# custom comment / 自訂註解",
    "ENV_FORMAT_VERSION=1",
    "JIRA_BASE_URL=https://old.example.invalid",
    "UNKNOWN_SETTING=keep-me",
    ""
  ].join("\r\n");
  const patchedText = patchEnvText(originalEnv, {
    ENV_FORMAT_VERSION: "2",
    JIRA_BASE_URL: "https://new.example.invalid",
    LOCAL_DATABASE_PATH: "資料庫\\目前.sqlite"
  });
  assert.match(patchedText, /# custom comment \/ 自訂註解/);
  assert.match(patchedText, /UNKNOWN_SETTING=keep-me/);
  assert.match(patchedText, /ENV_FORMAT_VERSION=2/);
  assert.match(patchedText, /LOCAL_DATABASE_PATH=資料庫\\目前\.sqlite/);
  assert.ok(patchedText.includes("\r\n"));

  const envPath = path.join(tempRoot, ".env");
  fs.writeFileSync(envPath, originalEnv, "utf8");
  const failingFs = {
    readFileSync: fs.readFileSync.bind(fs),
    openSync: fs.openSync.bind(fs),
    writeFileSync: fs.writeFileSync.bind(fs),
    fsyncSync: fs.fsyncSync.bind(fs),
    closeSync: fs.closeSync.bind(fs),
    renameSync: () => { throw new Error("simulated atomic replace failure"); },
    unlinkSync: fs.unlinkSync.bind(fs)
  };
  assert.throws(() => atomicPatchEnv(envPath, { JIRA_BASE_URL: "https://not-saved.invalid" }, failingFs), /simulated/);
  assert.equal(fs.readFileSync(envPath, "utf8"), originalEnv);
  assert.equal(fs.readdirSync(tempRoot).some((name) => name.endsWith(".tmp")), false);
  atomicPatchEnv(envPath, { ENV_FORMAT_VERSION: "2", JIRA_BASE_URL: "https://saved.example.invalid" });
  assert.equal(parseEnvText(fs.readFileSync(envPath, "utf8")).JIRA_BASE_URL, "https://saved.example.invalid");
  assert.deepEqual(redactConfigValue("", { token: "secret", Authorization: "Bearer secret", nested: { password: "secret" }, ok: "visible" }), {
    token: "[masked]", Authorization: "[masked]", nested: { password: "[masked]" }, ok: "visible"
  });

  const appRoot = path.join(tempRoot, "可攜 程式");
  const relativeDb = "資料 庫\\目前.sqlite";
  assert.equal(resolveLocalDatabasePath(appRoot, relativeDb), path.resolve(appRoot, relativeDb));
  const external = path.resolve(tempRoot, "外部 資料庫.sqlite");
  assert.equal(resolveLocalDatabasePath(appRoot, external), external);
  assert.equal(databasePathForEnv(appRoot, external), external);
  assert.equal(databasePathForEnv(appRoot, path.join(appRoot, relativeDb)), path.normalize(relativeDb));
  const resolvedPaths = resolveAppPaths(appRoot, relativeDb);
  assert.equal(resolvedPaths.appRoot, path.resolve(appRoot));
  assert.equal(resolvedPaths.localDatabase, path.resolve(appRoot, relativeDb));
  assert.equal(resolvedPaths.env, path.join(path.resolve(appRoot), ".env"));

  const databasePath = path.join(tempRoot, "資料 庫", "source archive.sqlite");
  const created = createSourceArchiveDatabase({
    targetPath: databasePath,
    appVersion: "0.2.37",
    databaseId: "11111111-1111-4111-8111-111111111111",
    now: "2026-07-24T11:30:00.000Z",
    binding: {
      sourceSystem: "jira",
      serverIdentity: "jira:test-server",
      baseUrlNormalized: "https://jira.example.invalid",
      serverTitle: "Fixture Jira"
    }
  });
  assert.equal(created.validation.status, "READY");
  assert.equal(created.validation.databaseId, "11111111-1111-4111-8111-111111111111");
  assert.equal(created.validation.schemaVersion, SOURCE_ARCHIVE_SCHEMA_VERSION);
  assert.equal(created.validation.bindingComparison, "MATCH");
  assert.equal(checkDatabaseCompatibility(databasePath, "").status, "READY");
  assert.equal(checkDatabaseCompatibility(databasePath, "jira:other-server").status, "JIRA_INSTANCE_MISMATCH");
  assert.equal(checkDatabaseCompatibility("", "").status, "NOT_CONFIGURED");
  assert.equal(checkDatabaseCompatibility(path.join(tempRoot, "missing.sqlite"), "").status, "MISSING");
  const invalidPath = path.join(tempRoot, "invalid.sqlite");
  fs.writeFileSync(invalidPath, "not sqlite", "utf8");
  assert.equal(checkDatabaseCompatibility(invalidPath, "").status, "INVALID_SQLITE");

  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON");
  const tableNames = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name));
  assert.deepEqual(SOURCE_ARCHIVE_TABLES.filter((name) => !tableNames.has(name)), []);
  assert.equal((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys, 1);
  const metadata = db.prepare("SELECT * FROM database_metadata").get() as Record<string, unknown>;
  assert.equal(metadata.product_id, SOURCE_ARCHIVE_PRODUCT_ID);
  assert.equal(metadata.database_type, SOURCE_ARCHIVE_DATABASE_TYPE);
  assert.equal(metadata.schema_version, SOURCE_ARCHIVE_SCHEMA_VERSION);
  assert.ok((db.prepare("PRAGMA foreign_key_list(source_payloads)").all() as unknown[]).length >= 1);
  assert.ok((db.prepare("PRAGMA index_list(source_objects)").all() as Array<{ unique: number }>).some((index) => index.unique === 1));
  db.close();

  assert.equal(normalizeSourceObjectKey("jira", "issue", " abc_1-42 "), "ABC_1-42");
  assert.throws(() => normalizeSourceObjectKey("jira", "issue", "IMAGE"), /INVALID/);
  const canonicalA = canonicalJson({ b: 2, a: 1, generatedAt: "one", nested: { z: 2, a: 1 } });
  const canonicalB = canonicalJson({ nested: { a: 1, z: 2 }, a: 1, b: 2, generatedAt: "two" });
  assert.equal(canonicalA, canonicalB);
  assert.equal(canonicalContentHash(JSON.parse(canonicalA)), canonicalContentHash(JSON.parse(canonicalB)));

  const repository = new SourceArchiveRepository(databasePath);
  const fixture = {
    id: "10001",
    key: "ABC-1",
    fields: {
      summary: "完整 Raw JSON",
      description: "內容",
      comments: [{ id: "1", body: "comment" }],
      changelog: { histories: [{ id: "h1" }] },
      attachment: [{ id: "a1", filename: "meta-only.txt" }],
      issuelinks: [{ id: "l1" }],
      reporter: { name: "fixture-user" },
      updated: "2026-07-24T10:00:00.000Z"
    }
  };
  const first = repository.storeSnapshot({
    sourceSystem: "jira",
    objectType: "issue",
    objectKey: "abc-1",
    rawJson: fixture,
    sourceVersionNumber: 99,
    sourceUpdatedAt: "2026-07-24T10:00:00.000Z",
    observedAt: "2026-07-24T11:30:00.000Z",
    importRef: { sourceBundleName: "bundle-a", sourceFileName: "ABC-1.json", sourceJsonPath: "$.issues[0]" }
  });
  assert.equal(first.createdVersion, true);
  const readFirst = repository.readSnapshot(first.sourceObjectVersionId)!;
  assert.deepEqual(readFirst.rawJson, fixture);
  assert.equal(readFirst.sourceVersionNumber, null);
  assert.ok(readFirst.compressedSizeBytes > 0);
  const duplicate = repository.storeSnapshot({
    sourceSystem: "jira",
    objectType: "issue",
    objectKey: "ABC-1",
    rawJson: { ...fixture, generatedAt: "ignored" },
    sourceUpdatedAt: "2026-07-24T10:00:00.000Z",
    observedAt: "2026-07-24T12:00:00.000Z",
    importRef: { sourceBundleName: "bundle-b", sourceFileName: "ABC-1.json", sourceJsonPath: "$.issues[0]" }
  });
  assert.equal(duplicate.createdVersion, false);
  assert.equal(duplicate.sourceObjectVersionId, first.sourceObjectVersionId);
  assert.equal(repository.counts().source_object_versions, 1);
  assert.equal(repository.counts().source_payloads, 1);
  assert.equal(repository.counts().source_import_refs, 1);

  const changedFixture = structuredClone(fixture);
  changedFixture.fields.summary = "內容已修改";
  const changed = repository.storeSnapshot({
    sourceSystem: "jira",
    objectType: "issue",
    objectKey: "ABC-1",
    rawJson: changedFixture,
    sourceUpdatedAt: "2026-07-24T13:00:00.000Z",
    observedAt: "2026-07-24T13:30:00.000Z",
    importRef: { sourceBundleName: "bundle-c", sourceFileName: "ABC-1.json", sourceJsonPath: "$.issues[0]" }
  });
  assert.equal(changed.createdVersion, true);
  assert.equal(repository.counts().source_object_versions, 2);
  assert.deepEqual(repository.readSnapshot(first.sourceObjectVersionId)!.rawJson, fixture);
  assert.deepEqual(repository.readSnapshot(changed.sourceObjectVersionId)!.rawJson, changedFixture);
  const countsBeforeFailure = repository.counts();
  assert.throws(() => repository.storeSnapshot({
    sourceSystem: "jira",
    objectType: "issue",
    objectKey: "ABC-2",
    rawJson: { id: "2", key: "ABC-2", fields: { summary: "rollback" } },
    observedAt: "2026-07-24T14:00:00.000Z",
    importRef: { sourceBundleName: "bundle-fail", sourceFileName: "ABC-2.json", sourceJsonPath: "$" },
    simulateFailureAfterPayload: true
  }), /SIMULATED/);
  assert.deepEqual(repository.counts(), countsBeforeFailure);
  repository.close();

  const oldSchemaPath = path.join(tempRoot, "old.sqlite");
  fs.copyFileSync(databasePath, oldSchemaPath);
  const oldDb = new DatabaseSync(oldSchemaPath);
  oldDb.prepare("UPDATE database_metadata SET schema_version=0").run();
  oldDb.close();
  assert.equal(checkDatabaseCompatibility(oldSchemaPath).status, "MIGRATION_REQUIRED");
  const newSchemaPath = path.join(tempRoot, "new.sqlite");
  fs.copyFileSync(databasePath, newSchemaPath);
  const newDb = new DatabaseSync(newSchemaPath);
  newDb.prepare("UPDATE database_metadata SET schema_version=99").run();
  newDb.close();
  assert.equal(checkDatabaseCompatibility(newSchemaPath).status, "TOO_NEW");
  const foreignPath = path.join(tempRoot, "foreign.sqlite");
  const foreignDb = new DatabaseSync(foreignPath);
  foreignDb.exec("CREATE TABLE foreign_table(id INTEGER PRIMARY KEY)");
  foreignDb.close();
  assert.equal(checkDatabaseCompatibility(foreignPath).status, "SCHEMA_INCOMPLETE");

  assert.deepEqual(selectRuntimeCapabilities("CONNECTED", "READY"), {
    jiraSearch: true, candidateDiscovery: true, fullFetchStaging: true,
    databaseRead: true, databaseWrite: true, databaseImport: true,
    offlineAnalysis: true, settings: true
  });
  assert.equal(selectRuntimeCapabilities("NETWORK_ERROR", "READY").databaseRead, true);
  assert.equal(selectRuntimeCapabilities("CONNECTED", "MISSING").jiraSearch, true);
  assert.equal(selectRuntimeCapabilities("CONNECTED", "JIRA_INSTANCE_MISMATCH").databaseImport, false);
  assert.equal(initialRuntimeState().jira.status, "CHECKING");

  const changes: Array<{ jira: string; database: string }> = [];
  let resolveFirstJira!: (value: Omit<JiraRuntimeState, "requestId">) => void;
  let jiraCall = 0;
  const coordinator = new StartupCheckCoordinator(
    async () => {
      jiraCall += 1;
      if (jiraCall === 1) return await new Promise((resolve) => { resolveFirstJira = resolve; });
      return { ...initialRuntimeState().jira, status: "CONNECTED", reasonCode: "CONNECTED", message: "new", checkedAt: new Date().toISOString(), requestId: undefined } as never;
    },
    async () => ({ ...initialRuntimeState().database, status: "READY", reasonCode: "READY", message: "ready", checkedAt: new Date().toISOString(), requestId: undefined } as never),
    (state) => changes.push({ jira: state.jira.status, database: state.database.status })
  );
  const firstJiraPromise = coordinator.retryJira();
  const secondJiraPromise = coordinator.retryJira();
  await secondJiraPromise;
  resolveFirstJira({ ...initialRuntimeState().jira, status: "AUTH_FAILED", reasonCode: "AUTH_FAILED", message: "old", checkedAt: new Date().toISOString() });
  await firstJiraPromise;
  assert.equal(coordinator.snapshot().jira.status, "CONNECTED");
  assert.ok(changes.some((change) => change.jira === "CHECKING"));

  const parallelEvents: string[] = [];
  const parallel = new StartupCheckCoordinator(
    async () => { await new Promise((resolve) => setTimeout(resolve, 15)); parallelEvents.push("jira"); return { ...initialRuntimeState().jira, status: "NOT_CONFIGURED", reasonCode: "NOT_CONFIGURED", checkedAt: new Date().toISOString() }; },
    async () => { await new Promise((resolve) => setTimeout(resolve, 1)); parallelEvents.push("database"); return { ...initialRuntimeState().database, status: "READY", reasonCode: "READY", checkedAt: new Date().toISOString(), canRead: true, canWrite: true }; }
  );
  await parallel.startParallel();
  assert.deepEqual(parallelEvents, ["database", "jira"]);

  const notConfigured = await checkJiraConnection({ baseUrl: "", username: "", email: "", apiToken: "", authMode: "bearer", apiVersion: "v2" });
  assert.equal(notConfigured.status, "NOT_CONFIGURED");
  const invalidUrl = await checkJiraConnection({ baseUrl: "file:///tmp/jira", username: "u", email: "", apiToken: "t", authMode: "bearer", apiVersion: "v2" });
  assert.equal(invalidUrl.status, "INVALID_URL");
  let fetchAttempts = 0;
  const connected = await checkJiraConnection(
    { baseUrl: "https://jira.example.invalid/", username: "fixture-user", email: "", apiToken: "fixture-token", authMode: "bearer", apiVersion: "v2" },
    {
      fetchImpl: (async (url: string | URL | Request) => {
        fetchAttempts += 1;
        if (String(url).endsWith("/myself") && fetchAttempts === 1) return new Response("temporary", { status: 503 });
        if (String(url).endsWith("/myself")) return new Response(JSON.stringify({ name: "fixture-user", displayName: "Fixture User" }), { status: 200, headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ serverId: "fixture-server-id", serverTitle: "Fixture Jira" }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
      sleep: async () => {}
    }
  );
  assert.equal(connected.status, "CONNECTED");
  assert.equal(fetchAttempts, 3);
  assert.equal(connected.serverIdentity, "jira:fixture-server-id");
  assert.equal(connected.accountDisplayName, "Fixture User");
  const authFailed = await checkJiraConnection(
    { baseUrl: "https://jira.example.invalid", username: "fixture-user", email: "", apiToken: "fixture-token", authMode: "bearer", apiVersion: "v2" },
    { fetchImpl: (async () => new Response("unauthorized", { status: 401 })) as typeof fetch }
  );
  assert.equal(authFailed.status, "AUTH_FAILED");

  console.log("v0.2.37 startup configuration, runtime state, database schema, compatibility and snapshot tests passed.");
} finally {
  finish();
}
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
