import type { ParkingOption } from '../types';
import type { ParkingFeatureFilters } from '../trip/travelPreferences';

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
    const covered =
      option.covered === true ||
      text.includes('covered') ||
      text.includes('garage') ||
      text.includes('indoor');
    if (!covered) return false;
  }

  if (filters.shuttle) {
    const shuttle = option.transferType === 'shuttle' || text.includes('shuttle');
    if (!shuttle) return false;
  }

  if (filters.secured) {
    const secured = text.includes('secured') || text.includes('secure') || text.includes('gated');
    if (!secured) return false;
  }

  if (filters.evCharging) {
    const ev = text.includes('ev') || text.includes('charging') || text.includes('electric');
    if (!ev) return false;
  }

  if (filters.valet) {
    if (!text.includes('valet')) return false;
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
