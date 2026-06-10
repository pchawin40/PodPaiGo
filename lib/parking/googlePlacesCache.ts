import { getGoogleMapsServerApiKey } from '../env/googleMapsServerKey';
import { db, parkingDbCacheDisabledByConfig } from '../db/client';
import { getAirportById } from '../airports/catalog';
import { ParkingOption, ParkingGooglePlaceSnapshot, ParkingGoogleReview } from '../types';
import type { PoolClient } from 'pg';
import { withTimeout } from '../utils/asyncTimeout';
import { scheduleGooglePlacesCacheWrite, resetGooglePlacesCacheWriteForTests } from './googlePlacesCacheWrite';
import {
  canMakeLiveGetPlaceCall,
  canMakeLiveGoogleReviewCall,
  canMakeLiveSearchTextCall,
  isGoogleParkingDiscoveryLiveBlocked,
  isGooglePlacePhotosLiveBlocked,
  isGooglePlaceReviewsLiveBlocked,
  isGooglePlacesLiveBlocked,
} from './googlePlacesGuard';
import { getMaxGoogleSearchTextPerRequest } from '../apiUsage/placesRequestLimits';
import {
  buildParkingGoogleCacheKey,
  cleanGoogleParkingSearchName,
  normalizeParkingLotName,
  shouldAttemptGooglePlaceMatch,
} from './googlePlaceMatchUtils';
import {
  getFreshPhotoNamesFromRecord,
  parsePhotoNamesJson,
  PLACE_PHOTO_SOURCE_GOOGLE,
} from './placePhotoNameCache';
import { logParkingPhotoReviewTrace } from './photoReviewDebug';
import {
  searchResultHasSufficientMetadata,
  searchResultToDetails,
  shouldSkipGetPlaceForSearchResult,
} from './googlePlacesMetadataPolicy';
import {
  getPlaceMetadataRequestCacheHit,
  resetPlaceMetadataRequestCacheForTests,
  setPlaceMetadataRequestCacheHit,
} from './placeMetadataRequestCache';

const GOOGLE_PLACE_DB_READ_TIMEOUT_MS = Number(process.env.GOOGLE_PLACE_DB_READ_TIMEOUT_MS || 2500);
const GOOGLE_PLACE_PHOTO_NAME_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const photoNameCache = new Map<string, { ts: number; photoName: string | null }>();
const photoNameInFlight = new Map<string, Promise<string | null>>();

function googlePlaceDbCacheDisabled(): boolean {
  return parkingDbCacheDisabledByConfig();
}

type GoogleLegacyReview = {
  author_name?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
  profile_photo_url?: string;
  time?: number;
};

type GoogleNewPhoto = {
  name?: string;
  widthPx?: number;
  heightPx?: number;
};

type GoogleLegacyPlaceSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  types?: string[];
  photoName?: string;
  photoNames?: string[];
  lat?: number;
  lng?: number;
  googleMapsUri?: string;
};

type GoogleLegacyPlaceDetailsResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  url?: string;
  reviews?: GoogleLegacyReview[];
  photoName?: string;
  photoNames?: string[];
  lat?: number;
  lng?: number;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

type GoogleNewReview = {
  name?: string;
  authorAttribution?: {
    displayName?: string;
    photoUri?: string;
  };
  rating?: number;
  relativePublishTimeDescription?: string;
  text?: {
    text?: string;
  };
  originalText?: {
    text?: string;
  };
  publishTime?: string;
};

type GoogleNewPlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  types?: string[];
  reviews?: GoogleNewReview[];
  photos?: GoogleNewPhoto[];
};

export type ParkingGooglePlaceCacheRecord = ParkingGooglePlaceSnapshot & {
  cacheKey: string;
  photoName?: string;
  photoNames?: string[];
  matchConfidence?: 'strong' | 'weak' | 'direct';
  source: 'supabase-cache' | 'google-places' | 'stale-fallback' | 'unavailable';
};

function logGooglePlaceCacheRecord(
  stage: string,
  record: ParkingGooglePlaceCacheRecord | null,
  extra: Record<string, unknown> = {},
): void {
  const option = record
    ? {
        id: record.parkingLotId != null ? String(record.parkingLotId) : record.cacheKey,
        name: record.lotName,
        displayName: record.googlePlaceName || record.lotName,
        parkingLotId: record.parkingLotId,
        cacheKey: record.cacheKey,
        googlePlaceId: record.googlePlaceId,
        googlePlaceName: record.googlePlaceName,
        googlePlaceAddress: record.googleFormattedAddress,
        googleMapsUri: record.googleMapsUri,
        googlePhotoName: record.photoName,
        googlePhotoNames: record.photoNames,
        googleReviews: record.reviews,
        reviewScore: record.rating,
        reviewCount: record.reviewCount,
        sourceName: record.source,
      }
    : {
        name: typeof extra.lotName === 'string' ? extra.lotName : undefined,
        displayName: typeof extra.lotName === 'string' ? extra.lotName : undefined,
        parkingLotId: extra.parkingLotId,
        cacheKey: extra.cacheKey,
        googlePlaceId: extra.googlePlaceId,
        sourceName: extra.sourceName,
      };

  logParkingPhotoReviewTrace(stage, option as Partial<ParkingOption>, extra);
}

function logPlaceMetadataCache(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') return;
  console.info(event, payload);
}

const CACHE_READ_FAILURE_LOG_INTERVAL_MS = 10_000;
const cacheReadFailureCounts = new Map<string, number>();
let lastCacheReadFailureLogAt = 0;

/**
 * Summarized, throttled cache-read-failure logging. A single results page with
 * DB read timeouts should not print one warning per lot; instead we aggregate
 * counts per read scope and emit at most one summary per interval.
 */
function logCacheReadFailure(scope: string): void {
  cacheReadFailureCounts.set(scope, (cacheReadFailureCounts.get(scope) ?? 0) + 1);
  if (process.env.NODE_ENV === 'test') return;
  const now = Date.now();
  if (now - lastCacheReadFailureLogAt < CACHE_READ_FAILURE_LOG_INTERVAL_MS) return;
  lastCacheReadFailureLogAt = now;
  console.warn(
    '[google-places-cache] cache_read_failures',
    Object.fromEntries(cacheReadFailureCounts),
  );
  cacheReadFailureCounts.clear();
}

/**
 * Coalesces concurrent place-resolution lookups for the same lot identity during
 * one request/search so a cache read timeout cannot trigger repeated live calls
 * for the same place while a lookup is already in flight.
 */
const resolvePlaceInFlight = new Map<string, Promise<ParkingGooglePlaceCacheRecord | null>>();

/**
 * Short-lived, process-level negative cache for stable lot keys that returned no
 * Google match after a live search. Prevents repeated live SearchText calls for
 * the same no-match lot within one result-generation run. It is intentionally
 * short-lived (TTL) so it never permanently blocks a future successful match.
 */
const NEGATIVE_PLACE_MATCH_DEFAULT_TTL_MS = 60_000;
const negativePlaceMatchCache = new Map<string, number>();
let dedupedNegativeSearchSkips = 0;
let inFlightPlaceLookupShares = 0;
let lastPlaceSearchDedupeLogAt = 0;
const PLACE_SEARCH_DEDUPE_LOG_INTERVAL_MS = 10_000;

function getNegativePlaceMatchTtlMs(): number {
  const configured = Number(process.env.GOOGLE_PLACES_NEGATIVE_MATCH_TTL_MS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return NEGATIVE_PLACE_MATCH_DEFAULT_TTL_MS;
}

function hasFreshNegativePlaceMatch(cacheKey: string): boolean {
  const expiresAt = negativePlaceMatchCache.get(cacheKey);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    negativePlaceMatchCache.delete(cacheKey);
    return false;
  }
  return true;
}

function recordNegativePlaceMatch(cacheKey: string): void {
  negativePlaceMatchCache.set(cacheKey, Date.now() + getNegativePlaceMatchTtlMs());
}

function clearNegativePlaceMatch(cacheKey: string): void {
  negativePlaceMatchCache.delete(cacheKey);
}

function logPlaceSearchDedupeSummary(force = false): void {
  if (process.env.NODE_ENV === 'test') return;
  const now = Date.now();
  if (!force && now - lastPlaceSearchDedupeLogAt < PLACE_SEARCH_DEDUPE_LOG_INTERVAL_MS) return;
  lastPlaceSearchDedupeLogAt = now;
  console.info('[google-places-cache] place_search_dedupe_summary', {
    negativeCacheSkips: dedupedNegativeSearchSkips,
    inFlightShares: inFlightPlaceLookupShares,
    negativeCacheEntries: negativePlaceMatchCache.size,
  });
}

