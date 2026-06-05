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

export const PARKING_FILTER_LABELS: Record<keyof ParkingFeatureFilters, string> = {
  covered: 'Covered',
  secured: 'Secured',
  shuttle: 'Shuttle',
  evCharging: 'EV charging',
  valet: 'Valet',
  selfPark: 'Self-park',
};
