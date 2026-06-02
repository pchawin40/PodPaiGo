type CachedPhotoMedia = {
  body: ArrayBuffer;
  contentType: string;
  ts: number;
};

const photoMediaCache = new Map<string, CachedPhotoMedia>();
const photoMediaInFlight = new Map<string, Promise<CachedPhotoMedia | null>>();

const DEFAULT_TTL_MS =
  Number(process.env.PLACE_PHOTO_MEDIA_CACHE_TTL_HOURS || 24) * 60 * 60 * 1000;
const MAX_ENTRIES = Number(process.env.PLACE_PHOTO_MEDIA_CACHE_MAX || 200);

function cacheKey(photoName: string, maxWidthPx: number): string {
  return `${photoName}|${maxWidthPx}`;
}

function evictIfNeeded(): void {
  if (photoMediaCache.size <= MAX_ENTRIES) return;

  const oldest = [...photoMediaCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  const removeCount = photoMediaCache.size - MAX_ENTRIES;
  for (let i = 0; i < removeCount; i += 1) {
    photoMediaCache.delete(oldest[i][0]);
  }
}

export function getCachedPhotoMedia(
  photoName: string,
  maxWidthPx: number,
): CachedPhotoMedia | null {
  const key = cacheKey(photoName, maxWidthPx);
  const cached = photoMediaCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.ts >= DEFAULT_TTL_MS) {
    photoMediaCache.delete(key);
    return null;
  }

  return cached;
}

export function cachePhotoMedia(
  photoName: string,
  maxWidthPx: number,
  body: ArrayBuffer,
  contentType: string,
): void {
  const key = cacheKey(photoName, maxWidthPx);
  photoMediaCache.set(key, { body, contentType, ts: Date.now() });
  evictIfNeeded();
}

export async function dedupePhotoMediaFetch(
  photoName: string,
  maxWidthPx: number,
  fetcher: () => Promise<CachedPhotoMedia | null>,
): Promise<CachedPhotoMedia | null> {
  const cached = getCachedPhotoMedia(photoName, maxWidthPx);
  if (cached) return cached;

  const key = cacheKey(photoName, maxWidthPx);
  const inFlight = photoMediaInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = fetcher().then((result) => {
    if (result) cachePhotoMedia(photoName, maxWidthPx, result.body, result.contentType);
    return result;
  });

  photoMediaInFlight.set(key, promise);

  try {
    return await promise;
  } finally {
    photoMediaInFlight.delete(key);
  }
}

export function clearPhotoMediaCacheForTests(): void {
  photoMediaCache.clear();
  photoMediaInFlight.clear();
}

export function getPhotoMediaCacheSize(): number {
  return photoMediaCache.size;
}