export function getGooglePlacesSearchDedupeStatsForTests(): {
  negativeCacheSkips: number;
  inFlightShares: number;
  negativeCacheEntries: number;
} {
  return {
    negativeCacheSkips: dedupedNegativeSearchSkips,
    inFlightShares: inFlightPlaceLookupShares,
    negativeCacheEntries: negativePlaceMatchCache.size,
  };
}

const SNAPSHOT_SELECT_COLUMNS = `
  cache_key,
  parking_lot_id,
  airport_code,
  lot_name,
  normalized_lot_name,
  lot_address,
  google_place_id,
  google_place_name,
  google_formatted_address,
  google_maps_uri,
  rating,
  review_count,
  reviews_json,
  match_confidence,
  lat,
  lng,
  photo_name,
  photo_names_json,
  photo_refreshed_at,
  photo_source,
  last_fetched_at,
  updated_at,
  expires_at
`;

const detailsInFlight = new Map<string, Promise<GoogleLegacyPlaceDetailsResult | null>>();
const searchQueryInFlight = new Map<string, Promise<GoogleLegacyPlaceSearchResult | null>>();
const searchQueryResultCache = new Map<
  string,
  { ts: number; result: GoogleLegacyPlaceSearchResult | null }
>();
const SEARCH_QUERY_CACHE_TTL_MS =
  Number(process.env.PLACES_SEARCH_QUERY_CACHE_TTL_HOURS || 24) * 60 * 60 * 1000;

function googlePlacesLiveDisabled(): boolean {
  return isGooglePlacesLiveBlocked();
}

function hasUsablePlaceCoords(
  record: Pick<ParkingGooglePlaceCacheRecord, 'googlePlaceId' | 'lat' | 'lng'>,
): boolean {
  return (
    Boolean(record.googlePlaceId) &&
    typeof record.lat === 'number' &&
    typeof record.lng === 'number'
  );
}

function cleanText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddress(value?: string | null): string {
  return cleanText(value);
}

