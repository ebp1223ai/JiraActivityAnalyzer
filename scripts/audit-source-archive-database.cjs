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
    "source_import_refs"
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
  const report = {
    databasePath,
    integrityCheck: db.prepare("PRAGMA integrity_check").get().integrity_check,
    foreignKeyViolations: db.prepare("PRAGMA foreign_key_check").all().length,
    counts,
    verifiedPayloads,
    status: "read_only_audit_passed"
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
}
