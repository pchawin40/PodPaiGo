import type { RecommendationSortMode } from '../domain';
import type { DestinationKind, TransportAvailability } from '../types';

export type BusinessTravelMode = 'standard' | 'expense_rideshare' | 'no_parking';

export type ParkingFeatureFilters = {
  covered?: boolean;
  secured?: boolean;
  shuttle?: boolean;
  evCharging?: boolean;
  valet?: boolean;
  selfPark?: boolean;
};

export type TripTravelPreferences = {
  businessTravelMode: BusinessTravelMode;
  parkingFilters: ParkingFeatureFilters;
};

export type SavedFavoriteLocation = {
  id: string;
  label: string;
  destinationText: string;
  originText?: string | null;
  destinationKind?: DestinationKind;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_TRAVEL_PREFERENCES: TripTravelPreferences = {
  businessTravelMode: 'standard',
  parkingFilters: {},
};

export const FAVORITE_LOCATIONS_STORAGE_KEY = 'podpaigo-favorite-locations';
export const TRAVEL_PREFERENCES_STORAGE_KEY = 'podpaigo-travel-preferences';
export const MAX_FAVORITE_LOCATIONS = 12;

export function isBusinessTravelMode(value: string | null | undefined): value is BusinessTravelMode {
  return value === 'standard' || value === 'expense_rideshare' || value === 'no_parking';
}

export function businessTravelModeNeedsParking(mode: BusinessTravelMode): boolean {
  return mode === 'standard';
}

export function parseParkingFiltersFromParam(value: string | null | undefined): ParkingFeatureFilters {
  if (!value?.trim()) return {};

  const filters: ParkingFeatureFilters = {};
  for (const token of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    if (token === 'covered') filters.covered = true;
    if (token === 'secured') filters.secured = true;
    if (token === 'shuttle') filters.shuttle = true;
    if (token === 'ev' || token === 'evCharging') filters.evCharging = true;
    if (token === 'valet') filters.valet = true;
    if (token === 'selfPark' || token === 'self-park') filters.selfPark = true;
  }

  return filters;
}

export function serializeParkingFilters(filters: ParkingFeatureFilters): string {
  const tokens: string[] = [];
  if (filters.covered) tokens.push('covered');
  if (filters.secured) tokens.push('secured');
  if (filters.shuttle) tokens.push('shuttle');
  if (filters.evCharging) tokens.push('ev');
  if (filters.valet) tokens.push('valet');
  if (filters.selfPark) tokens.push('selfPark');
  return tokens.join(',');
}

export function readTravelPreferences(): TripTravelPreferences {
  if (typeof window === 'undefined') return DEFAULT_TRAVEL_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(TRAVEL_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_TRAVEL_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<TripTravelPreferences>;
    return {
      businessTravelMode: isBusinessTravelMode(parsed.businessTravelMode)
        ? parsed.businessTravelMode
        : 'standard',
      parkingFilters: parsed.parkingFilters || {},
    };
  } catch {
    return DEFAULT_TRAVEL_PREFERENCES;
  }
}

export function writeTravelPreferences(preferences: TripTravelPreferences): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(TRAVEL_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function readFavoriteLocations(): SavedFavoriteLocation[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(FAVORITE_LOCATIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedFavoriteLocation[]) : [];
  } catch {
    return [];
  }
}

export function writeFavoriteLocations(locations: SavedFavoriteLocation[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(FAVORITE_LOCATIONS_STORAGE_KEY, JSON.stringify(locations.slice(0, MAX_FAVORITE_LOCATIONS)));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function upsertFavoriteLocation(input: {
  label: string;
  destinationText: string;
  originText?: string | null;
  destinationKind?: DestinationKind;
}): SavedFavoriteLocation[] {
  const now = new Date().toISOString();
  const existing = readFavoriteLocations();
  const normalizedDestination = input.destinationText.trim().toLowerCase();
  const found = existing.find(
    (item) => item.destinationText.trim().toLowerCase() === normalizedDestination,
  );

  if (found) {
    const next = existing.map((item) =>
      item.id === found.id
        ? {
            ...item,
            label: input.label,
            originText: input.originText ?? item.originText,
            destinationKind: input.destinationKind ?? item.destinationKind,
            updatedAt: now,
          }
        : item,
    );
    writeFavoriteLocations(next);
    return next;
  }

  const created: SavedFavoriteLocation = {
    id: crypto.randomUUID?.() ?? `favorite-location-${Date.now()}`,
    label: input.label,
    destinationText: input.destinationText.trim(),
    originText: input.originText ?? null,
    destinationKind: input.destinationKind,
    createdAt: now,
    updatedAt: now,
  };

  const next = [created, ...existing].slice(0, MAX_FAVORITE_LOCATIONS);
  writeFavoriteLocations(next);
  return next;
}

export type SavedFavoriteTripPreferences = {
  preferredSort?: RecommendationSortMode;
  transportAvailability?: TransportAvailability;
  businessTravelMode?: BusinessTravelMode;
  parkingFilters?: ParkingFeatureFilters;
};
