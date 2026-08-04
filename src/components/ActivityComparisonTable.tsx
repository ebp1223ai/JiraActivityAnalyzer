import type { ComponentProps } from "react";
import { activityViewerRegistryForScope, type ActivityViewerColumnId } from "../../shared/activityViewerColumns";
import { ActivityEventDetailPanel } from "./ActivityEventDetailPanel";
import { DescriptionOriginalPreviewCell } from "./DescriptionOriginalPreviewCell";
import { DiffCell } from "./DiffCell";
import { ReadableContentCell } from "./ReadableContentCell";
import { SqliteDataTable, type SqliteTableColumn } from "./SqliteDataTable";
import { isDescriptionDiffRow } from "./DescriptionDiffCell";
import { activityEventAfter, activityEventBefore, formatActivityActor, formatActivityEventType, formatActivityEventValue, formatActivitySource } from "../utils/activityEventDisplay";
import { formatDisplayTime } from "../utils/displayTime";

export type ActivityComparisonMode = "issue-events" | "issue-changelog" | "user-events";

const scopeByMode = {
  "issue-events": "issueActivityEvents",
  "issue-changelog": "issueChangelog",
  "user-events": "userAllActivityEvents"
} as const;

function value(row: Record<string, unknown>, field: string) {
  return formatActivityEventValue(row[field], "—");
}

function renderColumn(id: ActivityViewerColumnId): SqliteTableColumn["render"] {
  switch (id) {
    case "eventTime": return (row) => <span className="whitespace-nowrap">{formatDisplayTime(row.eventTime)}</span>;
    case "action": return (row) => formatActivityEventType(row.eventType);
    case "eventType": return (row) => <span className="font-mono text-[11px]">{value(row, "eventType")}</span>;
    case "displayName": return (row) => formatActivityActor(row);
    case "issueTypeName":
    case "currentStatusName":
    case "currentPriorityName": return (row) => <span title="Current saved issue metadata / 目前儲存的 Issue metadata">{value(row, id)}</span>;
    case "issueKey": return (row) => <a className="font-black text-blue-700" href={`#/issues?key=${encodeURIComponent(String(row.issueKey ?? ""))}&sourcePage=users`}>{value(row, "issueKey")}</a>;
    case "before": return (row, context) => isDescriptionDiffRow(row) ? <DescriptionOriginalPreviewCell row={row} side="before" expanded={context.expanded} onExpandedChange={context.setExpanded} /> : <ReadableContentCell value={activityEventBefore(row)} missing="No previous value" />;
    case "after": return (row, context) => isDescriptionDiffRow(row) ? <DescriptionOriginalPreviewCell row={row} side="after" expanded={context.expanded} onExpandedChange={context.setExpanded} /> : <ReadableContentCell value={activityEventAfter(row)} formatHint={String(row.commentBodyFormat ?? "")} />;
    case "diff": return (row, context) => <DiffCell row={row} expanded={context.expanded} onExpandedChange={context.setExpanded} />;
    case "sourceProvenance": return (row) => formatActivitySource(row.sourceProvenance);
    default: return (row) => value(row, id);
  }
}

export function activityComparisonColumns(mode: ActivityComparisonMode): SqliteTableColumn[] {
  const scope = scopeByMode[mode];
  return activityViewerRegistryForScope(scope).map((definition) => ({
    id: definition.id,
    queryField: definition.queryField,
    label: definition.label,
    kind: definition.id === "eventTime" ? "date" : definition.id === "itemIndex" ? "number" : ["action", "eventType", "displayName", "projectKey", "issueTypeName", "currentStatusName", "currentPriorityName", "fieldName", "sourceProvenance"].includes(definition.id) ? "multi" : "text",
    required: definition.required || (mode === "user-events" && definition.id === "issueKey"),
    defaultVisible: mode === "user-events" && ["before", "after"].includes(definition.id) ? false : definition.defaultVisible,
    width: definition.defaultWidth,
    minWidth: definition.id === "eventTime" ? 150 : 72,
    maxWidth: definition.id === "diff" ? 640 : 520,
    render: renderColumn(definition.id)
  }));
}

type Props = Omit<ComponentProps<typeof SqliteDataTable>, "columns" | "renderExpandedRow"> & {
  mode: ActivityComparisonMode;
};

export function ActivityComparisonTable({ mode, ...props }: Props) {
  return <SqliteDataTable {...props} columns={activityComparisonColumns(mode)} renderExpandedRow={(row) => <ActivityEventDetailPanel row={row} />} />;
}