function simplifyParkingProductName(name: string): string {
  return String(name || '')
    .replace(/\s+-\s+self\s+(?:un)?covered.*$/i, '')
    .replace(/\s+-\s*covered.*$/i, '')
    .replace(/\s+-\s*uncovered.*$/i, '')
    .replace(/\s+lot$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildAirportParkingContext(
  airportCode?: string | null,
  airportContext?: string | null
): string | null {
  const code = airportCode?.trim().toUpperCase();

  if (code === 'SEA') return 'SeaTac WA airport parking';
  if (code) return `${code} airport parking`;

  return airportContext?.trim() || null;
}

function buildParkingSearchQuery(args: {
  lotName: string;
  lotAddress?: string | null;
  airportCode?: string | null;
  airportContext?: string | null;
}): string {
  const name = cleanGoogleParkingSearchName(args.lotName) || args.lotName;
  const airport = args.airportCode ? getAirportById(args.airportCode.toUpperCase()) : null;
  const airportParkingContext = buildAirportParkingContext(
    args.airportCode,
    args.airportContext,
  );
  const context = [
    args.lotAddress,
    airportParkingContext,
    args.airportContext,
    airport?.label,
    airport?.destinationName,
    airport?.routingAddress,
    'parking',
  ]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .join(' ');

  return [name || args.lotName, context].filter(Boolean).join(' ').trim();
}

function buildParkingSearchQueries(args: {
  lotName: string;
  lotAddress?: string | null;
  airportCode?: string | null;
  airportContext?: string | null;
}): string[] {
  const airport = args.airportCode ? getAirportById(args.airportCode.toUpperCase()) : null;
  const simplifiedName = simplifyParkingProductName(args.lotName);
  const airportParkingContext =
    buildAirportParkingContext(args.airportCode, args.airportContext) ||
    airport?.label ||
    airport?.destinationName ||
    null;
  const context = args.airportContext || airport?.label || airport?.destinationName || args.airportCode || null;
  const airportCode = args.airportCode?.trim().toUpperCase() || null;
  const queries = [
    [args.lotName, args.lotAddress, airportCode].filter(Boolean).join(' '),
    [args.lotName, args.lotAddress, airportParkingContext].filter(Boolean).join(' '),
    [simplifiedName, args.lotAddress, airportParkingContext].filter(Boolean).join(' '),
    [args.lotName, args.lotAddress, context, 'parking'].filter(Boolean).join(' '),
    [simplifiedName, context, 'parking'].filter(Boolean).join(' '),
    [args.lotName, context, 'parking'].filter(Boolean).join(' '),
    buildParkingSearchQuery(args),
  ];

  if (cleanText(args.lotName).includes('jiffy')) {
    queries.push('Jiffy Airport Parking SeaTac 18836 International Blvd');
  }

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}

function getServerApiKey(): string | null {
  return getGoogleMapsServerApiKey() ?? null;
}

async function logGooglePlacesError(scope: string, res: Response | null): Promise<void> {
  if (process.env.NODE_ENV === 'production' || !res || res.ok) return;

  let body = '';
  try {
    body = await res.clone().text();
  } catch {
    body = '';
  }

}

function toReview(review: GoogleLegacyReview, index: number, placeId: string): ParkingGoogleReview {
  return {
    id: `${placeId}-${review.time ?? index}`,
    authorName: review.author_name || undefined,
    displayName: review.author_name || undefined,
    rating: typeof review.rating === 'number' ? review.rating : undefined,
    relativeTimeDescription: review.relative_time_description || undefined,
    publishedAt: review.time ? new Date(review.time * 1000).toISOString() : undefined,
    text: review.text || undefined,
    profilePhotoUrl: review.profile_photo_url || undefined,
    source: 'google-places',
  };
}

function toReviewFromNew(review: GoogleNewReview, index: number, placeId: string): ParkingGoogleReview {
  return {
    id: review.name || `${placeId}-${review.publishTime ?? index}`,
    authorName: review.authorAttribution?.displayName || undefined,
    displayName: review.authorAttribution?.displayName || undefined,
    rating: typeof review.rating === 'number' ? review.rating : undefined,
    relativeTimeDescription: review.relativePublishTimeDescription || undefined,
    publishedAt: review.publishTime || undefined,
    text: review.text?.text || review.originalText?.text || undefined,
    profilePhotoUrl: review.authorAttribution?.photoUri || undefined,
    source: 'google-places',
  };
}

function firstGooglePhotoName(photos: GoogleNewPhoto[] | null | undefined): string | undefined {
  return photos?.find((photo) => typeof photo.name === 'string' && photo.name.trim())?.name;
}

function googlePhotoNames(
  photos: GoogleNewPhoto[] | null | undefined,
  limit = 4
): string[] {
  return Array.from(
    new Set(
      (photos ?? [])
        .map((photo) => photo.name)
        .filter((name): name is string => typeof name === 'string' && Boolean(name.trim()))
    )
  ).slice(0, limit);
}

export function googlePlacePhotoImageUrl(
  photoName: string | null | undefined,
  maxWidthPx = 900
): string | null {
  // Short-term live proxy URL only. Never persist in Supabase Storage or parking_lot_photos.
  if (isGooglePlacePhotosLiveBlocked()) return null;

  const name = typeof photoName === 'string' ? photoName.trim() : '';
  if (!name) return null;

  const width = Number.isFinite(maxWidthPx) && maxWidthPx > 0
    ? Math.round(maxWidthPx)
    : 900;

  return `/api/google-place-photo?name=${encodeURIComponent(name)}&maxWidthPx=${width}`;
}

function newPlaceToLegacy(place: GoogleNewPlace | null | undefined): GoogleLegacyPlaceDetailsResult | null {
  if (!place?.id) return null;

  return {
    place_id: place.id,
    name: place.displayName?.text,
    formatted_address: place.formattedAddress,
    rating: place.rating,
    user_ratings_total: place.userRatingCount,
    url: place.googleMapsUri,
    photoName: firstGooglePhotoName(place.photos),
    photoNames: googlePhotoNames(place.photos, 4),
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    reviews: (place.reviews || []).map((review, index) => ({
      author_name: review.authorAttribution?.displayName,
      rating: review.rating,
      relative_time_description: review.relativePublishTimeDescription,
      text: review.text?.text || review.originalText?.text,
      profile_photo_url: review.authorAttribution?.photoUri,
      time: review.publishTime ? Math.floor(new Date(review.publishTime).getTime() / 1000) : index,
    })),
  };
}

function numericParkingLotId(value: string | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function mapRowToRecord(row: Record<string, unknown>): ParkingGooglePlaceCacheRecord {
  const reviews = Array.isArray(row.reviews_json)
    ? (row.reviews_json as ParkingGoogleReview[])
    : [];

  return {
    cacheKey: String(row.cache_key || ''),
    parkingLotId: row.parking_lot_id != null ? Number(row.parking_lot_id) : undefined,
    airportCode: String(row.airport_code || ''),
    lotName: String(row.lot_name || ''),
    normalizedLotName: String(row.normalized_lot_name || ''),
    lotAddress: (row.lot_address as string | null) || undefined,
    googlePlaceId: (row.google_place_id as string | null) || undefined,
    googlePlaceName: (row.google_place_name as string | null) || undefined,
    googleFormattedAddress: (row.google_formatted_address as string | null) || undefined,
    googleMapsUri: (row.google_maps_uri as string | null) || undefined,
    lat: row.lat != null ? Number(row.lat) : undefined,
    lng: row.lng != null ? Number(row.lng) : undefined,
    photoName: (row.photo_name as string | null) || undefined,
    photoNames: parsePhotoNamesJson(row.photo_names_json),
    photoRefreshedAt: (row.photo_refreshed_at as string | null) || undefined,
    photoSource: (row.photo_source as string | null) || undefined,
    rating: row.rating != null ? Number(row.rating) : undefined,
    reviewCount: row.review_count != null ? Number(row.review_count) : undefined,
    reviews,
    fetchedAt: String(row.last_fetched_at || row.fetched_at || ''),
    updatedAt: String(row.updated_at || row.last_fetched_at || row.fetched_at || ''),
    expiresAt: String(row.expires_at || ''),
    matchConfidence: (row.match_confidence as ParkingGooglePlaceCacheRecord['matchConfidence']) || undefined,
    source: 'supabase-cache',
  };
}

async function getCachedRecordByKey(cacheKey: string): Promise<ParkingGooglePlaceCacheRecord | null> {
  if (googlePlaceDbCacheDisabled()) return null;

  try {
    const result = await withTimeout(
      db.query(
        `
      select
        ${SNAPSHOT_SELECT_COLUMNS}
      from parking_lot_google_place_snapshots
      where cache_key = $1
      order by updated_at desc
      limit 1
    `,
        [cacheKey],
      ),
      GOOGLE_PLACE_DB_READ_TIMEOUT_MS,
      'Google Places stale cache read',
    );

    if (result.rows.length === 0) return null;

    return mapRowToRecord(result.rows[0]);
  } catch {
    logCacheReadFailure('stale_cache_read');
    return null;
  }
}

async function getFreshCachedRecordByKey(cacheKey: string): Promise<ParkingGooglePlaceCacheRecord | null> {
  if (googlePlaceDbCacheDisabled()) return null;

  try {
    const result = await withTimeout(
      db.query(
        `
      select
        ${SNAPSHOT_SELECT_COLUMNS}
      from parking_lot_google_place_snapshots
      where cache_key = $1
        and expires_at > now()
      order by updated_at desc
      limit 1
    `,
        [cacheKey],
      ),
      GOOGLE_PLACE_DB_READ_TIMEOUT_MS,
      'Google Places fresh cache read',
    );

    if (result.rows.length === 0) return null;

    return mapRowToRecord(result.rows[0]);
  } catch {
    logCacheReadFailure('fresh_cache_read');
    return null;
  }
}

async function getCachedRecordByPlaceId(
  googlePlaceId: string,
): Promise<ParkingGooglePlaceCacheRecord | null> {
  if (googlePlaceDbCacheDisabled()) return null;

  const normalizedPlaceId = googlePlaceId.trim();
  if (!normalizedPlaceId) return null;

  try {
    const result = await withTimeout(
      db.query(
        `
      select
        ${SNAPSHOT_SELECT_COLUMNS}
      from parking_lot_google_place_snapshots
      where google_place_id = $1
      order by expires_at desc, updated_at desc
      limit 1
    `,
        [normalizedPlaceId],
      ),
      GOOGLE_PLACE_DB_READ_TIMEOUT_MS,
      'Google Places place-id cache read',
    );

    if (result.rows.length === 0) return null;

    return mapRowToRecord(result.rows[0]);
  } catch {
    logCacheReadFailure('place_id_cache_read');
    return null;
  }
}

function photoNamesFromDetails(details: GoogleLegacyPlaceDetailsResult | null): string[] {
  if (!details?.photoName) return [];
  return [details.photoName];
}

export function canAttemptReviewPlaceMatch(): boolean {
  if (isGooglePlacesLiveBlocked()) return false;
  if (isGoogleParkingDiscoveryLiveBlocked()) return false;
  if (getMaxGoogleSearchTextPerRequest() <= 0) return false;
  return true;
}

async function upsertSnapshotRecord(record: ParkingGooglePlaceCacheRecord): Promise<void> {
  let client: PoolClient | null = null;
  const photoNames = record.photoNames ?? (record.photoName ? [record.photoName] : []);
  const hasPhotoNames = photoNames.length > 0;

  try {
    client = await db.connect();
    await client.query('begin');

    await client.query(
      `
        insert into parking_lot_google_place_snapshots (
          cache_key,
          parking_lot_id,
          airport_code,
          lot_name,
          normalized_lot_name,
          lot_address,
          google_place_id,
          google_place_name,
          google_formatted_address,
          google_maps_uri,
          rating,
          review_count,
          reviews_json,
          match_confidence,
          lat,
          lng,
          photo_name,
          photo_names_json,
          photo_refreshed_at,
          photo_source,
          last_fetched_at,
          updated_at,
          expires_at
        )
        values (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13::jsonb, $14,
          $15, $16, $17, $18::jsonb,
          case when $19::boolean then now() else null end,
          case when $19::boolean then $20 else null end,
          now(), now(), now() + interval '7 days'
        )
        on conflict (cache_key)
        do update set
          parking_lot_id = excluded.parking_lot_id,
          airport_code = excluded.airport_code,
          lot_name = excluded.lot_name,
          normalized_lot_name = excluded.normalized_lot_name,
          lot_address = excluded.lot_address,
          google_place_id = excluded.google_place_id,
          google_place_name = excluded.google_place_name,
          google_formatted_address = excluded.google_formatted_address,
          google_maps_uri = excluded.google_maps_uri,
          rating = excluded.rating,
          review_count = excluded.review_count,
          reviews_json = excluded.reviews_json,
          match_confidence = excluded.match_confidence,
          lat = excluded.lat,
          lng = excluded.lng,
          photo_name = excluded.photo_name,
          photo_names_json = excluded.photo_names_json,
          photo_refreshed_at = case
            when excluded.photo_refreshed_at is not null then excluded.photo_refreshed_at
            else parking_lot_google_place_snapshots.photo_refreshed_at
          end,
          photo_source = case
            when excluded.photo_source is not null then excluded.photo_source
            else parking_lot_google_place_snapshots.photo_source
          end,
          last_fetched_at = excluded.last_fetched_at,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
      `,
      [
        record.cacheKey,
        record.parkingLotId ?? null,
        record.airportCode.toUpperCase(),
        record.lotName,
        record.normalizedLotName,
        record.lotAddress ?? null,
        record.googlePlaceId ?? null,
        record.googlePlaceName ?? null,
        record.googleFormattedAddress ?? null,
        record.googleMapsUri ?? null,
        record.rating ?? null,
        record.reviewCount ?? null,
        JSON.stringify(record.reviews ?? []),
        record.matchConfidence ?? null,
        record.lat ?? null,
        record.lng ?? null,
        record.photoName ?? null,
        JSON.stringify(photoNames),
        hasPhotoNames,
        PLACE_PHOTO_SOURCE_GOOGLE,
      ],
    );

    await client.query('commit');
  } catch (error) {
    if (client) {
      await client.query('rollback').catch((rollbackError) => {
        console.warn('Google Places cache rollback failed', rollbackError);
      });
    }
    throw error;
  } finally {
    client?.release();
  }
}

function scheduleSnapshotCacheWrite(
  record: ParkingGooglePlaceCacheRecord,
  existingHint?: ParkingGooglePlaceCacheRecord | null,
): void {
  if (googlePlaceDbCacheDisabled()) return;

  scheduleGooglePlacesCacheWrite({
    cacheKey: record.cacheKey,
    incoming: {
      cacheKey: record.cacheKey,
      expiresAt: record.expiresAt,
      lat: record.lat,
      lng: record.lng,
      googlePlaceId: record.googlePlaceId,
      photoName: record.photoName,
      photoNames: record.photoNames,
      reviews: record.reviews,
    },
    existing: existingHint,
    loadExisting:
      existingHint === undefined
        ? () => getCachedRecordByKey(record.cacheKey)
        : undefined,
    write: () => upsertSnapshotRecord(record),
  });
}

function scoreSearchResult(result: GoogleLegacyPlaceSearchResult, args: {
  lotName: string;
  lotAddress?: string | null;
  airportCode?: string | null;
}): number {
  const candidateName = normalizeParkingLotName(result.name || '');
  const searchName = normalizeParkingLotName(args.lotName);
  const candidateAddress = normalizeAddress(result.formatted_address || result.vicinity);
  const lotAddress = normalizeAddress(args.lotAddress);

  let score = 0;

  if (!result.place_id) return -Infinity;

  const lowerName = String(result.name || '').toLowerCase();
  const officialAirportParking =
    cleanText(args.lotName).includes('official') ||
    cleanText(args.lotName).includes('garage') ||
    cleanText(args.lotName).includes('terminal parking');

  if (
    lowerName.includes('international airport') &&
    !lowerName.includes('parking') &&
    !lowerName.includes('garage') &&
    !officialAirportParking
  ) {
    return -Infinity;
  }

  if (candidateName && searchName) {
    if (candidateName === searchName) score += 60;
    else if (candidateName.includes(searchName) || searchName.includes(candidateName)) score += 35;
    else {
      const candidateTokens = new Set(candidateName.split(' '));
      const searchTokens = searchName.split(' ').filter((token) => token.length > 2);
      const shared = searchTokens.filter((token) => candidateTokens.has(token)).length;
      score += Math.min(shared * 8, 20);
    }
  }

  if (lotAddress && candidateAddress) {
    if (candidateAddress === lotAddress) score += 25;
    else if (candidateAddress.includes(lotAddress) || lotAddress.includes(candidateAddress)) score += 12;
  }

  if ((result.types || []).some((type) => ['parking', 'garage', 'establishment'].includes(type))) {
    score += 5;
  }

  if (lowerName.includes('parking') || lowerName.includes('garage')) score += 5;

  return score;
}

async function searchGooglePlaceNew(args: {
  lotName: string;
  lotAddress?: string | null;
  airportCode?: string | null;
  airportContext?: string | null;
}, options?: { maxQueries?: number; requireDiscovery?: boolean }): Promise<GoogleLegacyPlaceSearchResult | null> {
  if (googlePlacesLiveDisabled()) return null;

  const apiKey = getServerApiKey();
  if (!apiKey) return null;

  const airport = args.airportCode ? getAirportById(args.airportCode.toUpperCase()) : null;
  const queries = buildParkingSearchQueries(args).slice(0, options?.maxQueries);

  for (const query of queries) {
    const rankedMatch = await fetchSearchResultForQuery({
      query,
      lotName: args.lotName,
      lotAddress: args.lotAddress,
      airportCode: args.airportCode,
      airportContext: args.airportContext,
      execute: async () => {
        if (
          !canMakeLiveSearchTextCall(
            {
              reason: 'place_match_search',
              route: 'resolveParkingGooglePlace',
              lotName: args.lotName,
              airportCode: args.airportCode ?? null,
              cacheKey: buildParkingGoogleCacheKey({
                airportCode: args.airportCode,
                lotName: args.lotName,
                lotAddress: args.lotAddress,
              }),
            },
            options?.requireDiscovery ? { discovery: true } : undefined,
          )
        ) {
          return null;
        }

        const body: Record<string, unknown> = {
          textQuery: query,
          maxResultCount: 5,
        };

        if (airport?.geoLocation?.lat && airport?.geoLocation?.lng) {
          body.locationBias = {
            circle: {
              center: {
                latitude: airport.geoLocation.lat,
                longitude: airport.geoLocation.lng,
              },
              radius: Number(process.env.PARKING_SEARCH_RADIUS_METERS || 50000),
            },
          };
        }

        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': [
              'places.id',
              'places.displayName',
              'places.formattedAddress',
              'places.location',
              'places.rating',
              'places.userRatingCount',
              'places.googleMapsUri',
              'places.types',
              'places.photos',
            ].join(','),
          },
          body: JSON.stringify(body),
          cache: 'no-store',
        });

        if (!res.ok) {
          await logGooglePlacesError('places-new-search', res);
          return null;
        }

        const json = await res.json();
        const places = Array.isArray(json?.places) ? (json.places as GoogleNewPlace[]) : [];
        const ranked = places
          .map((place) => ({
            result: {
              place_id: place.id,
              name: place.displayName?.text,
              formatted_address: place.formattedAddress,
              rating: place.rating,
              user_ratings_total: place.userRatingCount,
              types: place.types,
              photoName: firstGooglePhotoName(place.photos),
              photoNames: googlePhotoNames(place.photos, 4),
              lat: place.location?.latitude,
              lng: place.location?.longitude,
              googleMapsUri: place.googleMapsUri,
            } satisfies GoogleLegacyPlaceSearchResult,
            score: scoreSearchResult(
              {
                place_id: place.id,
                name: place.displayName?.text,
                formatted_address: place.formattedAddress,
                rating: place.rating,
                user_ratings_total: place.userRatingCount,
                types: place.types,
                photoName: firstGooglePhotoName(place.photos),
                lat: place.location?.latitude,
                lng: place.location?.longitude,
              },
              args,
            ),
          }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score);

        if (ranked[0] && ranked[0].score >= 10) {
          return ranked[0].result;
        }

        return null;
      },
    });

    if (rankedMatch) {
      return rankedMatch;
    }
  }

  return null;
}

