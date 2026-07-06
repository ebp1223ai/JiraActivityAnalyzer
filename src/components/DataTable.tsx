type Props = {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
};

function getCellTitle(cell: React.ReactNode) {
  return typeof cell === "string" || typeof cell === "number" ? String(cell) : undefined;
}

function renderCell(cell: React.ReactNode) {
  const title = getCellTitle(cell);
  if (!title) {
    return cell;
  }

  return (
    <span className="block max-w-full truncate" title={title}>
      {cell}
    </span>
  );
}

export function DataTable({ headers, rows }: Props) {
  const minWidth = Math.max(720, headers.length * 132);

  return (
    <div className="thin-scroll min-w-0 max-w-full overflow-x-auto overflow-y-hidden rounded-lg border border-line">
      <table className="table min-w-full" style={{ minWidth }}>
        <thead>
          <tr>{headers.map((header) => <th key={header} title={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} title={getCellTitle(cell)}>
                  {renderCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
