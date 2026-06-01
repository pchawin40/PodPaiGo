import { getAirportById } from '../airports/catalog';
import type { RecommendationSortMode } from '../domain';
import type {
  CabinClass,
  DestinationKind,
  TransportAvailability,
  TripType,
} from '../types';

export type FavoriteTripIntent =
  | 'general-trip'
  | 'flying-out'
  | 'picking-up'
  | 'dropping-off'
  | 'parking-trip';

export type SavedFavoriteTrip = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  origin: string;
  airportCode: string;
  intent: FavoriteTripIntent;
  checkingBags: boolean;
  cabin: CabinClass;
  transportAvailability: TransportAvailability;
  preferredSort: RecommendationSortMode;
  destination?: string;
  destinationKind?: DestinationKind;
};

export const FAVORITE_TRIPS_STORAGE_KEY = 'podpaigo-favorite-trips';
export const MAX_FAVORITE_TRIPS = 10;

export type FavoriteTripInput = Omit<SavedFavoriteTrip, 'id' | 'name' | 'createdAt' | 'updatedAt'>;

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function generateFavoriteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `favorite-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function shortOriginLabel(origin: string): string {
  const trimmed = origin.trim();
  if (!trimmed) return 'Trip';

  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);

  if (parts.length >= 2 && /^\d/.test(parts[0])) {
    const city = parts[1].replace(/\s+\d{5}.*$/, '').trim();
    if (city) {
      return city.split(/\s+/)[0];
    }

    return 'Home';
  }

  const first = parts[0] || trimmed;
  if (/^\d/.test(first)) {
    return 'Home';
  }

  return first.split(/\s+/)[0];
}

export function buildFavoriteTripName(
  trip: Pick<SavedFavoriteTrip, 'origin' | 'airportCode' | 'intent' | 'destination'>,
): string {
  const from = shortOriginLabel(trip.origin);

  if (trip.intent === 'general-trip') {
    const destinationLabel = trip.destination
      ? shortOriginLabel(trip.destination)
      : 'Destination';
    return `${from} → ${destinationLabel}`;
  }

  return `${from} → ${trip.airportCode.toUpperCase()}`;
}

export function isFavoriteTripIntent(value: string): value is FavoriteTripIntent {
  return (
    value === 'general-trip' ||
    value === 'flying-out' ||
    value === 'picking-up' ||
    value === 'dropping-off' ||
    value === 'parking-trip'
  );
}

export function intentToTripType(intent: FavoriteTripIntent): TripType {
  switch (intent) {
    case 'general-trip':
      return 'general-trip';
    case 'flying-out':
    case 'parking-trip':
      return 'one-way-departure';
    case 'picking-up':
    case 'dropping-off':
      return 'dropoff-pickup';
  }
}

function defaultTripTime(intent: FavoriteTripIntent): string {
  if (intent === 'flying-out') {
    return '12:00';
  }

  const next = new Date();
  const offsetMinutes = intent === 'dropping-off' ? 90 : 60;
  next.setMinutes(next.getMinutes() + offsetMinutes);

  return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
}

function normalizeFavoriteTrip(value: unknown): SavedFavoriteTrip | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Partial<SavedFavoriteTrip>;
  const intentCandidate = String(raw.intent ?? '');

  if (
    typeof raw.id !== 'string' ||
    typeof raw.origin !== 'string' ||
    !raw.origin.trim() ||
    typeof raw.airportCode !== 'string' ||
    !isFavoriteTripIntent(intentCandidate)
  ) {
    return null;
  }

  const intent = intentCandidate;

  const preferredSort =
    raw.preferredSort === 'cheapest' ||
    raw.preferredSort === 'fastest' ||
    raw.preferredSort === 'easiest'
      ? raw.preferredSort
      : 'easiest';

  const trip: SavedFavoriteTrip = {
    id: raw.id,
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : buildFavoriteTripName({
            origin: raw.origin,
            airportCode: raw.airportCode.toUpperCase(),
            intent,
            destination: raw.destination,
          }),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    origin: raw.origin.trim(),
    airportCode: raw.airportCode.toUpperCase(),
    intent,
    checkingBags: raw.checkingBags === true,
    cabin: raw.cabin === 'premium' ? 'premium' : 'economy',
    transportAvailability:
      raw.transportAvailability === 'car' ||
      raw.transportAvailability === 'rideshare' ||
      raw.transportAvailability === 'transit' ||
      raw.transportAvailability === 'all'
        ? raw.transportAvailability
        : 'all',
    preferredSort,
    destination: typeof raw.destination === 'string' ? raw.destination.trim() : undefined,
    destinationKind: raw.destinationKind,
  };

  return trip;
}

export function readFavoriteTrips(storage?: Pick<Storage, 'getItem'> | null): SavedFavoriteTrip[] {
  if (!storage) return [];

  try {
    const raw = storage.getItem(FAVORITE_TRIPS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => normalizeFavoriteTrip(entry))
      .filter((entry): entry is SavedFavoriteTrip => entry != null)
      .slice(0, MAX_FAVORITE_TRIPS);
  } catch {
    return [];
  }
}

export function writeFavoriteTrips(
  trips: SavedFavoriteTrip[],
  storage?: Pick<Storage, 'setItem'> | null,
): boolean {
  if (!storage) return false;

  try {
    storage.setItem(
      FAVORITE_TRIPS_STORAGE_KEY,
      JSON.stringify(trips.slice(0, MAX_FAVORITE_TRIPS)),
    );
    return true;
  } catch {
    return false;
  }
}

function favoriteSignature(trip: FavoriteTripInput): string {
  return [
    trip.origin.trim().toLowerCase(),
    trip.airportCode.toUpperCase(),
    trip.intent,
    trip.destination?.trim().toLowerCase() || '',
  ].join('|');
}

export function upsertFavoriteTrip(
  input: FavoriteTripInput,
  storage?: Storage | null,
): SavedFavoriteTrip | null {
  if (!storage || !input.origin.trim()) return null;

  const now = new Date().toISOString();
  const existing = readFavoriteTrips(storage);
  const signature = favoriteSignature(input);
  const matchIndex = existing.findIndex((trip) => favoriteSignature(trip) === signature);

  const nextTrip: SavedFavoriteTrip = {
    id: matchIndex >= 0 ? existing[matchIndex].id : generateFavoriteId(),
    name: buildFavoriteTripName(input),
    createdAt: matchIndex >= 0 ? existing[matchIndex].createdAt : now,
    updatedAt: now,
    ...input,
    origin: input.origin.trim(),
    airportCode: input.airportCode.toUpperCase(),
    destination: input.destination?.trim() || undefined,
  };

  const nextTrips =
    matchIndex >= 0
      ? existing.map((trip, index) => (index === matchIndex ? nextTrip : trip))
      : [nextTrip, ...existing].slice(0, MAX_FAVORITE_TRIPS);

  return writeFavoriteTrips(nextTrips, storage) ? nextTrip : null;
}

export function deleteFavoriteTrip(id: string, storage?: Storage | null): SavedFavoriteTrip[] {
  if (!storage) return [];

  const existing = readFavoriteTrips(storage);
  const nextTrips = existing.filter((trip) => trip.id !== id);
  writeFavoriteTrips(nextTrips, storage);
  return nextTrips;
}

export function favoriteTripToSearchParams(favorite: SavedFavoriteTrip): URLSearchParams {
  const params = new URLSearchParams();
  const tripType = intentToTripType(favorite.intent);
  const today = formatLocalDate(new Date());
  const tripTime = defaultTripTime(favorite.intent);
  const selectedAirport = getAirportById(favorite.airportCode) || getAirportById('SEA')!;

  params.set('type', tripType);
  params.set('origin', favorite.origin);
  params.set('intent', favorite.intent);
  params.set('transport', favorite.transportAvailability);
  params.set('transitPayment', 'normal');
  params.set('sort', favorite.preferredSort);

  if (favorite.intent === 'general-trip') {
    const destination = favorite.destination?.trim() || '';
    params.set('destination', destination);
    params.set('destinationName', destination);
    params.set('destinationKind', favorite.destinationKind || 'general');
    params.set('timeAnchor', 'arrival-time');
    params.set('arrivalDate', today);
    params.set('arrivalTime', tripTime);
    params.set('parkingCheckInDate', today);
    params.set('parkingCheckInTime', tripTime);
    params.set('parkingDuration', String(8 * 60));

    const checkout = addDays(today, 0);
    params.set('parkingCheckOutDate', checkout);
    params.set('parkingCheckOutTime', tripTime);
  } else {
    params.set('destination', selectedAirport.routingAddress);
    params.set('airport', selectedAirport.id);
    params.set('airportCode', selectedAirport.id);
    params.set('airportName', selectedAirport.label);
    params.set('rideshareDestinationName', selectedAirport.rideshareDestinationName);
    params.set('airportCheckinNote', selectedAirport.checkinNote || '');
    params.set('timeAnchor', 'flight-departure');

    if (tripType === 'one-way-departure') {
      params.set('departureDate', today);
      params.set('departureTime', tripTime);
      params.set('parkingCheckInDate', today);

      if (favorite.intent === 'flying-out' || favorite.intent === 'parking-trip') {
        params.set('parkingCheckOutDate', addDays(today, 7));
        params.set('parkingDuration', String(7 * 24 * 60));
      }

      if (favorite.intent === 'flying-out') {
        params.set('bags', favorite.checkingBags ? 'yes' : 'no');
        params.set('security', 'standard');
        params.set('securityOption', 'standard');
        params.set('flightType', 'domestic');
        params.set('cabin', favorite.cabin);
      }
    } else {
      params.set('airportTripDate', today);
      params.set('airportTripTime', tripTime);
    }
  }

  params.set('recalc', String(Date.now()));
  return params;
}

export function intentFromSearchParams(intentParam: string | null | undefined): FavoriteTripIntent {
  if (intentParam && isFavoriteTripIntent(intentParam)) {
    return intentParam;
  }

  return 'flying-out';
}
