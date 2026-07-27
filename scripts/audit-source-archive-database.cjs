const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(databasePath)) {
  console.error("Usage: node scripts/audit-source-archive-database.cjs <source-archive.sqlite>");
  process.exit(2);
}

const db = new DatabaseSync(databasePath, { readOnly: true });
try {
  db.exec("PRAGMA query_only = ON; PRAGMA foreign_keys = ON");
  const tableNames = [
    "database_metadata",
    "schema_migrations",
    "source_system_bindings",
    "source_objects",
    "source_object_versions",
    "source_payloads",
    "source_import_refs",
    "activity_events"
  ];
  const counts = Object.fromEntries(tableNames.map((table) => [
    table,
    Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)
  ]));
  const payloads = db.prepare(`SELECT v.content_hash, p.compressed_payload,
    p.uncompressed_size_bytes, p.compressed_size_bytes
    FROM source_object_versions v JOIN source_payloads p
    ON p.source_object_version_id=v.source_object_version_id`).all();
  let verifiedPayloads = 0;
  for (const row of payloads) {
    const compressed = Buffer.from(row.compressed_payload);
    const canonical = gunzipSync(compressed);
    JSON.parse(canonical.toString("utf8"));
    if (canonical.byteLength !== Number(row.uncompressed_size_bytes)) throw new Error("Uncompressed size mismatch.");
    if (compressed.byteLength !== Number(row.compressed_size_bytes)) throw new Error("Compressed size mismatch.");
    if (crypto.createHash("sha256").update(canonical).digest("hex") !== row.content_hash) throw new Error("Payload hash mismatch.");
    verifiedPayloads += 1;
  }
  const metadata = db.prepare("SELECT schema_version FROM database_metadata WHERE metadata_key='primary'").get();
  const missingStableHashes = Number(db.prepare("SELECT COUNT(*) AS count FROM source_object_versions WHERE stable_version_hash IS NULL OR length(stable_version_hash) != 64").get().count);
  const invalidEventHashes = Number(db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE length(event_hash) != 64").get().count);
  const orphanEvents = Number(db.prepare(`SELECT COUNT(*) AS count FROM activity_events e
    LEFT JOIN source_objects o ON o.source_object_id=e.source_object_id
    LEFT JOIN source_object_versions v ON v.source_object_version_id=e.object_version_id
    WHERE o.source_object_id IS NULL OR v.source_object_version_id IS NULL`).get().count);
  const report = {
    databasePath,
    schemaVersion: Number(metadata.schema_version),
    integrityCheck: db.prepare("PRAGMA integrity_check").get().integrity_check,
    foreignKeyViolations: db.prepare("PRAGMA foreign_key_check").all().length,
    counts,
    verifiedPayloads,
    missingStableHashes,
    invalidEventHashes,
    orphanEvents,
    status: "read_only_audit_passed"
  };
  if (report.schemaVersion !== 2 || report.integrityCheck !== "ok" || report.foreignKeyViolations
    || missingStableHashes || invalidEventHashes || orphanEvents) {
    throw new Error(`Source Archive v2 audit failed: ${JSON.stringify(report)}`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
