import type { TrafficEstimate } from '../types';
import { db } from './client';
import { withTimeout } from '../utils/asyncTimeout';
import { bucketDepartureTime } from '../apiUsage/departureBucket';
import { buildRouteSnapshotHashes } from '../apiUsage/routeCacheKey';

const ROUTE_SNAPSHOT_DB_TIMEOUT_MS = Number(process.env.ROUTE_SNAPSHOT_DB_TIMEOUT_MS || 2500);

function routeSnapshotDbDisabled(): boolean {
  return process.env.DISABLE_PARKING_DB_CACHE === 'true';
}

export type RouteQuoteSnapshot = {
  travelMinutes: number;
  distanceMiles?: number;
  rawResponse?: unknown;
  expiresAt: string;
  createdAt: string;
  stale: boolean;
};

function snapshotToEstimate(snapshot: RouteQuoteSnapshot, routeLabel: string): TrafficEstimate {
  return {
    route: routeLabel,
    duration: snapshot.travelMinutes,
    distanceMeters:
      typeof snapshot.distanceMiles === 'number'
        ? Math.round(snapshot.distanceMiles * 1609.34)
        : undefined,
    congestion: 'medium',
    trustStatus: snapshot.stale ? 'estimated' : 'live',
    sourceName: snapshot.stale ? 'Cached route snapshot (stale)' : 'Cached route snapshot',
    lastUpdated: snapshot.createdAt,
    assumptions: snapshot.stale
      ? ['Using stale cached route timing to avoid live Google Routes API call']
      : ['Using fresh cached route timing from Supabase snapshot'],
  };
}

export async function getCachedRouteQuoteSnapshot(args: {
  origin: string;
  destination: string;
  dateTime: string;
  airportCode?: string | null;
  lotId?: string | null;
  allowStale?: boolean;
}): Promise<RouteQuoteSnapshot | null> {
  if (routeSnapshotDbDisabled()) return null;

  const { originHash, destinationHash } = buildRouteSnapshotHashes(args);
  const departureBucket = bucketDepartureTime(args.dateTime);

  try {
    const result = await withTimeout(
      db.query(
        `
        select
          travel_minutes as "travelMinutes",
          distance_miles::float8 as "distanceMiles",
          raw_response as "rawResponse",
          created_at::text as "createdAt",
          expires_at::text as "expiresAt",
          (expires_at <= now()) as stale
        from route_quote_snapshots
        where origin_hash = $1
          and destination_hash = $2
          and departure_bucket = $3::timestamptz
          and coalesce(airport_code, '') = coalesce($4, '')
          and coalesce(lot_id, '') = coalesce($5, '')
        order by created_at desc
        limit 1
        `,
        [
          originHash,
          destinationHash,
          departureBucket,
          args.airportCode?.trim().toUpperCase() || null,
          args.lotId?.trim() || null,
        ],
      ),
      ROUTE_SNAPSHOT_DB_TIMEOUT_MS,
      'Route quote snapshot read',
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0] as RouteQuoteSnapshot;
    if (!row.stale) return row;
    if (args.allowStale !== false) return row;
    return null;
  } catch {
    return null;
  }
}

export async function saveRouteQuoteSnapshot(args: {
  provider: string;
  origin: string;
  destination: string;
  dateTime: string;
  airportCode?: string | null;
  lotId?: string | null;
  travelMinutes: number;
  distanceMiles?: number | null;
  rawResponse?: unknown;
  ttlMinutes?: number;
}): Promise<void> {
  if (routeSnapshotDbDisabled()) return;

  const { originHash, destinationHash } = buildRouteSnapshotHashes(args);
  const departureBucket = bucketDepartureTime(args.dateTime);
  const ttlMinutes = args.ttlMinutes ?? Number(process.env.LIVE_ROUTE_CACHE_TTL_MINUTES || 30);

  try {
    await withTimeout(
      db.query(
        `
        insert into route_quote_snapshots (
          provider,
          origin_hash,
          destination_hash,
          airport_code,
          lot_id,
          departure_bucket,
          travel_minutes,
          distance_miles,
          raw_response,
          expires_at
        )
        values ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9::jsonb, now() + ($10 || ' minutes')::interval)
        `,
        [
          args.provider,
          originHash,
          destinationHash,
          args.airportCode?.trim().toUpperCase() || null,
          args.lotId?.trim() || null,
          departureBucket,
          args.travelMinutes,
          args.distanceMiles ?? null,
          JSON.stringify(args.rawResponse ?? {}),
          String(ttlMinutes),
        ],
      ),
      ROUTE_SNAPSHOT_DB_TIMEOUT_MS,
      'Route quote snapshot write',
    );
  } catch {
    // Non-fatal.
  }
}

export async function routeSnapshotToTrafficEstimate(args: {
  origin: string;
  destination: string;
  dateTime: string;
  airportCode?: string | null;
  lotId?: string | null;
  routeLabel: string;
}): Promise<TrafficEstimate | null> {
  const snapshot = await getCachedRouteQuoteSnapshot({
    ...args,
    allowStale: true,
  });

  if (!snapshot) return null;
  return snapshotToEstimate(snapshot, args.routeLabel);
}

export async function getLatestRouteQuoteSnapshots(limit = 10): Promise<
  Array<{
    provider: string;
    originHash: string;
    destinationHash: string;
    airportCode: string | null;
    lotId: string | null;
    travelMinutes: number;
    createdAt: string;
    expiresAt: string;
  }>
> {
  if (routeSnapshotDbDisabled()) return [];

  try {
    const result = await withTimeout(
      db.query(
        `
        select
          provider,
          origin_hash as "originHash",
          destination_hash as "destinationHash",
          airport_code as "airportCode",
          lot_id as "lotId",
          travel_minutes as "travelMinutes",
          created_at::text as "createdAt",
          expires_at::text as "expiresAt"
        from route_quote_snapshots
        order by created_at desc
        limit $1
        `,
        [limit],
      ),
      ROUTE_SNAPSHOT_DB_TIMEOUT_MS,
      'Latest route snapshots read',
    );

    return result.rows as Array<{
      provider: string;
      originHash: string;
      destinationHash: string;
      airportCode: string | null;
      lotId: string | null;
      travelMinutes: number;
      createdAt: string;
      expiresAt: string;
    }>;
  } catch {
    return [];
  }
}

export { snapshotToEstimate };
