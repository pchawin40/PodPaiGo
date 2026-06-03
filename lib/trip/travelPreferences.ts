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

export type SavedParkingLot = {
  id: string;
  label?: string;
  name: string;
  airportCode?: string | null;
  address?: string | null;
  notes?: string | null;
  accessType?: 'free' | 'paid' | 'validated' | 'employee-only' | 'permit' | 'unknown';
  savedAt: string;
  updatedAt?: string;
};

export const SAVED_PARKING_LOTS_STORAGE_KEY = 'podpaigo-saved-parking-lots';
export const MAX_SAVED_PARKING_LOTS = 24;

export function readSavedParkingLots(): SavedParkingLot[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(SAVED_PARKING_LOTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedParkingLot[]) : [];
  } catch {
    return [];
  }
}

export function writeSavedParkingLots(lots: SavedParkingLot[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      SAVED_PARKING_LOTS_STORAGE_KEY,
      JSON.stringify(lots.slice(0, MAX_SAVED_PARKING_LOTS)),
    );
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function upsertSavedParkingLot(input: {
  label?: string;
  lotName: string;
  address?: string | null;
  notes?: string | null;
  accessType?: SavedParkingLot['accessType'];
  airportCode?: string | null;
}): SavedParkingLot[] {
  const now = new Date().toISOString();
  const existing = readSavedParkingLots();
  const normalizedLot = input.lotName.trim().toLowerCase();
  const found = existing.find((item) => item.name.trim().toLowerCase() === normalizedLot);

  if (found) {
    const next = existing.map((item) =>
      item.id === found.id
        ? {
            ...item,
            label: input.label?.trim() || item.label,
            name: input.lotName.trim(),
            address: input.address ?? item.address,
            notes: input.notes ?? item.notes,
            accessType: input.accessType ?? item.accessType,
            airportCode: input.airportCode ?? item.airportCode,
            updatedAt: now,
          }
        : item,
    );
    writeSavedParkingLots(next);
    return next;
  }

  const created: SavedParkingLot = {
    id: crypto.randomUUID?.() ?? `saved-parking-lot-${Date.now()}`,
    label: input.label?.trim() || input.lotName.trim(),
    name: input.lotName.trim(),
    address: input.address ?? null,
    notes: input.notes ?? null,
    accessType: input.accessType ?? 'unknown',
    airportCode: input.airportCode ?? null,
    savedAt: now,
    updatedAt: now,
  };

  const next = [created, ...existing].slice(0, MAX_SAVED_PARKING_LOTS);
  writeSavedParkingLots(next);
  return next;
}

export function deleteSavedParkingLot(id: string): SavedParkingLot[] {
  const next = readSavedParkingLots().filter((item) => item.id !== id);
  writeSavedParkingLots(next);
  return next;
}
