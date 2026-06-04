import type { ParkingOption } from '../../types';
import { debugLog } from '../../utils/debug';

export type ParkingSearchCacheArgs = {
  airportCode?: string;
  airportCoordinates?: { lat: number; lng: number };
  destination: string;
  checkInDate?: string;
  checkOutDate?: string;
};

const SEARCH_CACHE_TTL_MS = Number(process.env.PARKING_SEARCH_CACHE_TTL_MS || 120_000);

const searchInFlight = new Map<string, Promise<ParkingOption[]>>();
const searchResultCache = new Map<string, { expiresAt: number; options: ParkingOption[] }>();

function searchCacheKey(args: ParkingSearchCacheArgs): string {
  return JSON.stringify({
    airportCode: (args.airportCode || 'SEA').toUpperCase(),
    airportCoordinates: args.airportCoordinates ?? null,
    destination: args.destination,
    checkInDate: args.checkInDate ?? null,
    checkOutDate: args.checkOutDate ?? null,
  });
}

export async function withParkingSearchCache(
  args: ParkingSearchCacheArgs,
  execute: () => Promise<ParkingOption[]>,
): Promise<ParkingOption[]> {
  const key = searchCacheKey(args);
  const now = Date.now();
  const cached = searchResultCache.get(key);

  if (cached && cached.expiresAt > now) {
    debugLog('parking_search_cache_hit', { cacheKey: key });
    return cached.options;
  }

  const inFlight = searchInFlight.get(key);
  if (inFlight) {
    debugLog('parking_search_cache_hit', { cacheKey: key, inFlight: true });
    return inFlight;
  }

  debugLog('parking_search_cache_miss', { cacheKey: key });

  const promise = execute()
    .then((options) => {
      searchResultCache.set(key, {
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
        options,
      });
      return options;
    })
    .finally(() => {
      searchInFlight.delete(key);
    });

  searchInFlight.set(key, promise);
  return promise;
}

export function resetParkingSearchCacheForTests(): void {
  searchInFlight.clear();
  searchResultCache.clear();
}
