import type { ActivityFeedItem } from '../../../lib/admin/analyticsDashboardTypes';
import StatusPill from '../ui/StatusPill';
import TravelCard from '../ui/TravelCard';

type EventActivityFeedProps = {
  items: ActivityFeedItem[];
  emptyLabel?: string;
};

function formatWhen(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function EventActivityFeed({ items, emptyLabel }: EventActivityFeedProps) {
  return (
    <TravelCard>
      <h2 className="text-lg font-semibold text-foreground">Recent activity</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Latest events with airport, category, and provider context only.
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {emptyLabel ?? 'No recent events in this range.'}
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{item.eventName}</span>
                  <StatusPill tone={item.actorLabel === 'user' ? 'primary' : 'muted'}>
                    {item.actorLabel}
                  </StatusPill>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[item.airportCode, item.destinationCategory, item.cityRegion, item.provider, item.lotName]
                    .filter(Boolean)
                    .join(' · ') || 'No location context'}
                </p>
                {item.detail ? (
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                ) : null}
              </div>
              <time className="shrink-0 text-xs text-muted-foreground">{formatWhen(item.at)}</time>
            </li>
          ))}
        </ul>
      )}
    </TravelCard>
  );
}