async function searchGooglePlace(args: {
  lotName: string;
  lotAddress?: string | null;
  airportCode?: string | null;
  airportContext?: string | null;
  provider?: string | null;
  source?: string | null;
}, options?: { maxQueries?: number; requireDiscovery?: boolean }): Promise<GoogleLegacyPlaceSearchResult | null> {
  const apiKey = getServerApiKey();
  if (!apiKey) return null;

  const newApiMatch = await searchGooglePlaceNew(args, options).catch(() => null);
  if (newApiMatch) return newApiMatch;

  const airport = args.airportCode ? getAirportById(args.airportCode.toUpperCase()) : null;
  const stableCacheKey = buildParkingGoogleCacheKey({
    airportCode: args.airportCode,
    lotName: args.lotName,
    lotAddress: args.lotAddress,
  });
  const queries = buildParkingSearchQueries({
    lotName: args.lotName,
    lotAddress: args.lotAddress,
    airportCode: args.airportCode || null,
    airportContext: args.airportContext || airport?.label || airport?.destinationName || null,
  }).slice(0, options?.maxQueries);

  for (const query of queries) {
    if (
      !canMakeLiveSearchTextCall(
        {
          reason: 'place_match_search_legacy',
          route: 'searchGooglePlace',
          lotName: args.lotName,
          airportCode: args.airportCode ?? null,
          cacheKey: stableCacheKey,
        },
        options?.requireDiscovery ? { discovery: true } : undefined,
      )
    ) {
      continue;
    }

    const params = new URLSearchParams({
      query,
      key: apiKey,
    });

    if (airport?.geoLocation?.lat && airport?.geoLocation?.lng) {
      params.set('location', `${airport.geoLocation.lat},${airport.geoLocation.lng}`);
      params.set('radius', String(Number(process.env.PARKING_SEARCH_RADIUS_METERS || 50000)));
    }

    const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      await logGooglePlacesError('places-legacy-search', res);
      continue;
    }

    const json = await res.json();
    const results = Array.isArray(json?.results) ? (json.results as GoogleLegacyPlaceSearchResult[]) : [];

    const ranked = results
      .map((result) => ({ result, score: scoreSearchResult(result, args) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked[0] && ranked[0].score >= 10) {
      return ranked[0].result;
    }
  }

  return null;
}

async function fetchGooglePlaceDetailsLive(
  placeId: string,
  context?: {
    lotName?: string | null;
    airportCode?: string | null;
    cacheKey?: string | null;
    reason?: string;
    purpose?: 'coordinates' | 'photos' | 'reviews';
  },
): Promise<GoogleLegacyPlaceDetailsResult | null> {
  const purpose = context?.purpose ?? 'coordinates';
  const callContext = {
    reason: context?.reason || purpose,
    route: 'fetchGooglePlaceDetailsLive',
    lotName: context?.lotName ?? null,
    airportCode: context?.airportCode ?? null,
    cacheKey: context?.cacheKey ?? placeId,
  };

  if (purpose === 'reviews') {
    if (!canMakeLiveGoogleReviewCall(callContext)) {
      return null;
    }
  } else if (
    !canMakeLiveGetPlaceCall(callContext)
  ) {
    return null;
  }

  logPlaceMetadataCache('google_getplace_live_called', {
    placeId,
    purpose,
    cacheKey: context?.cacheKey ?? placeId,
    lotName: context?.lotName ?? null,
    airportCode: context?.airportCode ?? null,
  });

  const apiKey = getServerApiKey();
  if (!apiKey) return null;

  const newFieldMask =
    purpose === 'reviews'
      ? [
          'id',
          'displayName',
          'formattedAddress',
          'location',
          'rating',
          'userRatingCount',
          'googleMapsUri',
          'reviews',
        ].join(',')
      : purpose === 'photos'
        ? ['id', 'location', 'photos'].join(',')
        : ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsUri'].join(',');

  const newRes = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': newFieldMask,
    },
    cache: 'no-store',
  }).catch(() => null);

  if (newRes?.ok) {
    const json = (await newRes.json()) as GoogleNewPlace;
    const mapped = newPlaceToLegacy(json);
    if (mapped) return mapped;
  } else {
    await logGooglePlacesError('places-new-details', newRes);
  }

  const legacyFields =
    purpose === 'reviews'
      ? 'name,rating,user_ratings_total,reviews,formatted_address,url,geometry'
      : purpose === 'photos'
        ? 'photos,geometry'
        : 'name,formatted_address,url,geometry';

  const params = new URLSearchParams({
    place_id: placeId,
    fields: legacyFields,
    key: apiKey,
  });

  const res = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`, {
    cache: 'no-store',
  }).catch(() => null);

  if (!res?.ok) {
    await logGooglePlacesError('places-legacy-details', res);
    return null;
  }

  const json = await res.json();
  const result = (json?.result as GoogleLegacyPlaceDetailsResult | undefined) || null;
  if (result?.geometry?.location) {
    result.lat = result.geometry.location.lat;
    result.lng = result.geometry.location.lng;
  }
  return result;
}

async function fetchGooglePlaceDetails(
  placeId: string,
  context?: {
    lotName?: string | null;
    airportCode?: string | null;
    cacheKey?: string | null;
    reason?: string;
    purpose?: 'coordinates' | 'photos' | 'reviews';
  },
): Promise<GoogleLegacyPlaceDetailsResult | null> {
  const normalizedPlaceId = placeId.trim();
  if (!normalizedPlaceId) return null;

  const cachedByPlaceId = await getCachedRecordByPlaceId(normalizedPlaceId);
  const purpose = context?.purpose ?? 'coordinates';
  if (
    cachedByPlaceId &&
    hasUsablePlaceCoords(cachedByPlaceId) &&
    purpose !== 'reviews'
  ) {
    logPlaceMetadataCache('google_getplace_skipped_cache_hit', {
      placeId: normalizedPlaceId,
      reason: 'supabase_place_id_cache',
      cacheKey: context?.cacheKey ?? normalizedPlaceId,
    });
    const freshPhotoNames = getFreshPhotoNamesFromRecord(cachedByPlaceId);
    return {
      place_id: cachedByPlaceId.googlePlaceId,
      name: cachedByPlaceId.googlePlaceName,
      formatted_address: cachedByPlaceId.googleFormattedAddress,
      rating: cachedByPlaceId.rating,
      user_ratings_total: cachedByPlaceId.reviewCount,
      url: cachedByPlaceId.googleMapsUri,
      lat: cachedByPlaceId.lat,
      lng: cachedByPlaceId.lng,
      photoName: freshPhotoNames[0],
      photoNames: freshPhotoNames,
    };
  }

  const inFlight = detailsInFlight.get(normalizedPlaceId);
  if (inFlight) return inFlight;

  const promise = fetchGooglePlaceDetailsLive(normalizedPlaceId, {
    ...context,
    purpose: context?.purpose ?? 'coordinates',
    reason: context?.reason ?? 'place_details',
  });
  detailsInFlight.set(normalizedPlaceId, promise);

  try {
    return await promise;
  } finally {
    detailsInFlight.delete(normalizedPlaceId);
  }
}

/**
 * Resolve a Google place_id to coordinates using the cached + budget-guarded
 * getPlace path. Returns null when the id is empty, the place has no usable
 * location, or the live call is blocked/unavailable. Never throws.
 *
 * This lets trip endpoints that were selected from an autocomplete prediction
 * (place_id only, no coordinates) get a confirmed location without an extra
 * Geocoding API call.
 */
export async function resolveGooglePlaceCoordinates(
  placeId: string | undefined | null,
  context?: { reason?: string; cacheKey?: string | null },
): Promise<{ lat: number; lng: number } | null> {
  const normalizedPlaceId = placeId?.trim();
  if (!normalizedPlaceId) return null;

  let details: GoogleLegacyPlaceDetailsResult | null = null;
  try {
    details = await fetchGooglePlaceDetails(normalizedPlaceId, {
      purpose: 'coordinates',
      reason: context?.reason ?? 'destination_coordinates',
      cacheKey: context?.cacheKey ?? normalizedPlaceId,
    });
  } catch {
    return null;
  }

  if (!details) return null;

  const lat = details.lat ?? details.geometry?.location?.lat;
  const lng = details.lng ?? details.geometry?.location?.lng;

  if (
    typeof lat === 'number' &&
    Number.isFinite(lat) &&
    typeof lng === 'number' &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }

  return null;
}

function buildSearchQueryCacheKey(args: {
  query: string;
  lotName: string;
  airportCode?: string | null;
}): string {
  return [args.airportCode || 'UNKNOWN', args.lotName, args.query]
    .map((part) => cleanText(part))
    .join('|');
}

async function fetchSearchResultForQuery(args: {
  query: string;
  lotName: string;
  lotAddress?: string | null;
  airportCode?: string | null;
  airportContext?: string | null;
  execute: () => Promise<GoogleLegacyPlaceSearchResult | null>;
}): Promise<GoogleLegacyPlaceSearchResult | null> {
  const cacheKey = buildSearchQueryCacheKey(args);
  const cached = searchQueryResultCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SEARCH_QUERY_CACHE_TTL_MS) {
    return cached.result;
  }

  const inFlight = searchQueryInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = args.execute().then((result) => {
    searchQueryResultCache.set(cacheKey, { ts: Date.now(), result });
    return result;
  });

  searchQueryInFlight.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    searchQueryInFlight.delete(cacheKey);
  }
}

export async function fetchGooglePlacePhotoName(
  placeId: string,
  _timeoutMs = 1500,
): Promise<string | null> {
  const names = await fetchGooglePlacePhotoNames(placeId, 1);
  return names[0] || null;
}

export async function fetchGooglePlacePhotoNames(
  placeId: string | null | undefined,
  limit = 4,
): Promise<string[]> {
  const normalizedPlaceId = typeof placeId === 'string' ? placeId.trim() : '';
  if (!normalizedPlaceId) return [];

  const cachedByPlaceId = await getCachedRecordByPlaceId(normalizedPlaceId);
  const freshCachedNames = getFreshPhotoNamesFromRecord(cachedByPlaceId);
  if (freshCachedNames.length) {
    return freshCachedNames.slice(0, limit);
  }

  const cachedPhotoName = photoNameCache.get(normalizedPlaceId);
  if (cachedPhotoName && Date.now() - cachedPhotoName.ts < GOOGLE_PLACE_PHOTO_NAME_CACHE_TTL_MS) {
    return cachedPhotoName.photoName ? [cachedPhotoName.photoName] : [];
  }

  if (googlePlacesLiveDisabled() || isGooglePlacePhotosLiveBlocked()) {
    return [];
  }

  if (
    !canMakeLiveGetPlaceCall({
      reason: 'place_photo_names',
      route: 'fetchGooglePlacePhotoNames',
      cacheKey: normalizedPlaceId,
    })
  ) {
    return [];
  }

  const details = await fetchGooglePlaceDetailsLive(normalizedPlaceId, {
    cacheKey: normalizedPlaceId,
    reason: 'place_photo_names',
    purpose: 'photos',
  }).catch(() => null);
  const photoNames = details?.photoNames?.length
    ? details.photoNames
    : details?.photoName
      ? [details.photoName]
      : [];

  if (photoNames.length) {
    photoNameCache.set(normalizedPlaceId, {
      ts: Date.now(),
      photoName: photoNames[0] || null,
    });
  }

  return photoNames.slice(0, limit);
}

type ResolveParkingGooglePlaceArgs = {
  airportCode?: string | null;
  parkingLotId?: string | number | null;
  lotName: string;
  lotAddress?: string | null;
  googlePlaceId?: string | null;
  airportContext?: string | null;
  provider?: string | null;
  source?: string | null;
};

type ResolveParkingGooglePlaceOptions = {
  maxSearchQueries?: number;
  requireDiscovery?: boolean;
};

export async function resolveParkingGooglePlace(
  args: ResolveParkingGooglePlaceArgs,
  options?: ResolveParkingGooglePlaceOptions,
): Promise<ParkingGooglePlaceCacheRecord | null> {
  if (
    !shouldAttemptGooglePlaceMatch({
      lotName: args.lotName,
      lotAddress: args.lotAddress,
      provider: args.provider,
      source: args.source,
      airportCode: args.airportCode || null,
    })
  ) {
    return null;
  }

  // Coalesce concurrent lookups for the same lot identity + lookup profile so a
  // slow/timed-out cache read does not fan out into duplicate live calls.
  const inFlightKey = [
    buildParkingGoogleCacheKey(args),
    options?.requireDiscovery ? 'disc' : 'std',
    `q:${options?.maxSearchQueries ?? 'def'}`,
  ].join('::');

  const existing = resolvePlaceInFlight.get(inFlightKey);
  if (existing) {
    // Reuse the in-flight live lookup instead of starting another one for the
    // same stable lot key + lookup profile.
    inFlightPlaceLookupShares += 1;
    logPlaceSearchDedupeSummary();
    return existing;
  }

  const promise = resolveParkingGooglePlaceUncached(args, options).finally(() => {
    resolvePlaceInFlight.delete(inFlightKey);
  });
  resolvePlaceInFlight.set(inFlightKey, promise);
  return promise;
}

async function resolveParkingGooglePlaceUncached(
  args: ResolveParkingGooglePlaceArgs,
  options?: ResolveParkingGooglePlaceOptions,
): Promise<ParkingGooglePlaceCacheRecord | null> {
  if (!shouldAttemptGooglePlaceMatch({
    lotName: args.lotName,
    lotAddress: args.lotAddress,
    provider: args.provider,
    source: args.source,
    airportCode: args.airportCode || null,
  })) {
    return null;
  }

  const cacheKey = buildParkingGoogleCacheKey(args);

  const requestCached = getPlaceMetadataRequestCacheHit(cacheKey);
  if (requestCached !== undefined) {
    logPlaceMetadataCache('place_metadata_cache_hit', {
      cacheKey,
      lotName: args.lotName,
      hasRecord: Boolean(requestCached),
    });
    if (requestCached && hasUsablePlaceCoords(requestCached)) {
      return requestCached;
    }
  } else {
    logPlaceMetadataCache('place_metadata_cache_miss', {
      cacheKey,
      lotName: args.lotName,
    });
  }

  // Skip repeating a live search for a lot that just returned no Google match.
  // Discovery/review lookups intentionally bypass the negative cache so they are
  // never blocked from attempting their own match.
  if (!options?.requireDiscovery && hasFreshNegativePlaceMatch(cacheKey)) {
    dedupedNegativeSearchSkips += 1;
    logPlaceSearchDedupeSummary();
    logPlaceMetadataCache('place_metadata_negative_cache_hit', {
      cacheKey,
      lotName: args.lotName,
    });
    return null;
  }

  const freshCached = await getFreshCachedRecordByKey(cacheKey);
  if (freshCached && hasUsablePlaceCoords(freshCached)) {
    logPlaceMetadataCache('place_metadata_supabase_hit', {
      cacheKey,
      lotName: args.lotName,
      googlePlaceId: freshCached.googlePlaceId ?? null,
    });
    const record: ParkingGooglePlaceCacheRecord = {
      ...freshCached,
      source: 'supabase-cache',
    };
    logGooglePlaceCacheRecord('after_supabase_load_cache', record, {
      stageNote: 'fresh Supabase Google metadata hit with usable coordinates',
      cacheStatus: 'fresh_hit',
      selectedVisualSource:
        record.photoName || record.photoNames?.length
          ? 'google photo'
          : 'illustration',
      illustrationReason:
        record.photoName || record.photoNames?.length
          ? null
          : 'supabase_record_has_no_photo_metadata',
    });
    setPlaceMetadataRequestCacheHit(cacheKey, record);
    return record;
  }

  const staleCached = await getCachedRecordByKey(cacheKey);
  if (staleCached && hasUsablePlaceCoords(staleCached)) {
    logPlaceMetadataCache('place_metadata_supabase_hit', {
      cacheKey,
      lotName: args.lotName,
      googlePlaceId: staleCached.googlePlaceId ?? null,
      stale: true,
    });
    const record: ParkingGooglePlaceCacheRecord = {
      ...staleCached,
      source: 'stale-fallback',
    };
    logGooglePlaceCacheRecord('after_supabase_load_cache', record, {
      stageNote: 'stale Supabase Google metadata hit with usable coordinates',
      cacheStatus: 'stale_hit',
      selectedVisualSource:
        record.photoName || record.photoNames?.length
          ? 'google photo'
          : 'illustration',
      illustrationReason:
        record.photoName || record.photoNames?.length
          ? null
          : 'stale_supabase_record_has_no_photo_metadata',
    });
    setPlaceMetadataRequestCacheHit(cacheKey, record);
    return record;
  }

  logPlaceMetadataCache('place_metadata_supabase_miss', {
    cacheKey,
    lotName: args.lotName,
    googlePlaceId: args.googlePlaceId ?? null,
  });

  const cachedMetadata = freshCached || staleCached;
  logGooglePlaceCacheRecord('after_supabase_load_cache', cachedMetadata, {
    stageNote: cachedMetadata
      ? 'Supabase Google metadata hit without usable coordinates; resolver will try live Google details/search'
      : 'No Google metadata found for this lot in Supabase cache.',
    cacheStatus: cachedMetadata ? 'partial_hit_without_usable_coords' : 'miss',
    lotName: args.lotName,
    parkingLotId: args.parkingLotId,
    googlePlaceId: args.googlePlaceId,
    cacheKey,
    selectedVisualSource:
      cachedMetadata?.photoName || cachedMetadata?.photoNames?.length
        ? 'google photo'
        : 'illustration',
    illustrationReason:
      cachedMetadata?.photoName || cachedMetadata?.photoNames?.length
        ? null
        : cachedMetadata
          ? 'cached_metadata_has_no_photo_metadata'
          : 'No Google metadata found for this lot.',
  });

  const lookupPlaceId = args.googlePlaceId || cachedMetadata?.googlePlaceId || null;
  if (lookupPlaceId) {
    const byPlaceId = await getCachedRecordByPlaceId(lookupPlaceId);
    if (byPlaceId && hasUsablePlaceCoords(byPlaceId)) {
      const record: ParkingGooglePlaceCacheRecord = {
        ...byPlaceId,
        cacheKey,
        lotName: args.lotName,
        lotAddress: args.lotAddress || byPlaceId.lotAddress,
        parkingLotId: numericParkingLotId(args.parkingLotId) ?? byPlaceId.parkingLotId,
        source: freshCached ? 'supabase-cache' : 'stale-fallback',
      };
      logGooglePlaceCacheRecord('after_supabase_load_cache', record, {
        stageNote: 'Supabase Google metadata hit by Google place id',
        cacheStatus: 'place_id_hit',
        selectedVisualSource:
          record.photoName || record.photoNames?.length
            ? 'google photo'
            : 'illustration',
        illustrationReason:
          record.photoName || record.photoNames?.length
            ? null
            : 'place_id_cache_record_has_no_photo_metadata',
      });
      setPlaceMetadataRequestCacheHit(cacheKey, record);
      return record;
    }
  }

  if (googlePlacesLiveDisabled()) {
    const record: ParkingGooglePlaceCacheRecord | null = cachedMetadata
      ? {
          ...cachedMetadata,
          source: 'stale-fallback',
        }
      : null;
    logGooglePlaceCacheRecord('after_google_places_discovery', record, {
      stageNote: 'Google Places live lookup disabled; returning cached metadata if available',
      cacheStatus: cachedMetadata ? 'live_disabled_cached_fallback' : 'live_disabled_no_cache',
      lotName: args.lotName,
      parkingLotId: args.parkingLotId,
      googlePlaceId: args.googlePlaceId,
      cacheKey,
      selectedVisualSource:
        record?.photoName || record?.photoNames?.length
          ? 'google photo'
          : 'illustration',
      illustrationReason:
        record?.photoName || record?.photoNames?.length
          ? null
          : 'google_places_live_disabled_and_no_photo_metadata',
    });
    return record
  }

  let placeId = args.googlePlaceId || cachedMetadata?.googlePlaceId || null;
  let details: GoogleLegacyPlaceDetailsResult | null = null;
  let matchedPhotoName: string | undefined;

  const detailsContext = {
    lotName: args.lotName,
    airportCode: args.airportCode ?? null,
    cacheKey,
  };

  if (placeId && !hasUsablePlaceCoords(cachedMetadata || {})) {
    details = await fetchGooglePlaceDetails(placeId, detailsContext).catch(() => null);
  }

  const detailsMissingCoords =
    !details ||
    typeof details.lat !== 'number' ||
    typeof details.lng !== 'number';
  let matchedSearchResult: GoogleLegacyPlaceSearchResult | null = null;

  if (!placeId || detailsMissingCoords) {
    const matched = await searchGooglePlace({
      lotName: args.lotName,
      lotAddress: args.lotAddress,
      airportCode: args.airportCode,
      airportContext: args.airportContext,
      provider: args.provider,
      source: args.source,
    }, {
      maxQueries: options?.maxSearchQueries,
      requireDiscovery: options?.requireDiscovery,
    }).catch(() => null);
    matchedSearchResult = matched;

    matchedPhotoName = matched?.photoName;

    if (matched?.place_id) {
      placeId = matched.place_id;
      if (shouldSkipGetPlaceForSearchResult(matched)) {
        details = searchResultToDetails(matched);
        logPlaceMetadataCache('google_getplace_skipped_cache_hit', {
          cacheKey,
          placeId: matched.place_id,
          reason: 'search_text_sufficient',
          lotName: args.lotName,
        });
      } else if (detailsMissingCoords) {
        details = await fetchGooglePlaceDetails(matched.place_id, detailsContext).catch(() => null);
      }
    } else if (!placeId) {
      if (cachedMetadata) {
        const record: ParkingGooglePlaceCacheRecord = {
          ...cachedMetadata,
          source: 'stale-fallback',
        };
        logGooglePlaceCacheRecord('after_google_places_discovery', record, {
          stageNote: 'Google Places search did not match; falling back to cached metadata',
          cacheStatus: 'search_no_match_cached_fallback',
          selectedVisualSource:
            record.photoName || record.photoNames?.length
              ? 'google photo'
              : 'illustration',
          illustrationReason:
            record.photoName || record.photoNames?.length
              ? null
              : 'google_places_search_no_match_and_cached_metadata_has_no_photo',
        });
        return record;
      }

      logGooglePlaceCacheRecord('after_google_places_discovery', null, {
        stageNote: 'Google Places search did not match and no cached metadata exists',
        cacheStatus: 'search_no_match',
        lotName: args.lotName,
        parkingLotId: args.parkingLotId,
        googlePlaceId: args.googlePlaceId,
        cacheKey,
        selectedVisualSource: 'illustration',
        illustrationReason: 'No Google metadata found for this lot.',
      });
      // Remember this miss briefly so repeated lookups in the same run do not
      // immediately hit Google again. Discovery lookups are not negatively cached.
      if (!options?.requireDiscovery) {
        recordNegativePlaceMatch(cacheKey);
      }
      return null;
    }
  }

  if (!details?.place_id && !placeId) {
    const record: ParkingGooglePlaceCacheRecord | null = cachedMetadata
      ? { ...cachedMetadata, source: 'stale-fallback' }
      : null;
    logGooglePlaceCacheRecord('after_google_places_discovery', record, {
      stageNote: 'Google Places details had no place id; returning cached metadata if available',
      cacheStatus: record ? 'details_no_place_id_cached_fallback' : 'details_no_place_id_no_cache',
      lotName: args.lotName,
      parkingLotId: args.parkingLotId,
      googlePlaceId: args.googlePlaceId,
      cacheKey,
      selectedVisualSource:
        record?.photoName || record?.photoNames?.length
          ? 'google photo'
          : 'illustration',
      illustrationReason:
        record?.photoName || record?.photoNames?.length
          ? null
          : 'google_places_details_missing_place_id_and_no_photo_metadata',
    });
    return record;
  }

  const cachedFreshPhotoNames = getFreshPhotoNamesFromRecord(cachedMetadata);

  const photoNames =
    details?.photoNames?.length
      ? details.photoNames
      : details?.photoName
        ? [details.photoName]
        : matchedSearchResult?.photoNames?.length
          ? matchedSearchResult.photoNames
          : matchedPhotoName
            ? [matchedPhotoName]
            : cachedFreshPhotoNames;

  const resolvedReviews = cachedMetadata?.reviews || [];

  const record: ParkingGooglePlaceCacheRecord = {
    cacheKey,
    parkingLotId: numericParkingLotId(args.parkingLotId),
    airportCode: String(args.airportCode || 'UNKNOWN').toUpperCase(),
    lotName: args.lotName,
    normalizedLotName: normalizeParkingLotName(args.lotName),
    lotAddress: args.lotAddress || undefined,
    googlePlaceId: details?.place_id || placeId || undefined,
    googlePlaceName: details?.name || cachedMetadata?.googlePlaceName || undefined,
    googleFormattedAddress:
      details?.formatted_address || cachedMetadata?.googleFormattedAddress || undefined,
    googleMapsUri: details?.url || cachedMetadata?.googleMapsUri || undefined,
    lat: details?.lat ?? cachedMetadata?.lat,
    lng: details?.lng ?? cachedMetadata?.lng,
    photoName:
      details?.photoName ||
      matchedPhotoName ||
      cachedFreshPhotoNames[0] ||
      photoNames[0] ||
      undefined,
    photoNames: photoNames.length ? photoNames : undefined,
    photoRefreshedAt: photoNames.length ? new Date().toISOString() : cachedMetadata?.photoRefreshedAt,
    photoSource: photoNames.length ? PLACE_PHOTO_SOURCE_GOOGLE : cachedMetadata?.photoSource,
    rating:
      typeof details?.rating === 'number'
        ? details.rating
        : typeof matchedSearchResult?.rating === 'number'
          ? matchedSearchResult.rating
          : cachedMetadata?.rating,
    reviewCount:
      typeof details?.user_ratings_total === 'number'
        ? details.user_ratings_total
        : typeof matchedSearchResult?.user_ratings_total === 'number'
          ? matchedSearchResult.user_ratings_total
          : cachedMetadata?.reviewCount,
    reviews: resolvedReviews,
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    matchConfidence: args.googlePlaceId || cachedMetadata?.googlePlaceId ? 'direct' : 'strong',
    source: 'google-places',
  };

  scheduleSnapshotCacheWrite(record, cachedMetadata);

  logGooglePlaceCacheRecord('after_google_places_discovery', record, {
    stageNote: 'Google Places match/details resolved parking metadata',
    cacheStatus: details ? 'live_details' : 'place_id_without_details',
    liveDetailsReturned: Boolean(details),
    searchTextSufficient: Boolean(
      matchedSearchResult && searchResultHasSufficientMetadata(matchedSearchResult),
    ),
    selectedVisualSource:
      record.photoName || record.photoNames?.length
        ? 'google photo'
        : 'illustration',
    illustrationReason:
      record.photoName || record.photoNames?.length
        ? null
        : 'google_places_details_returned_no_photo_metadata',
  });

  // A live match succeeded; ensure any prior short-lived negative entry for this
  // lot is cleared so a successful match is never blocked.
  clearNegativePlaceMatch(cacheKey);
  setPlaceMetadataRequestCacheHit(cacheKey, record);
  return record;
}

export async function getCachedParkingGoogleReviews(args: {
  airportCode?: string | null;
  parkingLotId?: string | number | null;
  lotName: string;
  lotAddress?: string | null;
  googlePlaceId?: string | null;
}): Promise<ParkingGooglePlaceCacheRecord | null> {
  const cacheKey = buildParkingGoogleCacheKey(args);
  const freshCached = await getFreshCachedRecordByKey(cacheKey);
  if (freshCached) {
    const record: ParkingGooglePlaceCacheRecord = { ...freshCached, source: 'supabase-cache' };
    logGooglePlaceCacheRecord('after_supabase_load_cache', record, {
      stageNote: 'fresh Supabase Google reviews cache hit',
      cacheStatus: 'reviews_fresh_hit',
      selectedVisualSource:
        record.photoName || record.photoNames?.length
          ? 'google photo'
          : 'illustration',
      illustrationReason:
        record.photoName || record.photoNames?.length
          ? null
          : 'reviews_cache_record_has_no_photo_metadata',
    });
    return record;
  }

  const staleCached = await getCachedRecordByKey(cacheKey);
  if (staleCached) {
    const record: ParkingGooglePlaceCacheRecord = { ...staleCached, source: 'stale-fallback' };
    logGooglePlaceCacheRecord('after_supabase_load_cache', record, {
      stageNote: 'stale Supabase Google reviews cache hit',
      cacheStatus: 'reviews_stale_hit',
      selectedVisualSource:
        record.photoName || record.photoNames?.length
          ? 'google photo'
          : 'illustration',
      illustrationReason:
        record.photoName || record.photoNames?.length
          ? null
          : 'reviews_stale_cache_record_has_no_photo_metadata',
    });
    return record;
  }

  const lookupPlaceId = args.googlePlaceId || null;
  if (lookupPlaceId) {
    const byPlaceId = await getCachedRecordByPlaceId(lookupPlaceId);
    if (byPlaceId) {
      const record: ParkingGooglePlaceCacheRecord = {
        ...byPlaceId,
        cacheKey,
        lotName: args.lotName,
        source: 'supabase-cache',
      };
      logGooglePlaceCacheRecord('after_supabase_load_cache', record, {
        stageNote: 'Supabase Google reviews cache hit by place id',
        cacheStatus: 'reviews_place_id_hit',
        selectedVisualSource:
          record.photoName || record.photoNames?.length
            ? 'google photo'
            : 'illustration',
        illustrationReason:
          record.photoName || record.photoNames?.length
            ? null
            : 'reviews_place_id_cache_record_has_no_photo_metadata',
      });
      return record;
    }
  }

  logGooglePlaceCacheRecord('after_supabase_load_cache', null, {
    stageNote: 'No Google reviews/photo metadata found for this lot in Supabase cache.',
    cacheStatus: 'reviews_miss',
    lotName: args.lotName,
    parkingLotId: args.parkingLotId,
    googlePlaceId: args.googlePlaceId,
    cacheKey,
    selectedVisualSource: 'illustration',
    illustrationReason: 'No Google metadata found for this lot.',
  });

  return null;
}

export async function resolveParkingGoogleReviews(args: {
  airportCode?: string | null;
  parkingLotId?: string | number | null;
  lotName: string;
  lotAddress?: string | null;
  googlePlaceId?: string | null;
}): Promise<ParkingGooglePlaceCacheRecord | null> {
  const cached = await getCachedParkingGoogleReviews(args);
  if (cached?.reviews?.length) {
    return cached;
  }

  if (isGooglePlaceReviewsLiveBlocked()) {
    return cached;
  }

  let baseRecord = cached;
  let placeId = args.googlePlaceId || cached?.googlePlaceId || null;

  if (!placeId && canAttemptReviewPlaceMatch()) {
    const matched = await resolveParkingGooglePlace(
      {
        airportCode: args.airportCode,
        parkingLotId: args.parkingLotId,
        lotName: args.lotName,
        lotAddress: args.lotAddress,
      },
      { maxSearchQueries: 1, requireDiscovery: true },
    ).catch(() => null);

    if (matched?.googlePlaceId) {
      placeId = matched.googlePlaceId;
      baseRecord = matched;
      if (matched.reviews?.length) {
        return matched;
      }
    }
  }

  if (!placeId) {
    return cached;
  }

  const cacheKey = buildParkingGoogleCacheKey(args);
  const details = await fetchGooglePlaceDetails(placeId, {
    lotName: args.lotName,
    airportCode: args.airportCode ?? null,
    cacheKey,
    reason: 'reviews',
    purpose: 'reviews',
  }).catch(() => null);

  if (!details) {
    return baseRecord?.googlePlaceId
      ? {
          ...baseRecord,
          googlePlaceId: baseRecord.googlePlaceId || placeId,
          source: baseRecord.source || 'unavailable',
        }
      : cached;
  }

  const reviews = (details.reviews || []).slice(0, 5).map((review, index) =>
    toReview(review, index, details.place_id || placeId),
  );

  if (!reviews.length) {
    const record: ParkingGooglePlaceCacheRecord = {
      ...(baseRecord || {
        cacheKey,
        airportCode: String(args.airportCode || 'UNKNOWN').toUpperCase(),
        lotName: args.lotName,
        normalizedLotName: normalizeParkingLotName(args.lotName),
        lotAddress: args.lotAddress || undefined,
        fetchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      cacheKey,
      parkingLotId: numericParkingLotId(args.parkingLotId) ?? baseRecord?.parkingLotId,
      googlePlaceId: details.place_id || placeId,
      googlePlaceName: details.name || baseRecord?.googlePlaceName,
      googleFormattedAddress: details.formatted_address || baseRecord?.googleFormattedAddress,
      googleMapsUri: details.url || baseRecord?.googleMapsUri,
      rating: typeof details.rating === 'number' ? details.rating : baseRecord?.rating,
      reviewCount:
        typeof details.user_ratings_total === 'number'
          ? details.user_ratings_total
          : baseRecord?.reviewCount,
      reviews: baseRecord?.reviews || [],
      fetchedAt: baseRecord?.fetchedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: baseRecord?.source ?? 'google-places',
    };
    logGooglePlaceCacheRecord('after_google_places_discovery', record, {
      stageNote: 'Google Places review details returned no snippets',
      cacheStatus: 'reviews_live_no_snippets',
      selectedVisualSource:
        record.photoName || record.photoNames?.length
          ? 'google photo'
          : 'illustration',
      illustrationReason:
        record.photoName || record.photoNames?.length
          ? null
          : 'google_reviews_details_returned_no_photo_metadata',
    });
    return record;
  }

  const record: ParkingGooglePlaceCacheRecord = {
    ...(baseRecord || {
      cacheKey,
      airportCode: String(args.airportCode || 'UNKNOWN').toUpperCase(),
      lotName: args.lotName,
      normalizedLotName: normalizeParkingLotName(args.lotName),
      lotAddress: args.lotAddress || undefined,
      fetchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
    cacheKey,
    parkingLotId: numericParkingLotId(args.parkingLotId) ?? baseRecord?.parkingLotId,
    googlePlaceId: details.place_id || placeId,
    googlePlaceName: details.name || baseRecord?.googlePlaceName,
    googleFormattedAddress: details.formatted_address || baseRecord?.googleFormattedAddress,
    googleMapsUri: details.url || baseRecord?.googleMapsUri,
    rating: typeof details.rating === 'number' ? details.rating : baseRecord?.rating,
    reviewCount:
      typeof details.user_ratings_total === 'number'
        ? details.user_ratings_total
        : baseRecord?.reviewCount,
    reviews,
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'google-places',
  };

  scheduleSnapshotCacheWrite(record, baseRecord);
  logGooglePlaceCacheRecord('after_google_places_discovery', record, {
    stageNote: 'Google Places review details returned snippets',
    cacheStatus: 'reviews_live_with_snippets',
    selectedVisualSource:
      record.photoName || record.photoNames?.length
        ? 'google photo'
        : 'illustration',
    illustrationReason:
      record.photoName || record.photoNames?.length
        ? null
        : 'google_reviews_details_record_has_no_photo_metadata',
  });
  return record;
}

export function parkingGooglePlaceToOptionUpdate(place: ParkingGooglePlaceCacheRecord): Partial<ParkingOption> {
  const hasGoogleCoords = typeof place.lat === 'number' && typeof place.lng === 'number';
  const photoNames = place.photoNames?.length
    ? place.photoNames
    : place.photoName
      ? [place.photoName]
      : undefined;

  return {
    googlePlaceId: place.googlePlaceId,
    googleReviews: place.reviews,
    googleReviewsFetchedAt: place.fetchedAt,
    googleReviewsExpiresAt: place.expiresAt,
    googlePlaceName: place.googlePlaceName,
    googlePlaceAddress: place.googleFormattedAddress,
    googleMapsUri: place.googleMapsUri,
    googlePhotoName: photoNames?.[0],
    googlePhotoNames: photoNames,
    reviewScore: typeof place.rating === 'number' ? place.rating : undefined,
    reviewCount: typeof place.reviewCount === 'number' ? place.reviewCount : undefined,
    normalizedAddress: place.googleFormattedAddress || undefined,
    address: place.googleFormattedAddress || undefined,
    ...(hasGoogleCoords
      ? {
          canonicalLat: place.lat,
          canonicalLng: place.lng,
          canonicalAddress: place.googleFormattedAddress || undefined,
          coordinateSource: 'google_place' as const,
          lat: place.lat,
          lng: place.lng,
        }
      : {}),
  };
}

export function resetGooglePlacesCacheForTests(): void {
  detailsInFlight.clear();
  searchQueryInFlight.clear();
  searchQueryResultCache.clear();
  photoNameCache.clear();
  photoNameInFlight.clear();
  resolvePlaceInFlight.clear();
  negativePlaceMatchCache.clear();
  dedupedNegativeSearchSkips = 0;
  inFlightPlaceLookupShares = 0;
  lastPlaceSearchDedupeLogAt = 0;
  cacheReadFailureCounts.clear();
  lastCacheReadFailureLogAt = 0;
  resetGooglePlacesCacheWriteForTests();
  resetPlaceMetadataRequestCacheForTests();
}
