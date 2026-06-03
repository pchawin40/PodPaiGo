import type { AnalyticsDateRange } from '../../../lib/admin/analyticsDashboardTypes';

type AdminFilterBarProps = {
  range: AnalyticsDateRange;
  airport: string;
  airports: string[];
  onRangeChange: (range: AnalyticsDateRange) => void;
  onAirportChange: (airport: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
};

const RANGE_OPTIONS: Array<{ value: AnalyticsDateRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
];

export default function AdminFilterBar({
  range,
  airport,
  airports,
  onRangeChange,
  onAirportChange,
  onRefresh,
  refreshing = false,
}: AdminFilterBarProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
      <div className="flex flex-wrap gap-2">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onRangeChange(option.value)}
            className={
              range === option.value
                ? 'rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary'
                : 'rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground'
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="font-medium text-muted-foreground">Airport</span>
          <select
            className="mt-1 block min-w-[8rem] rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
            value={airport}
            onChange={(e) => onAirportChange(e.target.value)}
          >
            <option value="">All airports</option>
            {airports.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
