import { normalizeHashInput } from './hashKey';
import { debugLog } from '../utils/debug';

type CacheEntry<T> = {
  ts: number;
  value: T;
};

const DEFAULT_AUTOCOMPLETE_TTL_MS =
  Number(process.env.GEOCODE_CACHE_TTL_HOURS || process.env.PLACES_SEARCH_QUERY_CACHE_TTL_HOURS || 24) *
  60 *
  60 *
  1000;
const DEFAULT_PLACES_TTL_MS =
  (Number.isFinite(Number(process.env.DESTINATION_PLACES_CACHE_TTL_MINUTES))
    ? Number(process.env.DESTINATION_PLACES_CACHE_TTL_MINUTES)
    : 10) *
  60 *
  1000;

function cacheKey(query: string, kind: 'autocomplete' | 'places'): string {
  return `${kind}:${normalizeHashInput(query)}`;
}

function createQueryCache<T>(kind: 'autocomplete' | 'places', ttlMs: number) {
  const cache = new Map<string, CacheEntry<T>>();
  const inFlight = new Map<string, Promise<T>>();

  function getCached(query: string): T | null {
    const key = cacheKey(query, kind);
    const cached = cache.get(key);
    if (!cached) {
      debugLog('destination_search_cache_miss', { kind, query: normalizeHashInput(query) });
      return null;
    }

    if (Date.now() - cached.ts >= ttlMs) {
      cache.delete(key);
      debugLog('destination_search_cache_expired', { kind, query: normalizeHashInput(query) });
      return null;
    }

    debugLog('destination_search_cache_hit', { kind, query: normalizeHashInput(query) });
    return cached.value;
  }

  function setCached(query: string, value: T): void {
    cache.set(cacheKey(query, kind), { value, ts: Date.now() });
  }

  async function dedupeRequest(
    query: string,
    fetcher: () => Promise<T>,
    shouldCache: (value: T) => boolean = () => true,
  ): Promise<T> {
    const cached = getCached(query);
    if (cached !== null) return cached;

    const key = cacheKey(query, kind);
    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = fetcher().then((result) => {
      if (shouldCache(result)) {
        setCached(query, result);
      }
      return result;
    });

    inFlight.set(key, promise);

    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  }

  function clear(): void {
    cache.clear();
    inFlight.clear();
  }

  return { getCached, setCached, dedupeRequest, clear };
}

const autocompleteCache = createQueryCache<Record<string, unknown>>(
  'autocomplete',
  DEFAULT_AUTOCOMPLETE_TTL_MS,
);
const placesCache = createQueryCache<Record<string, unknown>>('places', DEFAULT_PLACES_TTL_MS);

function isCacheableBody(body: Record<string, unknown>): boolean {
  const status = typeof body.status === 'string' ? body.status : '';
  if (
    status === 'REQUEST_BUDGET_EXCEEDED' ||
    status === 'GOOGLE_PLACES_DISABLED' ||
    status === 'MISSING_API_KEY' ||
    status === 'GOOGLE_FAILED' ||
    status === 'ROUTE_FAILED'
  ) {
    return false;
  }

  return typeof body.error !== 'string';
}

export function getCachedDestinationAutocomplete(query: string): Record<string, unknown> | null {
  return autocompleteCache.getCached(query);
}

export function cacheDestinationAutocomplete(query: string, body: Record<string, unknown>): void {
  autocompleteCache.setCached(query, body);
}

export async function dedupeDestinationAutocompleteRequest(
  query: string,
  fetcher: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  return autocompleteCache.dedupeRequest(
    query,
    fetcher,
    isCacheableBody,
  );
}

export function getCachedDestinationPlaces(query: string): Record<string, unknown> | null {
  return placesCache.getCached(query);
}

export function cacheDestinationPlaces(query: string, body: Record<string, unknown>): void {
  placesCache.setCached(query, body);
}

export async function dedupeDestinationPlacesRequest(
  query: string,
  fetcher: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  return placesCache.dedupeRequest(
    query,
    fetcher,
    isCacheableBody,
  );
}

export function clearDestinationSearchCacheForTests(): void {
  autocompleteCache.clear();
  placesCache.clear();
}
