import { normalizeHashInput } from './hashKey';

type GeocodeCacheEntry = {
  lat: number;
  lng: number;
  ts: number;
};

const GEOCODE_CACHE = new Map<string, GeocodeCacheEntry>();
const GEOCODE_IN_FLIGHT = new Map<string, Promise<{ lat: number; lng: number } | null>>();
const DEFAULT_TTL_MS = Number(process.env.GEOCODE_CACHE_TTL_HOURS || 24) * 60 * 60 * 1000;

function geocodeCacheKey(address: string): string {
  return normalizeHashInput(address);
}

export function getCachedGeocode(address: string): { lat: number; lng: number } | null {
  const key = geocodeCacheKey(address);
  const cached = GEOCODE_CACHE.get(key);
  if (!cached) return null;

  if (Date.now() - cached.ts >= DEFAULT_TTL_MS) {
    GEOCODE_CACHE.delete(key);
    return null;
  }

  return { lat: cached.lat, lng: cached.lng };
}

export function cacheGeocode(address: string, coords: { lat: number; lng: number }): void {
  GEOCODE_CACHE.set(geocodeCacheKey(address), { ...coords, ts: Date.now() });
}

export async function dedupeGeocodeRequest(
  address: string,
  fetcher: () => Promise<{ lat: number; lng: number } | null>,
): Promise<{ lat: number; lng: number } | null> {
  const key = geocodeCacheKey(address);
  const cached = getCachedGeocode(address);
  if (cached) return cached;

  const inFlight = GEOCODE_IN_FLIGHT.get(key);
  if (inFlight) return inFlight;

  const promise = fetcher().then((result) => {
    if (result) cacheGeocode(address, result);
    return result;
  });

  GEOCODE_IN_FLIGHT.set(key, promise);

  try {
    return await promise;
  } finally {
    GEOCODE_IN_FLIGHT.delete(key);
  }
}

export function clearGeocodeCacheForTests(): void {
  GEOCODE_CACHE.clear();
  GEOCODE_IN_FLIGHT.clear();
}

export function getGeocodeCacheSize(): number {
  return GEOCODE_CACHE.size;
}
