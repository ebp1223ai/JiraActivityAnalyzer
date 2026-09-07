type Json = Record<string, any>;
export type FieldV043 = { path: string; label: string; group: string; namespace: string; pointer: string; segments: (string | null)[]; dataType: string; filterType: "text" | "multi" | "number" | "date"; sortable: boolean; exportable: boolean; allNull: boolean };
const escape = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
export function fieldIdV043(namespace: string, segments: (string | null)[]) { return `${namespace}:${JSON.stringify(segments)}`; }
export function resolveFieldV043(document: Json, field: Pick<FieldV043, "namespace" | "segments">): any[] {
  const walk = (value: any, i: number): any[] => {
    if (i === field.segments.length) return [value];
    const segment = field.segments[i];
    if (segment === null) return Array.isArray(value) ? value.flatMap(v => walk(v, i + 1)) : [];
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, segment)) return [];
    return walk(value[segment], i + 1);
  };
  return walk(document[field.namespace], 0);
}
export function registerDocumentV043(registry: Map<string, FieldV043>, document: Json) {
  for (const namespace of Object.keys(document)) {
    const walk = (value: any, segments: (string | null)[]) => {
      if (segments.length) {
        const id = fieldIdV043(namespace, segments), prior = registry.get(id), key = segments.at(-1) ?? "";
        const date = /(?:date|time|timestamp|_at)$/i.test(key) && (value === null || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)));
        const type = value === null ? "null" : Array.isArray(value) ? "array" : date ? "date" : typeof value === "object" ? "json" : typeof value;
        const dataType = !prior || prior.dataType === "null" ? type : type === "null" || type === prior.dataType ? prior.dataType : "mixed";
        registry.set(id, { path: id, label: `${namespace}.${segments.map(s => s === null ? "[]" : /[.\/~\[\]"]|^$/.test(s) ? JSON.stringify(s) : s).join(".")}`, group: namespace, namespace, pointer: "/" + [namespace, ...segments.map(s => s === null ? "*" : s)].map(escape).join("/"), segments, dataType, filterType: dataType === "number" ? "number" : dataType === "date" ? "date" : "multi", sortable: prior?.sortable !== false && !["array", "json"].includes(type) && !segments.includes(null), exportable: true, allNull: (prior?.allNull ?? true) && value === null });
      }
      if (Array.isArray(value)) value.forEach(item => walk(item, [...segments, null]));
      else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, [...segments, key]));
    };
    walk(document[namespace], []);
  }
}
export function typedValueV043(value: any): { token: string; kind: string; text: string; number: number | null } {
  const kind = value === undefined ? "missing" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  return { token: `${kind}:${value === undefined ? "" : JSON.stringify(value)}`, kind, text: value === undefined ? "(未提供)" : value === null ? "(null)" : typeof value === "string" ? value : JSON.stringify(value), number: typeof value === "number" ? value : typeof value === "boolean" ? Number(value) : null };
}
