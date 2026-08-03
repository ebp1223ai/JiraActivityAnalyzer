import { useMemo, useState } from "react";
import type { ViewerTableQuery } from "../types/activityViewerQuery";
import type { DatabaseIssueQuery } from "../types/databaseQuery";
import type { FilterPreset } from "../types/uiPreferences";

type Query = ViewerTableQuery | DatabaseIssueQuery;
type Props = {
  viewerId: string;
  tabId: string;
  query: Query;
  presets: FilterPreset[];
  onApply: (query: Query) => void;
  onPresetsChange: (presets: FilterPreset[]) => void;
};

function presetQuery(query: Query): FilterPreset["query"] {
  return {
    ...("dateMode" in query ? { dateMode: query.dateMode } : {}),
    dateRange: query.dateRange,
    filters: structuredClone(query.filters) as unknown as FilterPreset["query"]["filters"],
    sort: query.sort,
    pageSize: query.pageSize,
    ...("commentDateMode" in query ? { commentDateMode: query.commentDateMode } : {}),
    ...("descriptionChangedOnly" in query ? { descriptionChangedOnly: query.descriptionChangedOnly } : {}),
    ...("includeBeforeUnavailable" in query ? { includeBeforeUnavailable: query.includeBeforeUnavailable } : {})
  };
}

function mergeQuery(current: Query, saved: FilterPreset["query"]): Query {
  return {
    ...current,
    page: 1,
    pageSize: (saved.pageSize ?? current.pageSize) as Query["pageSize"],
    sort: saved.sort === undefined ? current.sort : saved.sort as Query["sort"],
    filters: structuredClone(saved.filters),
    dateRange: saved.dateRange,
    ...("commentDateMode" in current ? { commentDateMode: saved.commentDateMode ?? current.commentDateMode } : {}),
    ...("descriptionChangedOnly" in current ? { descriptionChangedOnly: saved.descriptionChangedOnly ?? current.descriptionChangedOnly } : {}),
    ...("includeBeforeUnavailable" in current ? { includeBeforeUnavailable: saved.includeBeforeUnavailable ?? current.includeBeforeUnavailable } : {}),
    ...("dateMode" in current ? { dateMode: saved.dateMode ?? current.dateMode } : {}),
    revision: (current.revision ?? 0) + 1
  } as Query;
}

export function FilterPresetControl({ viewerId, tabId, query, presets, onApply, onPresetsChange }: Props) {
  const scoped = useMemo(() => presets.filter((item) => item.viewerId === viewerId && item.tabId === tabId), [presets, viewerId, tabId]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const selected = scoped.find((item) => item.id === selectedId);

  function save() {
    const clean = name.trim();
    if (!clean || scoped.some((item) => item.name.toLowerCase() === clean.toLowerCase())) return;
    const now = new Date().toISOString();
    const id = viewerId + ":" + tabId + ":" + now + ":" + clean.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const next: FilterPreset = { schemaVersion: 1, id, viewerId, tabId, name: clean, query: presetQuery(query), updatedAt: now };
    onPresetsChange([...presets, next]);
    setSelectedId(id);
  }

  function update() {
    if (!selected || !window.confirm("Update this preset with the current filter? / 以目前篩選更新此預設？")) return;
    onPresetsChange(presets.map((item) => item.id === selected.id ? { ...item, query: presetQuery(query), updatedAt: new Date().toISOString() } : item));
  }

  function rename() {
    const clean = name.trim();
    if (!selected || !clean || scoped.some((item) => item.id !== selected.id && item.name.toLowerCase() === clean.toLowerCase())) return;
    onPresetsChange(presets.map((item) => item.id === selected.id ? { ...item, name: clean, updatedAt: new Date().toISOString() } : item));
  }

  function remove() {
    if (!selected || !window.confirm("Delete this preset? / 刪除此預設？")) return;
    onPresetsChange(presets.filter((item) => item.id !== selected.id));
    setSelectedId("");
  }

  return <div className="flex min-w-0 flex-wrap items-end gap-2 rounded-md border border-line bg-slate-50 p-3" data-filter-presets={viewerId + ":" + tabId}>
    <label className="min-w-[180px] flex-1"><span className="mb-1 block text-xs font-black text-muted">Filter Preset / 篩選預設</span><select className="field" value={selectedId} onChange={(event) => { setSelectedId(event.currentTarget.value); const item = scoped.find((candidate) => candidate.id === event.currentTarget.value); if (item) setName(item.name); }}><option value="">No preset / 無預設</option>{scoped.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="min-w-[180px] flex-1"><span className="mb-1 block text-xs font-black text-muted">Preset Name / 預設名稱</span><input className="field" value={name} maxLength={80} onChange={(event) => setName(event.currentTarget.value)} /></label>
    <button className="btn" type="button" onClick={save} disabled={!name.trim()}>Save Current Filter / 儲存目前篩選</button>
    <button className="btn btn-primary" type="button" onClick={() => selected && onApply(mergeQuery(query, selected.query))} disabled={!selected}>Apply / 套用</button>
    <button className="btn" type="button" onClick={rename} disabled={!selected || !name.trim()}>Rename / 重新命名</button>
    <button className="btn" type="button" onClick={update} disabled={!selected}>Update / 更新</button>
    <button className="btn text-rose-700" type="button" onClick={remove} disabled={!selected}>Delete / 刪除</button>
  </div>;
}
