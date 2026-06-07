import type { ParkingGooglePlaceCacheRecord } from './googlePlacesCache';

export type CachedPlaceMetadata = ParkingGooglePlaceCacheRecord;

type RequestPlaceMetadataCache = Map<string, CachedPlaceMetadata | null>;

let activeRequestCache: RequestPlaceMetadataCache | null = null;
let activeRequestKey: string | null = null;

export function runWithPlaceMetadataRequestCache<T>(
  requestKey: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const previousCache = activeRequestCache;
  const previousKey = activeRequestKey;

  activeRequestCache = new Map();
  activeRequestKey = requestKey;

  return Promise.resolve(fn()).finally(() => {
    activeRequestCache = previousCache;
    activeRequestKey = previousKey;
  });
}

export function getPlaceMetadataRequestCacheHit(
  cacheKey: string,
): CachedPlaceMetadata | null | undefined {
  if (!activeRequestCache) return undefined;
  if (!activeRequestCache.has(cacheKey)) return undefined;
  return activeRequestCache.get(cacheKey) ?? null;
}

export function setPlaceMetadataRequestCacheHit(
  cacheKey: string,
  record: CachedPlaceMetadata | null,
): void {
  if (!activeRequestCache) return;
  activeRequestCache.set(cacheKey, record);
}

export function getActivePlaceMetadataRequestKey(): string | null {
  return activeRequestKey;
}

export function resetPlaceMetadataRequestCacheForTests(): void {
  activeRequestCache = null;
  activeRequestKey = null;
}
