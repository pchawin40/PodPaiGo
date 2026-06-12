import type { ParkingOption } from '../types';
import type { ParkingFeatureFilters } from '../trip/travelPreferences';
import { getParkingFeatureMeta } from './featureConfidence';

function haystack(option: ParkingOption): string {
  return [
    option.name,
    option.address,
    option.type,
    ...(option.bestFor || []),
  ]
    .join(' ')
    .toLowerCase();
}

export function hasActiveParkingFilters(filters?: ParkingFeatureFilters | null): boolean {
  if (!filters) return false;
  return Object.values(filters).some(Boolean);
}

export function matchesParkingFeatureFilters(
  option: ParkingOption,
  filters?: ParkingFeatureFilters | null,
): boolean {
  if (!hasActiveParkingFilters(filters) || !filters) return true;

  const text = haystack(option);

  if (filters.covered) {
    if (!getParkingFeatureMeta(option, 'covered').passesStrictFilter) return false;
  }

  if (filters.shuttle) {
    if (!getParkingFeatureMeta(option, 'shuttle').passesStrictFilter) return false;
  }

  if (filters.secured) {
    if (!getParkingFeatureMeta(option, 'secured').passesStrictFilter) return false;
  }

  if (filters.evCharging) {
    if (!getParkingFeatureMeta(option, 'evCharging').passesStrictFilter) return false;
  }

  if (filters.valet) {
    if (!getParkingFeatureMeta(option, 'valet').passesStrictFilter) return false;
  }

  if (filters.selfPark) {
    if (text.includes('valet')) return false;
  }

  return true;
}

export function filterParkingOptionsByFeatures(
  options: ParkingOption[],
  filters?: ParkingFeatureFilters | null,
): ParkingOption[] {
  if (!hasActiveParkingFilters(filters)) return options;
  return options.filter((option) => matchesParkingFeatureFilters(option, filters));
}

/**
 * Excel-style feature counts for the filter chips: how many lots in the
 * current result set would match each feature if that filter alone were toggled.
 * Counts use the same strict matching rules as `matchesParkingFeatureFilters`
 * and are computed on the base/unfiltered lot list (before active filters apply).
 */
export function countParkingFeatureMatches(
  options: ParkingOption[],
): Record<keyof ParkingFeatureFilters, number> {
  const keys = Object.keys(PARKING_FILTER_LABELS) as Array<keyof ParkingFeatureFilters>;
  return keys.reduce(
    (counts, key) => {
      counts[key] = options.filter((option) =>
        matchesParkingFeatureFilters(option, { [key]: true }),
      ).length;
      return counts;
    },
    {
      covered: 0,
      secured: 0,
      shuttle: 0,
      evCharging: 0,
      valet: 0,
      selfPark: 0,
    } satisfies Record<keyof ParkingFeatureFilters, number>,
  );
}

export const PARKING_FILTER_LABELS: Record<keyof ParkingFeatureFilters, string> = {
  covered: 'Covered',
  secured: 'Secured',
  shuttle: 'Shuttle',
  evCharging: 'EV charging',
  valet: 'Valet',
  selfPark: 'Self-park',
};
