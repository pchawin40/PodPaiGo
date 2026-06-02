import { getDb } from '../db/client';
import { withTimeout } from '../utils/asyncTimeout';
import {
  getGooglePlacesCacheWriteTimeoutMs,
  scheduleGooglePlacesCacheWrite,
} from './googlePlacesCacheWrite';

export type CachedPlacePhotos = {
  placeId: string;
  parkingName?: string;
  airportCode?: string;
  photos: string[];
  attributions: string[];
  expiresAt: string;
};

type ParkingPlacePhotosRow = {
  place_id: string;
  parking_name: string | null;
  airport_code: string | null;
  photos: string[] | null;
  attributions: string[] | null;
  expires_at: string;
};

const PLACE_PHOTO_READ_TIMEOUT_MS = Number(process.env.GOOGLE_PLACE_DB_READ_TIMEOUT_MS || 2500);

function isFreshPhotoCache(expiresAt: string): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
}

function shouldSkipPlacePhotoCacheWrite(
  existing: CachedPlacePhotos | null,
  incomingPhotos: string[],
): boolean {
  if (!existing) return false;
  if (!isFreshPhotoCache(existing.expiresAt)) return false;
  if (existing.photos.length === 0) return false;
  return incomingPhotos.length <= existing.photos.length;
}

export async function readPlacePhotoCache(placeId: string): Promise<CachedPlacePhotos | null> {
  try {
    const result = await withTimeout(
      getDb().query<ParkingPlacePhotosRow>(
        `
          select place_id, parking_name, airport_code, photos, attributions, expires_at
          from parking_place_photos
          where place_id = $1
            and expires_at > now()
          limit 1
        `,
        [placeId]
      ),
      PLACE_PHOTO_READ_TIMEOUT_MS,
      'Place photo cache read'
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      placeId: row.place_id,
      parkingName: row.parking_name ?? undefined,
      airportCode: row.airport_code ?? undefined,
      photos: row.photos ?? [],
      attributions: row.attributions ?? [],
      expiresAt: row.expires_at,
    };
  } catch {
    return null;
  }
}

async function upsertPlacePhotoCache(input: {
  placeId: string;
  parkingName?: string;
  airportCode?: string;
  photos: string[];
  attributions?: string[];
}): Promise<void> {
  await getDb().query(
    `
      insert into parking_place_photos (
        place_id,
        parking_name,
        airport_code,
        photos,
        attributions,
        fetched_at,
        expires_at,
        updated_at
      )
      values ($1, $2, $3, $4::jsonb, $5::jsonb, now(), now() + interval '7 days', now())
      on conflict (place_id)
      do update set
        parking_name = excluded.parking_name,
        airport_code = excluded.airport_code,
        photos = excluded.photos,
        attributions = excluded.attributions,
        fetched_at = now(),
        expires_at = now() + interval '7 days',
        updated_at = now()
    `,
    [
      input.placeId,
      input.parkingName ?? null,
      input.airportCode ?? null,
      JSON.stringify(input.photos),
      JSON.stringify(input.attributions ?? []),
    ]
  );
}

export async function savePlacePhotoCache(input: {
  placeId: string;
  parkingName?: string;
  airportCode?: string;
  photos: string[];
  attributions?: string[];
}) {
  const cacheKey = `photo:${input.placeId}`;
  const existing = await readPlacePhotoCache(input.placeId).catch(() => null);

  if (shouldSkipPlacePhotoCacheWrite(existing, input.photos)) {
    if (process.env.NODE_ENV !== 'test') {
      console.info('[google-places-cache] cache_write_skipped_existing_fresh', {
        cacheKey,
        kind: 'place_photo',
      });
    }
    return;
  }

  scheduleGooglePlacesCacheWrite({
    cacheKey,
    incoming: {
      cacheKey,
      photoNames: input.photos,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    existing: existing
      ? {
          cacheKey,
          photoNames: existing.photos,
          expiresAt: existing.expiresAt,
        }
      : null,
    write: () => upsertPlacePhotoCache(input),
  });
}

export { getGooglePlacesCacheWriteTimeoutMs };
