type KpiCardProps = {
  label: string;
  value: number;
  helper?: string;
  periodLabel?: string;
};

export default function KpiCard({ label, value, helper, periodLabel }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      {periodLabel ? (
        <p className="mt-2 text-[11px] font-medium text-muted-foreground">{periodLabel}</p>
      ) : null}
    </div>
  );
}
