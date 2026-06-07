'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_TRAVEL_PREFERENCES,
  type BusinessTravelMode,
  type ParkingFeatureFilters,
  type TripTravelPreferences,
  readTravelPreferences,
  writeTravelPreferences,
} from '../../lib/trip/travelPreferences';
import { PARKING_FILTER_LABELS } from '../../lib/parking/parkingFilters';
import StatusPill from './ui/StatusPill';
import TravelCard from './ui/TravelCard';

type TravelPreferencesPanelProps = {
  value?: TripTravelPreferences;
  onChange?: (preferences: TripTravelPreferences) => void;
  className?: string;
  embedded?: boolean;
  hideParkingFilters?: boolean;
};

const BUSINESS_MODE_OPTIONS: Array<{ value: BusinessTravelMode; label: string; detail: string }> = [
  {
    value: 'standard',
    label: 'I’m driving / need parking',
    detail: 'Show parking normally and let Smart Pick choose parking when it is best.',
  },
  {
    value: 'no_parking',
    label: 'No parking needed',
    detail: 'Hide parking cards by default and prioritize rideshare, transit, or directions.',
  },
  {
    value: 'compare_all',
    label: 'Compare all',
    detail: 'Show parking, rideshare, transit, and park-and-ride where available.',
  },
];

const FILTER_KEYS = Object.keys(PARKING_FILTER_LABELS) as Array<keyof ParkingFeatureFilters>;

export default function TravelPreferencesPanel({
  value,
  onChange,
  className = '',
  embedded = false,
  hideParkingFilters = false,
}: TravelPreferencesPanelProps) {
  const [preferences, setPreferences] = useState<TripTravelPreferences>(
    value || DEFAULT_TRAVEL_PREFERENCES,
  );

  useEffect(() => {
    if (value) {
      setPreferences(value);
      return;
    }

    setPreferences(readTravelPreferences());
  }, [value]);

  const updatePreferences = (next: TripTravelPreferences) => {
    setPreferences(next);
    writeTravelPreferences(next);
    onChange?.(next);
  };

  const toggleFilter = (key: keyof ParkingFeatureFilters) => {
    updatePreferences({
      ...preferences,
      parkingFilters: {
        ...preferences.parkingFilters,
        [key]: !preferences.parkingFilters[key],
      },
    });
  };

  const content = (
    <>
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Travel preferences
      </div>
      <h3 className="mt-1 text-lg font-semibold text-foreground">Car and parking preference</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Saved locally on this device.
      </p>

      <div className="mt-4 grid gap-2">
        {BUSINESS_MODE_OPTIONS.map((option) => {
          const active = preferences.businessTravelMode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                updatePreferences({
                  ...preferences,
                  businessTravelMode: option.value,
                })
              }
              className={
                'rounded-2xl border px-4 py-3 text-left transition ' +
                (active
                  ? 'border-primary/30 bg-primary/10'
                  : 'border-border bg-card hover:border-primary/20 hover:bg-muted/50')
              }
            >
              <div className="font-semibold text-foreground">{option.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{option.detail}</div>
            </button>
          );
        })}
      </div>

      {!hideParkingFilters ? (
        <div className="mt-6">
          <div className="text-sm font-medium text-foreground">Parking filters</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Filters use verified or provider-claimed features. Inferred claims stay visible but do not pass strict filters.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {FILTER_KEYS.map((key) => {
              const active = Boolean(preferences.parkingFilters[key]);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleFilter(key)}
                  className="rounded-full"
                >
                  <StatusPill tone={active ? 'primary' : 'muted'}>{PARKING_FILTER_LABELS[key]}</StatusPill>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className={className}>{content}</div>;
  }

  return (
    <TravelCard padding="sm" className={className}>
      {content}
    </TravelCard>
  );
}
