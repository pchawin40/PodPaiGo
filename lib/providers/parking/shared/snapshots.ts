import { getLatestParkingPriceSnapshots } from '../../../db/parkingCache';

type SnapshotArgs = {
  airportCode: string;
  checkInDate?: string;
  checkOutDate?: string;
};

type SnapshotResult = Awaited<ReturnType<typeof getLatestParkingPriceSnapshots>>;

const SNAPSHOT_CACHE_TTL_MS = Number(process.env.PARKING_SNAPSHOT_CACHE_TTL_MS || 60_000);

const snapshotInFlight = new Map<string, Promise<SnapshotResult>>();
const snapshotResultCache = new Map<string, { expiresAt: number; snapshots: SnapshotResult }>();

function snapshotCacheKey(args: SnapshotArgs): string {
  return JSON.stringify({
    airportCode: args.airportCode.toUpperCase(),
    checkInDate: args.checkInDate ?? null,
    checkOutDate: args.checkOutDate ?? null,
  });
}

export async function getParkingPriceSnapshotsCached(args: SnapshotArgs): Promise<SnapshotResult> {
  const key = snapshotCacheKey(args);
  const now = Date.now();
  const cached = snapshotResultCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.snapshots;
  }

  const inFlight = snapshotInFlight.get(key);
  if (inFlight) {
    return inFlight;
  }

  const promise = getLatestParkingPriceSnapshots({
    airportCode: args.airportCode.toUpperCase(),
    checkInDate: args.checkInDate,
    checkOutDate: args.checkOutDate,
  })
    .catch((error) => {
      console.warn('Latest parking price snapshots unavailable; continuing without snapshots', error);
      return [] as SnapshotResult;
    })
    .then((snapshots) => {
      snapshotResultCache.set(key, {
        expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS,
        snapshots,
      });
      return snapshots;
    })
    .finally(() => {
      snapshotInFlight.delete(key);
    });

  snapshotInFlight.set(key, promise);
  return promise;
}

export function resetParkingPriceSnapshotCacheForTests(): void {
  snapshotInFlight.clear();
  snapshotResultCache.clear();
}
