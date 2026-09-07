const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..');
function load(file, work) {
  fs.mkdirSync(work, { recursive: true });
  const output = path.join(work, `${path.basename(file, '.ts')}.cjs`);
  require('esbuild').buildSync({ entryPoints: [path.join(root, file)], outfile: output, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  return require(output);
}
function seedRaw(file, records, work, identity = 'synthetic-v043-db') {
  const api = load('electron/currentStateArchive.ts', work);
  api.createCurrentStateDatabase({ targetPath: file, appVersion: '0.3.43', databaseId: identity, binding: { sourceSystem: 'jira', serverIdentity: 'jira:fixture:001', baseUrlNormalized: 'https://jira.invalid' } });
  const db = new DatabaseSync(file);
  const now = '2026-09-07T00:00:00Z';
  try {
    db.exec('PRAGMA foreign_keys=ON; BEGIN');
    const object = db.prepare('INSERT INTO source_objects(id,jira_issue_id,issue_key,project_key,first_saved_at,created_at) VALUES(?,?,?,?,?,?)');
    const event = db.prepare('INSERT INTO activity_events(id,source_object_id,event_type,event_time,actor_account_id,actor_display_name,field_id,field_name,from_value_json,to_value_json,source_record_id,event_identity_hash,event_identity_policy_version,identity_key_type,jira_native_source_id,source_provenance,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (let i = 0; i < records.length; i++) {
      const row = records[i], ref = row.sourceTrace?.reference ?? row;
      const id = ref.activityEventId ?? row.id, issue = ref.issueKey ?? row.issue;
      const hash = crypto.createHash('sha256').update(String(id)).digest('hex');
      let objectId = db.prepare('SELECT id FROM source_objects WHERE issue_key=?').get(issue)?.id;
      if (!objectId) { objectId=`obj-${i}`; object.run(objectId,`issue-${i}`,issue,issue.split('-')[0],now,now); }
      const actor = ref.actor?.stableIdentity ?? row.actor ?? 'A';
      event.run(id, objectId, row.eventType ?? 'comment_updated', ref.eventTime, actor, ref.actor?.displayValue ?? actor, ref.fieldId ?? null, ref.fieldName ?? 'Comment', JSON.stringify(row.before ?? null), JSON.stringify(row.after ?? row), ref.sourceRecordStableId ?? `stable-${i}`, hash, 2, 'synthetic', `native-${i}`, ref.sourceProvenance ?? 'Jira Comment', now);
    }
    db.exec('COMMIT');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('FIXTURE_FK_FAILED');
  } finally { db.close(); }
}
module.exports = { root, load, seedRaw };
