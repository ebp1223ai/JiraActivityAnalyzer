import type { ComponentProps } from "react";
import { ActivityEventDetailPanel } from "./ActivityEventDetailPanel";
import { DescriptionOriginalPreviewCell } from "./DescriptionOriginalPreviewCell";
import { DiffCell } from "./DiffCell";
import { ReadableContentCell } from "./ReadableContentCell";
import { SqliteDataTable, type SqliteTableColumn } from "./SqliteDataTable";
import { isDescriptionDiffRow } from "./DescriptionDiffCell";
import { activityEventAfter, activityEventBefore, formatActivityActor, formatActivityEventType, formatActivityEventValue, formatActivitySource } from "../utils/activityEventDisplay";
import { formatDisplayTime } from "../utils/displayTime";

export type ActivityComparisonMode = "issue-events" | "issue-changelog" | "user-events";

const comparisonColumns: SqliteTableColumn[] = [
  { id: "eventTime", label: "Time", kind: "date", required: true, width: 170, minWidth: 150, maxWidth: 240, render: (row) => <span className="whitespace-nowrap">{formatDisplayTime(row.eventTime)}</span> },
  { id: "displayName", queryField: "actor", label: "Actor", kind: "multi", width: 180, render: (row) => formatActivityActor(row) },
  { id: "eventType", queryField: "action", label: "Action", kind: "multi", required: true, width: 140, render: (row) => formatActivityEventType(row.eventType) },
  { id: "fieldName", queryField: "field", label: "Field", kind: "multi", width: 180, render: (row) => formatActivityEventValue(row.fieldName, "Not applicable") },
  { id: "before", label: "Before", kind: "text", width: 320, render: (row, context) => isDescriptionDiffRow(row) ? <DescriptionOriginalPreviewCell row={row} side="before" expanded={context.expanded} onExpandedChange={context.setExpanded} /> : <ReadableContentCell value={activityEventBefore(row)} missing="No previous value" /> },
  { id: "after", label: "After", kind: "text", width: 320, render: (row, context) => isDescriptionDiffRow(row) ? <DescriptionOriginalPreviewCell row={row} side="after" expanded={context.expanded} onExpandedChange={context.setExpanded} /> : <ReadableContentCell value={activityEventAfter(row)} formatHint={String(row.commentBodyFormat ?? "")} /> },
  { id: "diff", label: "Diff", kind: "text", width: 400, render: (row, context) => <DiffCell row={row} expanded={context.expanded} onExpandedChange={context.setExpanded} /> },
  { id: "sourceProvenance", queryField: "source", label: "Source", kind: "multi", width: 140, render: (row) => formatActivitySource(row.sourceProvenance) }
];

const issueKeyColumn: SqliteTableColumn = {
  id: "issueKey",
  label: "Issue Key",
  kind: "text",
  required: true,
  width: 150,
  render: (row) => <a className="font-black text-blue-700" href={`#/issues?key=${encodeURIComponent(String(row.issueKey ?? ""))}&sourcePage=users`}>{String(row.issueKey ?? "Unknown Issue")}</a>
};

const changelogIdentityColumns: SqliteTableColumn[] = [
  { id: "historyId", label: "History ID", kind: "text", width: 180 },
  { id: "itemIndex", label: "Item", kind: "number", width: 90 }
];

export function activityComparisonColumns(mode: ActivityComparisonMode) {
  if (mode === "user-events") return [comparisonColumns[0], issueKeyColumn, ...comparisonColumns.slice(1)].map((column) => ["before", "after"].includes(column.id) ? { ...column, defaultVisible: false } : column);
  if (mode === "issue-changelog") return [...comparisonColumns.slice(0, -1), ...changelogIdentityColumns, comparisonColumns[comparisonColumns.length - 1]];
  return comparisonColumns;
}

type Props = Omit<ComponentProps<typeof SqliteDataTable>, "columns" | "renderExpandedRow"> & {
  mode: ActivityComparisonMode;
};

export function ActivityComparisonTable({ mode, ...props }: Props) {
  return <SqliteDataTable {...props} columns={activityComparisonColumns(mode)} renderExpandedRow={(row) => <ActivityEventDetailPanel row={row} />} />;
}
