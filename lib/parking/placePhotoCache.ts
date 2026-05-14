import { getDb } from '../db/client';
import { withTimeout } from '../utils/asyncTimeout';

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
      2500,
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

export async function savePlacePhotoCache(input: {
  placeId: string;
  parkingName?: string;
  airportCode?: string;
  photos: string[];
  attributions?: string[];
}) {
  try {
    await withTimeout(
      getDb().query(
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
          values ($1, $2, $3, $4::jsonb, $5::jsonb, now(), now() + interval '24 hours', now())
          on conflict (place_id)
          do update set
            parking_name = excluded.parking_name,
            airport_code = excluded.airport_code,
            photos = excluded.photos,
            attributions = excluded.attributions,
            fetched_at = now(),
            expires_at = now() + interval '24 hours',
            updated_at = now()
        `,
        [
          input.placeId,
          input.parkingName ?? null,
          input.airportCode ?? null,
          JSON.stringify(input.photos),
          JSON.stringify(input.attributions ?? []),
        ]
      ),
      2500,
      'Place photo cache save'
    );
  } catch {
    // Cache should never break the app.
  }
}