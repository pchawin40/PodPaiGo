import type { FunnelStep } from '../../../lib/admin/analyticsDashboardTypes';
import TravelCard from '../ui/TravelCard';

type FunnelCardProps = {
  steps: FunnelStep[];
  emptyLabel?: string;
};

export default function FunnelCard({ steps, emptyLabel }: FunnelCardProps) {
  const max = Math.max(...steps.map((step) => step.count), 0);

  return (
    <TravelCard>
      <h2 className="text-lg font-semibold text-foreground">Trip planning funnel</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Relative drop-off across key planning steps in the selected range.
      </p>

      {max === 0 && emptyLabel ? (
        <p className="mt-4 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ol className="mt-6 space-y-4">
          {steps.map((step, index) => (
            <li key={step.key}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="font-medium text-foreground">{step.label}</span>
                </div>
                <span className="tabular-nums text-muted-foreground">
                  {step.count} ({step.percentOfTop}%)
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(4, step.percentOfTop)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </TravelCard>
  );
}
