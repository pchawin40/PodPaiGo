type DashboardBarListItem = {
  label: string;
  value: number;
  meta?: string;
};

type DashboardBarListProps = {
  items: DashboardBarListItem[];
  emptyLabel?: string;
  valueFormatter?: (value: number) => string;
};

export default function DashboardBarList({
  items,
  emptyLabel = 'No data in this range.',
  valueFormatter = (value) => String(value),
}: DashboardBarListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-foreground">{item.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {valueFormatter(item.value)}
              {item.meta ? ` · ${item.meta}` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
