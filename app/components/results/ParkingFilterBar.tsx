'use client';

import type { ParkingFeatureFilters, TripTravelPreferences } from '../../../lib/trip/travelPreferences';
import { PARKING_FILTER_LABELS } from '../../../lib/parking/parkingFilters';
import StatusPill from '../ui/StatusPill';

type ParkingFilterBarProps = {
  preferences: TripTravelPreferences;
  featureCounts?: Partial<Record<keyof ParkingFeatureFilters, number>>;
  onToggle: (key: keyof ParkingFeatureFilters) => void;
  className?: string;
};

const FILTER_KEYS = Object.keys(PARKING_FILTER_LABELS) as Array<keyof ParkingFeatureFilters>;

function chipLabel(
  key: keyof ParkingFeatureFilters,
  featureCounts?: Partial<Record<keyof ParkingFeatureFilters, number>>,
): string {
  const base = PARKING_FILTER_LABELS[key];
  const count = featureCounts?.[key];
  return typeof count === 'number' ? `${base} (${count})` : base;
}

export default function ParkingFilterBar({
  preferences,
  featureCounts,
  onToggle,
  className = '',
}: ParkingFilterBarProps) {
  return (
    <div className={'rounded-xl border border-border bg-card/70 px-3 py-2 ' + className}>
      <div className="text-sm font-medium text-foreground">Filter parking</div>
      <p className="mt-1 text-xs text-muted-foreground">
        Narrow lots by features. Always confirm details with the provider.
      </p>
      <div className="mt-2 -mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max flex-wrap gap-1.5 px-1 sm:min-w-0">
          {FILTER_KEYS.map((key) => {
            const active = Boolean(preferences.parkingFilters[key]);
            const count = featureCounts?.[key];
            const zeroCount = typeof count === 'number' && count === 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggle(key)}
                className="shrink-0 rounded-full"
                aria-pressed={active}
              >
                <StatusPill
                  tone={active ? 'primary' : 'muted'}
                  className={zeroCount && !active ? 'opacity-60' : undefined}
                >
                  {chipLabel(key, featureCounts)}
                </StatusPill>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
