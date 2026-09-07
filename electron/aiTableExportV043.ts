type ExportTable = { fields: { id: string; label: string }[]; rows: Record<string, unknown>[] };

export function tableCsvV043(table: ExportTable) {
  // JSON cell encoding preserves null, missing (empty cell), strings and arrays.
  // It also prevents source strings from becoming executable spreadsheet formulas.
  const cell = (value: unknown) => `"${(value === undefined ? "" : JSON.stringify(value)).replace(/"/g, '""')}"`;
  return "\uFEFF" + [table.fields.map(f => cell(f.id)).join(","), ...table.rows.map(row => table.fields.map(f => cell(row[f.id])).join(","))].join("\r\n") + "\r\n";
}
