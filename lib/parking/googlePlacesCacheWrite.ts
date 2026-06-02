import { TimeoutError, withTimeout } from '../utils/asyncTimeout';

const MAX_CONCURRENT_CACHE_WRITES = 2;
const FAILED_WRITE_COOLDOWN_MS = 60_000;

type CacheWriteRecord = {
  cacheKey: string;
  expiresAt?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  photoName?: string;
  photoNames?: string[];
  reviews?: unknown[];
};

type EnqueueGooglePlacesCacheWriteArgs = {
  cacheKey: string;
  incoming: CacheWriteRecord;
  existing?: CacheWriteRecord | null;
  loadExisting?: () => Promise<CacheWriteRecord | null>;
  write: () => Promise<void>;
};

let activeWrites = 0;
const pendingWrites: Array<() => void> = [];
const loggedWriteFailures = new Set<string>();
const recentFailedWriteKeys = new Map<string, number>();

export function getGooglePlacesCacheWriteTimeoutMs(): number {
  const configured = Number(process.env.GOOGLE_PLACES_CACHE_WRITE_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  const legacy = Number(process.env.GOOGLE_PLACE_DB_WRITE_TIMEOUT_MS);
  if (Number.isFinite(legacy) && legacy > 0) {
    return legacy;
  }

  return process.env.NODE_ENV === 'production' ? 5000 : 10_000;
}

function hasPhotoMetadata(record: Pick<CacheWriteRecord, 'photoName' | 'photoNames'>): boolean {
  return Boolean(record.photoNames?.length || record.photoName);
}

function hasUsablePlaceCoords(record: Pick<CacheWriteRecord, 'googlePlaceId' | 'lat' | 'lng'>): boolean {
  return (
    Boolean(record.googlePlaceId) &&
    typeof record.lat === 'number' &&
    typeof record.lng === 'number'
  );
}

function isFreshRecord(record: Pick<CacheWriteRecord, 'expiresAt'>): boolean {
  if (!record.expiresAt) return false;
  const expiresAtMs = Date.parse(record.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

export function incomingImprovesGooglePlacesCache(
  existing: CacheWriteRecord,
  incoming: CacheWriteRecord,
): boolean {
  if (!hasUsablePlaceCoords(existing) && hasUsablePlaceCoords(incoming)) {
    return true;
  }

  if (!hasPhotoMetadata(existing) && hasPhotoMetadata(incoming)) {
    return true;
  }

  if (!isFreshRecord(existing) && isFreshRecord(incoming)) {
    return true;
  }

  if (!(existing.reviews?.length) && (incoming.reviews?.length ?? 0) > 0) {
    return true;
  }

  return false;
}

export function shouldSkipGooglePlacesCacheWrite(
  existing: CacheWriteRecord | null | undefined,
  incoming: CacheWriteRecord,
): boolean {
  if (!existing) return false;

  if (
    isFreshRecord(existing) &&
    hasUsablePlaceCoords(existing) &&
    hasPhotoMetadata(existing)
  ) {
    return true;
  }

  return !incomingImprovesGooglePlacesCache(existing, incoming);
}

function logCacheWrite(
  event:
    | 'cache_write_attempt'
    | 'cache_write_success'
    | 'cache_write_timeout'
    | 'cache_write_skipped_existing_fresh'
    | 'cache_write_skipped_recent_failure'
    | 'cache_write_queue_depth',
  details: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === 'test') return;
  console.info(`[google-places-cache] ${event}`, details);
}

function logQueueDepth(): void {
  logCacheWrite('cache_write_queue_depth', {
    activeWrites,
    pendingWrites: pendingWrites.length,
  });
}

function markWriteFailure(cacheKey: string, error: unknown): void {
  recentFailedWriteKeys.set(cacheKey, Date.now());

  if (loggedWriteFailures.has(cacheKey)) {
    return;
  }

  loggedWriteFailures.add(cacheKey);

  if (error instanceof TimeoutError) {
    logCacheWrite('cache_write_timeout', { cacheKey });
    return;
  }

  console.warn('[google-places-cache] cache_write_failed', {
    cacheKey,
    error: error instanceof Error ? error.message : String(error),
  });
}

function shouldSkipRecentFailure(cacheKey: string): boolean {
  const failedAt = recentFailedWriteKeys.get(cacheKey);
  if (!failedAt) return false;
  if (Date.now() - failedAt >= FAILED_WRITE_COOLDOWN_MS) {
    recentFailedWriteKeys.delete(cacheKey);
    return false;
  }
  return true;
}

function runQueuedWrite<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeWrites += 1;
      logQueueDepth();

      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeWrites -= 1;
          logQueueDepth();
          const next = pendingWrites.shift();
          if (next) next();
        });
    };

    if (activeWrites < MAX_CONCURRENT_CACHE_WRITES) {
      run();
      return;
    }

    pendingWrites.push(run);
    logQueueDepth();
  });
}

export async function enqueueGooglePlacesCacheWrite(
  args: EnqueueGooglePlacesCacheWriteArgs,
): Promise<void> {
  const { cacheKey } = args;

  if (shouldSkipRecentFailure(cacheKey)) {
    logCacheWrite('cache_write_skipped_recent_failure', { cacheKey });
    return;
  }

  let existing = args.existing ?? null;
  if (existing === null && args.loadExisting) {
    try {
      existing = await args.loadExisting();
    } catch {
      existing = null;
    }
  }

  if (shouldSkipGooglePlacesCacheWrite(existing, args.incoming)) {
    logCacheWrite('cache_write_skipped_existing_fresh', { cacheKey });
    return;
  }

  logCacheWrite('cache_write_attempt', {
    cacheKey,
    queueDepth: pendingWrites.length,
    activeWrites,
  });

  try {
    await runQueuedWrite(() =>
      withTimeout(
        args.write(),
        getGooglePlacesCacheWriteTimeoutMs(),
        'Google Places cache write',
      ),
    );
    recentFailedWriteKeys.delete(cacheKey);
    loggedWriteFailures.delete(cacheKey);
    logCacheWrite('cache_write_success', { cacheKey });
  } catch (error) {
    markWriteFailure(cacheKey, error);
  }
}

export function scheduleGooglePlacesCacheWrite(args: EnqueueGooglePlacesCacheWriteArgs): void {
  void enqueueGooglePlacesCacheWrite(args);
}

export function getGooglePlacesCacheWriteQueueStateForTests(): {
  activeWrites: number;
  pendingWrites: number;
} {
  return {
    activeWrites,
    pendingWrites: pendingWrites.length,
  };
}

export async function flushGooglePlacesCacheWriteQueueForTests(): Promise<void> {
  const startedAt = Date.now();

  while (activeWrites > 0 || pendingWrites.length > 0) {
    if (Date.now() - startedAt > 5_000) {
      throw new Error('Timed out waiting for Google Places cache write queue to drain');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export function resetGooglePlacesCacheWriteForTests(): void {
  activeWrites = 0;
  pendingWrites.length = 0;
  loggedWriteFailures.clear();
  recentFailedWriteKeys.clear();
}
