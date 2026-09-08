import type { DatabaseSync } from 'node:sqlite';
import { fieldIdV043, resolveFieldV043, typedValueV043, type FieldV043 } from './aiFieldRegistryV043.js';

type Json = Record<string, any>;
type Node = { children: Map<string | null, Node>; field?: FieldV043; segments: (string | null)[] };
// Intern paths once. Discovery still visits every row, including late-only fields.
export function createFieldDiscoveryV044(registry: Map<string, FieldV043>) {
  const roots = new Map<string, Node>();
  return (doc: Json) => {
    const walk = (namespace: string, node: Node, value: any) => {
      if (node.segments.length) {
        const key = node.segments.at(-1) ?? '';
        const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'json' : typeof value === 'string' && /(?:date|time|timestamp|_at)$/i.test(key) && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? 'date' : typeof value;
        let field = node.field;
        if (!field) {
          const id = fieldIdV043(namespace, node.segments);
          field = registry.get(id) ?? { path: id, label: `${namespace}.${node.segments.map(s => s === null ? '[]' : /[.\/~\[\]"]|^$/.test(s) ? JSON.stringify(s) : s).join('.')}`, group: namespace, namespace, pointer: '/' + [namespace, ...node.segments.map(s => s === null ? '*' : s)].map(s => s.replace(/~/g, '~0').replace(/\//g, '~1')).join('/'), segments: node.segments, dataType: 'null', filterType: 'multi', sortable: !node.segments.includes(null), exportable: true, allNull: true };
          registry.set(id, field); node.field = field;
        }
        if (field.dataType === 'null') field.dataType = type;
        else if (type !== 'null' && field.dataType !== type) field.dataType = 'mixed';
        field.allNull &&= value === null;
        field.sortable &&= !['array', 'json'].includes(type);
        field.filterType = field.dataType === 'number' ? 'number' : field.dataType === 'date' ? 'date' : 'multi';
      }
      const child = (key: string | null, item: any) => {
        let next = node.children.get(key);
        if (!next) { next = { children: new Map(), segments: [...node.segments, key] }; node.children.set(key, next); }
        walk(namespace, next, item);
      };
      if (Array.isArray(value)) for (const item of value) child(null, item);
      else if (value && typeof value === 'object') for (const key of Object.keys(value)) child(key, value[key]);
    };
    for (const namespace of Object.keys(doc)) {
      let root = roots.get(namespace);
      if (!root) { root = { children: new Map(), segments: [] }; roots.set(namespace, root); }
      walk(namespace, root, doc[namespace]);
    }
  };
}

export type QueryStageV044 = (event: string, phase: 'START' | 'PROGRESS' | 'END' | 'POINT', details?: Json) => void;
let observer: QueryStageV044 = () => {};
export const setQueryObserverV044 = (next: QueryStageV044) => { observer = next; };
export const queryStageV044: QueryStageV044 = (event, phase, details) => observer(event, phase, details);
export type IndexedSnapshotV044 = { db: DatabaseSync; registry: Map<string, FieldV043>; indexed: Set<string> };

export function indexFieldsV044(s: IndexedSnapshotV044, names: string[]) {
  const fields = [...new Set(names.map(name => s.registry.get(name)?.path).filter((v): v is string => Boolean(v)))].filter(id => !s.indexed.has(id)).map(id => s.registry.get(id)!);
  if (!fields.length) return;
  queryStageV044('facet-build', 'START', { fieldCount: fields.length });
  const insert = s.db.prepare('INSERT OR IGNORE INTO cells VALUES(?,?,?,?,?,?)');
  s.db.exec('BEGIN');
  try {
    let processed = 0, last = performance.now();
    for (const stored of s.db.prepare('SELECT id,body FROM documents').iterate() as Iterable<Json>) {
      const doc = JSON.parse(stored.body).document;
      for (const field of fields) for (const value of resolveFieldV043(doc, field).flatMap(v => Array.isArray(v) && v.length ? v : [v])) {
        const v = typedValueV043(value); insert.run(stored.id, field.path, v.token, v.kind, v.text, v.number);
      }
      processed++;
      if (performance.now() - last > 500) { queryStageV044('facet-build', 'PROGRESS', { processed, total: null }); last = performance.now(); }
    }
    s.db.exec('COMMIT');
    fields.forEach(field => s.indexed.add(field.path));
    queryStageV044('facet-build', 'END', { processed });
  } catch (error) { s.db.exec('ROLLBACK'); throw error; }
}

export function materializeRowV044(body: string, registry: Map<string, FieldV043>, visibleFields?: string[]) {
  const { row, document } = JSON.parse(body);
  const fields = visibleFields === undefined ? [...registry.values()].filter(f => f.path === fieldIdV043(f.namespace, f.segments)) : visibleFields.map(id => registry.get(id.replace(/^dynamic:/, ''))).filter((f): f is FieldV043 => Boolean(f));
  const fieldValues: Json = Object.create(null);
  for (const field of fields) {
    const values = resolveFieldV043(document, field);
    if (values.length) fieldValues[field.path] = field.segments.includes(null) ? values : values[0];
  }
  return { ...row, fieldValues };
}
