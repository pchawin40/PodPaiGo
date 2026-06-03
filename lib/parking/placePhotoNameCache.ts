export const PLACE_PHOTO_NAME_CACHE_TTL_DAYS = 365;
export const PLACE_PHOTO_SOURCE_GOOGLE = 'google_places';

// Google photo resource names may be cached briefly to avoid repeat GetPlace calls.
// Photo bytes and long-term image URLs must never be stored in Supabase.

export type PlacePhotoSnapshotFields = {
  photoName?: string | null;
  photoNames?: string[] | null;
  photoRefreshedAt?: string | Date | null;
};

export function parsePhotoNamesJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function photoNamesFromRow(row: {
  photo_name?: string | null;
  photo_names_json?: unknown;
}): string[] {
  const fromJson = parsePhotoNamesJson(row.photo_names_json);
  if (fromJson.length) return fromJson;

  const single = typeof row.photo_name === 'string' ? row.photo_name.trim() : '';
  return single ? [single] : [];
}

export function isPlacePhotoNameCacheFresh(
  photoRefreshedAt: string | Date | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!photoRefreshedAt) return false;

  const refreshedMs =
    photoRefreshedAt instanceof Date
      ? photoRefreshedAt.getTime()
      : Date.parse(String(photoRefreshedAt));

  if (!Number.isFinite(refreshedMs)) return false;

  const ttlMs = PLACE_PHOTO_NAME_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return nowMs - refreshedMs < ttlMs;
}

export function getFreshPhotoNamesFromRecord(
  record: PlacePhotoSnapshotFields | null | undefined,
): string[] {
  if (!record || !isPlacePhotoNameCacheFresh(record.photoRefreshedAt)) {
    return [];
  }

  if (record.photoNames?.length) {
    return record.photoNames.filter((name) => Boolean(name?.trim()));
  }

  const single = typeof record.photoName === 'string' ? record.photoName.trim() : '';
  return single ? [single] : [];
}

export function rowNeedsPhotoRefresh(row: {
  photo_name?: string | null;
  photo_names_json?: unknown;
  photo_refreshed_at?: string | Date | null;
}): boolean {
  const missingPhotos = photoNamesFromRow(row).length === 0;
  const stale = !isPlacePhotoNameCacheFresh(row.photo_refreshed_at);

  return missingPhotos || stale;
}

export const PLACE_PHOTO_REFRESH_CANDIDATE_WHERE = `
  google_place_id is not null
  and (
    photo_refreshed_at is null
    or photo_refreshed_at < now() - interval '${PLACE_PHOTO_NAME_CACHE_TTL_DAYS} days'
    or (
      coalesce(nullif(btrim(photo_name), ''), '') = ''
      and (
        photo_names_json is null
        or photo_names_json = '[]'::jsonb
      )
    )
  )
`;
