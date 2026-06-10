import { TimeoutError, withTimeout } from '../utils/asyncTimeout';

const MAX_CONCURRENT_CACHE_WRITES = 2;
const FAILED_WRITE_COOLDOWN_MS = 60_000;
const DEFAULT_MAX_PENDING_CACHE_WRITES = 50;
const QUEUE_PRESSURE_LOG_INTERVAL_MS = 10_000;

/** Raised when a queued write is dropped because the bounded queue is full. */
class DroppedCacheWriteError extends Error {
  constructor(cacheKey: string) {
    super(`Google Places cache write dropped (queue full): ${cacheKey}`);
    this.name = 'DroppedCacheWriteError';
  }
}

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

type PendingCacheWrite = {
  cacheKey: string;
  priority: number;
  begin: () => void;
  drop: () => void;
};

let activeWrites = 0;
const pendingWrites: PendingCacheWrite[] = [];
/** Stable identity (cacheKey) of every write that is reserved, queued, or running. */
const inFlightOrQueuedKeys = new Set<string>();
const recentFailedWriteKeys = new Map<string, number>();

let droppedWriteCount = 0;
let coalescedWriteCount = 0;
let failedWriteCount = 0;
let timedOutWriteCount = 0;
let lastQueuePressureLogAt = 0;

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

export function getGooglePlacesCacheWriteMaxPending(): number {
  const configured = Number(process.env.GOOGLE_PLACES_CACHE_WRITE_MAX_PENDING);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  return DEFAULT_MAX_PENDING_CACHE_WRITES;
}

/**
 * Higher priority writes are kept when the bounded queue is full. Writes that
 * add usable coordinates, photos, reviews, or fresh data are most valuable.
 */
export function googlePlacesCacheWritePriority(record: CacheWriteRecord): number {
  let priority = 0;
  if (hasUsablePlaceCoords(record)) priority += 3;
  if (hasPhotoMetadata(record)) priority += 2;
  if ((record.reviews?.length ?? 0) > 0) priority += 2;
  if (isFreshRecord(record)) priority += 1;
  return priority;
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

/**
 * Summarized, throttled queue-pressure log. Replaces the previous per-write
 * `cache_write_queue_depth` / per-key `cache_write_failed` lines so one results
 * page no longer prints a scary log for every failed/queued write.
 */
function logQueuePressure(force = false): void {
  if (process.env.NODE_ENV === 'test') return;
  const now = Date.now();
  if (!force && now - lastQueuePressureLogAt < QUEUE_PRESSURE_LOG_INTERVAL_MS) return;
  lastQueuePressureLogAt = now;
  console.info('[google-places-cache] cache_write_queue_pressure', {
    activeWrites,
    pendingWrites: pendingWrites.length,
    droppedWrites: droppedWriteCount,
    coalescedWrites: coalescedWriteCount,
    failedWrites: failedWriteCount,
    timedOutWrites: timedOutWriteCount,
  });
}

function markWriteFailure(cacheKey: string, error: unknown): void {
  recentFailedWriteKeys.set(cacheKey, Date.now());

  if (error instanceof TimeoutError) {
    timedOutWriteCount += 1;
  } else {
    failedWriteCount += 1;
  }

  // Best-effort, summarized only. Individual failures are not logged per key.
  logQueuePressure();
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

function dropLowestPriorityPending(): PendingCacheWrite | null {
  if (pendingWrites.length === 0) return null;
  let lowestIndex = 0;
  for (let i = 1; i < pendingWrites.length; i += 1) {
    if (pendingWrites[i].priority < pendingWrites[lowestIndex].priority) {
      lowestIndex = i;
    }
  }
  return pendingWrites.splice(lowestIndex, 1)[0] ?? null;
}

function runQueuedWrite(opts: {
  cacheKey: string;
  priority: number;
  task: () => Promise<void>;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const begin = () => {
      activeWrites += 1;
      opts
        .task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeWrites -= 1;
          const next = pendingWrites.shift();
          if (next) next.begin();
        });
    };

    if (activeWrites < MAX_CONCURRENT_CACHE_WRITES) {
      begin();
      return;
    }

    const entry: PendingCacheWrite = {
      cacheKey: opts.cacheKey,
      priority: opts.priority,
      begin,
      drop: () => reject(new DroppedCacheWriteError(opts.cacheKey)),
    };

    // Cap the queue so it cannot grow unbounded. When full, drop the
    // lowest-priority write (the incoming one if it is the least valuable).
    if (pendingWrites.length >= getGooglePlacesCacheWriteMaxPending()) {
      const lowest = dropLowestPriorityPending();
      if (lowest && lowest.priority < entry.priority) {
        droppedWriteCount += 1;
        lowest.drop();
        pendingWrites.push(entry);
      } else {
        if (lowest) pendingWrites.push(lowest);
        droppedWriteCount += 1;
        entry.drop();
      }
      logQueuePressure(true);
      return;
    }

    pendingWrites.push(entry);
    logQueuePressure();
  });
}

export async function enqueueGooglePlacesCacheWrite(
  args: EnqueueGooglePlacesCacheWriteArgs,
): Promise<void> {
  const { cacheKey } = args;

  if (shouldSkipRecentFailure(cacheKey)) {
    return;
  }

  // Coalesce duplicate writes for the same lot/place: multiple requests for the
  // same identity during one search share a single pending/in-flight write.
  if (inFlightOrQueuedKeys.has(cacheKey)) {
    coalescedWriteCount += 1;
    logQueuePressure();
    return;
  }

  inFlightOrQueuedKeys.add(cacheKey);

  try {
    let existing = args.existing ?? null;
    if (existing === null && args.loadExisting) {
      try {
        existing = await args.loadExisting();
      } catch {
        existing = null;
      }
    }

    if (shouldSkipGooglePlacesCacheWrite(existing, args.incoming)) {
      return;
    }

    try {
      await runQueuedWrite({
        cacheKey,
        priority: googlePlacesCacheWritePriority(args.incoming),
        task: () =>
          withTimeout(
            args.write(),
            getGooglePlacesCacheWriteTimeoutMs(),
            'Google Places cache write',
          ),
      });
      recentFailedWriteKeys.delete(cacheKey);
    } catch (error) {
      if (!(error instanceof DroppedCacheWriteError)) {
        markWriteFailure(cacheKey, error);
      }
    }
  } finally {
    inFlightOrQueuedKeys.delete(cacheKey);
  }
}

export function scheduleGooglePlacesCacheWrite(args: EnqueueGooglePlacesCacheWriteArgs): void {
  void enqueueGooglePlacesCacheWrite(args);
}

export function getGooglePlacesCacheWriteQueueStateForTests(): {
  activeWrites: number;
  pendingWrites: number;
  droppedWrites: number;
  coalescedWrites: number;
  failedWrites: number;
  timedOutWrites: number;
} {
  return {
    activeWrites,
    pendingWrites: pendingWrites.length,
    droppedWrites: droppedWriteCount,
    coalescedWrites: coalescedWriteCount,
    failedWrites: failedWriteCount,
    timedOutWrites: timedOutWriteCount,
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
  inFlightOrQueuedKeys.clear();
  recentFailedWriteKeys.clear();
  droppedWriteCount = 0;
  coalescedWriteCount = 0;
  failedWriteCount = 0;
  timedOutWriteCount = 0;
  lastQueuePressureLogAt = 0;
}
