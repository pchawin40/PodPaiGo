import { readEnvInt } from './config';

export type GooglePlacesDailyEndpoint =
  | 'searchText'
  | 'getPlace'
  | 'photoMedia'
  | 'routes'
  | 'geocoding';

const DEFAULT_DAILY_LIMITS: Record<GooglePlacesDailyEndpoint, number> = {
  searchText: 100,
  getPlace: 100,
  photoMedia: 20,
  routes: 100,
  geocoding: 50,
};

const ENV_BY_ENDPOINT: Record<GooglePlacesDailyEndpoint, string> = {
  searchText: 'GOOGLE_SEARCHTEXT_DAILY_LIMIT',
  getPlace: 'GOOGLE_GETPLACE_DAILY_LIMIT',
  photoMedia: 'GOOGLE_PHOTO_MEDIA_DAILY_LIMIT',
  routes: 'GOOGLE_ROUTES_DAILY_LIMIT',
  geocoding: 'GEOCODING_DAILY_LIMIT',
};

type DailyCounter = {
  count: number;
  dayKey: string;
};

const inMemoryDailyCounters = new Map<GooglePlacesDailyEndpoint, DailyCounter>();

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getGooglePlacesDailyLimit(endpoint: GooglePlacesDailyEndpoint): number {
  return readEnvInt(ENV_BY_ENDPOINT[endpoint], DEFAULT_DAILY_LIMITS[endpoint]);
}

function readInMemoryDailyCount(endpoint: GooglePlacesDailyEndpoint): number {
  const dayKey = todayKey();
  const entry = inMemoryDailyCounters.get(endpoint);
  if (!entry || entry.dayKey !== dayKey) return 0;
  return entry.count;
}

function bumpInMemoryDailyCount(endpoint: GooglePlacesDailyEndpoint): void {
  const dayKey = todayKey();
  const entry = inMemoryDailyCounters.get(endpoint);
  if (!entry || entry.dayKey !== dayKey) {
    inMemoryDailyCounters.set(endpoint, { count: 1, dayKey });
    return;
  }
  entry.count += 1;
}

export function canConsumeGooglePlacesDailyCallSync(
  endpoint: GooglePlacesDailyEndpoint,
): boolean {
  const limit = getGooglePlacesDailyLimit(endpoint);
  if (limit <= 0) return false;
  return readInMemoryDailyCount(endpoint) < limit;
}

export async function canConsumeGooglePlacesDailyCall(
  endpoint: GooglePlacesDailyEndpoint,
): Promise<boolean> {
  return canConsumeGooglePlacesDailyCallSync(endpoint);
}

export function recordGooglePlacesDailyCall(endpoint: GooglePlacesDailyEndpoint): void {
  bumpInMemoryDailyCount(endpoint);
}

export function getGooglePlacesDailyCountsSnapshot(): Record<GooglePlacesDailyEndpoint, number> {
  return {
    searchText: readInMemoryDailyCount('searchText'),
    getPlace: readInMemoryDailyCount('getPlace'),
    photoMedia: readInMemoryDailyCount('photoMedia'),
    routes: readInMemoryDailyCount('routes'),
    geocoding: readInMemoryDailyCount('geocoding'),
  };
}

export function resetGooglePlacesDailyBudgetForTests(): void {
  inMemoryDailyCounters.clear();
}
