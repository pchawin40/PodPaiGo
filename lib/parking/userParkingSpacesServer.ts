import { getDb } from '../db/client';
import { LiveTrafficProvider } from '../providers';
import { debugLog } from '../utils/debug';
import type {
  UserParkingSpaceRecord,
  UserParkingStatus,
} from './userParkingSpacesTypes';

const SELECT_COLUMNS = `
  id,
  user_id,
  name,
  address,
  lat::float8 as lat,
  lng::float8 as lng,
  google_place_id,
  parking_type,
  price::float8 as price,
  is_free,
  time_limit_minutes,
  overnight_allowed,
  validation_required,
  business_name,
  lot_rules,
  notes,
  evidence_url,
  source,
  status,
  verified_by,
  verified_at,
  rejection_reason,
  created_at,
  updated_at
`;

let cachedTrafficProvider: LiveTrafficProvider | null = null;

function getTrafficProvider(): LiveTrafficProvider {
  if (!cachedTrafficProvider) {
    cachedTrafficProvider = new LiveTrafficProvider();
  }
  return cachedTrafficProvider;
}

/**
 * Geocode a submission address using the shared, budget-guarded geocoder
 * (kill switch + GEOCODING_DAILY_LIMIT + cache + in-flight dedupe). Returns null
 * if disabled, over budget, or not resolvable. Never throws.
 */
export async function geocodeUserParkingAddress(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  try {
    return await getTrafficProvider().geocodeAddress(trimmed);
  } catch {
    return null;
  }
}

export function metersBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const earthRadius = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export type VerifiedUserParkingResult = UserParkingSpaceRecord & {
  distanceMeters: number;
};

/**
 * Return verified user-submitted parking near a coordinate, ordered by distance.
 * Uses a bounding-box prefilter in SQL then precise haversine in JS. Never throws;
 * returns [] when the DB is unavailable.
 */
export async function getVerifiedUserParkingNear(args: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  limit?: number;
}): Promise<VerifiedUserParkingResult[]> {
  const { lat, lng } = args;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const radiusMeters = Math.max(100, Math.min(args.radiusMeters ?? 3200, 50000));
  const limit = Math.max(1, Math.min(args.limit ?? 8, 25));

  // ~111,320 m per degree latitude; longitude scaled by cos(lat).
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

  try {
    const result = await getDb().query(
      `select ${SELECT_COLUMNS}
       from public.user_parking_spaces
       where status = 'verified'
         and lat is not null
         and lng is not null
         and lat between $1 and $2
         and lng between $3 and $4
       limit 200`,
      [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta],
    );

    const rows = (result.rows as UserParkingSpaceRecord[])
      .map((row) => ({
        ...row,
        distanceMeters: metersBetween(
          { lat, lng },
          { lat: row.lat as number, lng: row.lng as number },
        ),
      }))
      .filter((row) => row.distanceMeters <= radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);

    debugLog('[community-free-parking]', {
      lat: Number(lat.toFixed(3)),
      lng: Number(lng.toFixed(3)),
      radiusMeters,
      matched: rows.length,
    });

    return rows;
  } catch (error) {
    debugLog('[community-free-parking] query failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
}

/** Admin: list submissions, optionally filtered by status. Uses service-role DB (bypasses RLS). */
export async function listUserParkingSubmissionsForAdmin(args?: {
  status?: UserParkingStatus | 'all';
  limit?: number;
}): Promise<UserParkingSpaceRecord[]> {
  const limit = Math.max(1, Math.min(args?.limit ?? 200, 500));
  const status = args?.status && args.status !== 'all' ? args.status : null;

  try {
    const result = status
      ? await getDb().query(
          `select ${SELECT_COLUMNS}
           from public.user_parking_spaces
           where status = $1
           order by created_at desc
           limit $2`,
          [status, limit],
        )
      : await getDb().query(
          `select ${SELECT_COLUMNS}
           from public.user_parking_spaces
           order by created_at desc
           limit $1`,
          [limit],
        );
    return result.rows as UserParkingSpaceRecord[];
  } catch (error) {
    debugLog('[admin-parking-submissions] list failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}

/** Admin: set the moderation status of a submission. Uses service-role DB (bypasses RLS). */
export async function updateUserParkingSubmissionStatus(args: {
  id: string;
  status: UserParkingStatus;
  adminUserId: string | null;
  rejectionReason?: string | null;
}): Promise<UserParkingSpaceRecord | null> {
  const verifiedAt = args.status === 'verified' ? new Date().toISOString() : null;
  const rejectionReason =
    args.status === 'rejected' || args.status === 'needs_more_info'
      ? args.rejectionReason?.trim()?.slice(0, 2000) || null
      : null;

  const result = await getDb().query(
    `update public.user_parking_spaces
        set status = $2,
            verified_by = case when $2 = 'verified' then $3 else verified_by end,
            verified_at = $4,
            rejection_reason = $5,
            updated_at = now()
      where id = $1
      returning ${SELECT_COLUMNS}`,
    [args.id, args.status, args.adminUserId, verifiedAt, rejectionReason],
  );

  return (result.rows[0] as UserParkingSpaceRecord) ?? null;
}
