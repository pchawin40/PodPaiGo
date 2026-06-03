import type { ReactNode } from 'react';

type DashboardTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type DashboardTableProps<T> = {
  columns: DashboardTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
};

export default function DashboardTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel = 'No rows in this range.',
}: DashboardTableProps<T>) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            {columns.map((column) => (
              <th key={column.key} className={`py-2 pr-4 font-medium ${column.className ?? ''}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border/60 align-top">
              {columns.map((column) => (
                <td key={column.key} className={`py-3 pr-4 ${column.className ?? ''}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
