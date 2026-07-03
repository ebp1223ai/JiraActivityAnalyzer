type Props = {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
};

export function DataTable({ headers, rows }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="table">
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
