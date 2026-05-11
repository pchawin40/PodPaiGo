import { db } from '../db/client';
import { getAirportById } from '../airports/catalog';
import { ParkingOption, ParkingGooglePlaceSnapshot, ParkingGoogleReview } from '../types';
import {
  buildParkingGoogleCacheKey,
  cleanGoogleParkingSearchName,
  normalizeParkingLotName,
  shouldAttemptGooglePlaceMatch,
} from './googlePlaceMatchUtils';

type GoogleLegacyReview = {
  author_name?: string;
  rating?: number;
  relative_time_description?: string;
  text?: string;
  profile_photo_url?: string;
  time?: number;
};

type GoogleLegacyPlaceSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  vicinity?: string;
  types?: string[];
};

type GoogleLegacyPlaceDetailsResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  url?: string;
  reviews?: GoogleLegacyReview[];
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
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  types?: string[];
  reviews?: GoogleNewReview[];
};

export type ParkingGooglePlaceCacheRecord = ParkingGooglePlaceSnapshot & {
  cacheKey: string;
  matchConfidence?: 'strong' | 'weak' | 'direct';
  source: 'supabase-cache' | 'google-places' | 'stale-fallback' | 'unavailable';
};

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

function buildParkingSearchQuery(args: {
  lotName: string;
  lotAddress?: string | null;
  airportCode?: string | null;
  airportContext?: string | null;
}): string {
  const name = cleanGoogleParkingSearchName(args.lotName) || args.lotName;
  const airport = args.airportCode ? getAirportById(args.airportCode.toUpperCase()) : null;
  const context = [
    args.lotAddress,
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
  const context = args.airportContext || airport?.label || airport?.destinationName || args.airportCode || null;
  const queries = [
    [simplifiedName, args.lotAddress].filter(Boolean).join(' '),
    [simplifiedName, context].filter(Boolean).join(' '),
    [args.lotName, args.lotAddress].filter(Boolean).join(' '),
    [args.lotName, context, 'parking'].filter(Boolean).join(' '),
    buildParkingSearchQuery(args),
  ];

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
}

function getServerApiKey(): string | null {
  return process.env.GOOGLE_MAPS_SERVER_API_KEY || null;
}

async function logGooglePlacesError(scope: string, res: Response | null): Promise<void> {
  if (process.env.NODE_ENV === 'production' || !res || res.ok) return;

  let body = '';
  try {
    body = await res.clone().text();
  } catch {
    body = '';
  }

  console.warn(`[google-place-match ${scope} error]`, {
    status: res.status,
    body: body.slice(0, 800),
  });
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

function newPlaceToLegacy(place: GoogleNewPlace | null | undefined): GoogleLegacyPlaceDetailsResult | null {
  if (!place?.id) return null;

  return {
    place_id: place.id,
    name: place.displayName?.text,
    formatted_address: place.formattedAddress,
    rating: place.rating,
    user_ratings_total: place.userRatingCount,
    url: place.googleMapsUri,
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
  const result = await db.query(
    `
      select
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
        last_fetched_at,
        updated_at,
        expires_at
      from parking_lot_google_place_snapshots
      where cache_key = $1
      order by updated_at desc
      limit 1
    `,
    [cacheKey],
  );

  if (result.rows.length === 0) return null;

  return mapRowToRecord(result.rows[0]);
}

async function getFreshCachedRecordByKey(cacheKey: string): Promise<ParkingGooglePlaceCacheRecord | null> {
  const result = await db.query(
    `
      select
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
        last_fetched_at,
        updated_at,
        expires_at
      from parking_lot_google_place_snapshots
      where cache_key = $1
        and expires_at > now()
      order by updated_at desc
      limit 1
    `,
    [cacheKey],
  );

  if (result.rows.length === 0) return null;

  return mapRowToRecord(result.rows[0]);
}

async function saveRecord(record: ParkingGooglePlaceCacheRecord): Promise<ParkingGooglePlaceCacheRecord> {
  const client = await db.connect();

  try {
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
          last_fetched_at,
          updated_at,
          expires_at
        )
        values (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13::jsonb, $14,
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
      ],
    );

    await client.query('commit');
    return record;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
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
}): Promise<GoogleLegacyPlaceSearchResult | null> {
  const apiKey = getServerApiKey();
  if (!apiKey) return null;

  const airport = args.airportCode ? getAirportById(args.airportCode.toUpperCase()) : null;
  const queries = buildParkingSearchQueries(args);

  for (const query of queries) {
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
          'places.rating',
          'places.userRatingCount',
          'places.googleMapsUri',
          'places.types',
        ].join(','),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (!res.ok) {
      await logGooglePlacesError('places-new-search', res);
      continue;
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
        } satisfies GoogleLegacyPlaceSearchResult,
        score: scoreSearchResult(
          {
            place_id: place.id,
            name: place.displayName?.text,
            formatted_address: place.formattedAddress,
            rating: place.rating,
            user_ratings_total: place.userRatingCount,
            types: place.types,
          },
          args,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked[0] && ranked[0].score >= 10) {
      return ranked[0].result;
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
}): Promise<GoogleLegacyPlaceSearchResult | null> {
  const apiKey = getServerApiKey();
  if (!apiKey) return null;

  const newApiMatch = await searchGooglePlaceNew(args).catch(() => null);
  if (newApiMatch) return newApiMatch;

  const airport = args.airportCode ? getAirportById(args.airportCode.toUpperCase()) : null;
  const queries = buildParkingSearchQueries({
    lotName: args.lotName,
    lotAddress: args.lotAddress,
    airportCode: args.airportCode || null,
    airportContext: args.airportContext || airport?.label || airport?.destinationName || null,
  });

  for (const query of queries) {
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

async function fetchGooglePlaceDetails(placeId: string): Promise<GoogleLegacyPlaceDetailsResult | null> {
  const apiKey = getServerApiKey();
  if (!apiKey) return null;

  const newRes = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'id',
        'displayName',
        'formattedAddress',
        'rating',
        'userRatingCount',
        'googleMapsUri',
        'reviews',
      ].join(','),
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

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'name,rating,user_ratings_total,reviews,formatted_address,url',
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
  return (json?.result as GoogleLegacyPlaceDetailsResult | undefined) || null;
}

export async function resolveParkingGooglePlace(args: {
  airportCode?: string | null;
  parkingLotId?: string | number | null;
  lotName: string;
  lotAddress?: string | null;
  googlePlaceId?: string | null;
  airportContext?: string | null;
  provider?: string | null;
  source?: string | null;
}): Promise<ParkingGooglePlaceCacheRecord | null> {
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
  const freshCached = await getFreshCachedRecordByKey(cacheKey);

  if (freshCached) {
    return {
      ...freshCached,
      source: 'supabase-cache',
    };
  }

  const staleCached = await getCachedRecordByKey(cacheKey);

  const placeId = args.googlePlaceId || staleCached?.googlePlaceId || null;
  let details: GoogleLegacyPlaceDetailsResult | null = null;

  if (placeId) {
    details = await fetchGooglePlaceDetails(placeId).catch(() => null);
  } else {
    const matched = await searchGooglePlace({
      lotName: args.lotName,
      lotAddress: args.lotAddress,
      airportCode: args.airportCode,
      airportContext: args.airportContext,
      provider: args.provider,
      source: args.source,
    }).catch(() => null);

    if (!matched?.place_id) {
      if (staleCached) {
        return {
          ...staleCached,
          source: 'stale-fallback',
        };
      }

      return null;
    }

    details = await fetchGooglePlaceDetails(matched.place_id).catch(() => null);

    if (!details) {
      if (staleCached) {
        return {
          ...staleCached,
          source: 'stale-fallback',
        };
      }

      return null;
    }
  }

  if (!details?.place_id && !placeId) {
    return staleCached ? { ...staleCached, source: 'stale-fallback' } : null;
  }

  const reviews = (details?.reviews || []).slice(0, 5).map((review, index) =>
    toReview(review, index, details?.place_id || placeId || cacheKey),
  );

  const record: ParkingGooglePlaceCacheRecord = {
    cacheKey,
    parkingLotId: numericParkingLotId(args.parkingLotId),
    airportCode: String(args.airportCode || 'UNKNOWN').toUpperCase(),
    lotName: args.lotName,
    normalizedLotName: normalizeParkingLotName(args.lotName),
    lotAddress: args.lotAddress || undefined,
    googlePlaceId: details?.place_id || placeId || undefined,
    googlePlaceName: details?.name || undefined,
    googleFormattedAddress: details?.formatted_address || undefined,
    googleMapsUri: details?.url || undefined,
    rating: typeof details?.rating === 'number' ? details.rating : undefined,
    reviewCount: typeof details?.user_ratings_total === 'number' ? details.user_ratings_total : undefined,
    reviews,
    fetchedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    matchConfidence: placeId ? 'direct' : 'strong',
    source: 'google-places',
  };

  try {
    await saveRecord(record);
  } catch (error) {
    console.error('Failed to cache Google Places parking data', error);
  }

  return record;
}

export function parkingGooglePlaceToOptionUpdate(place: ParkingGooglePlaceCacheRecord): Partial<ParkingOption> {
  return {
    googlePlaceId: place.googlePlaceId,
    googleReviews: place.reviews,
    googleReviewsFetchedAt: place.fetchedAt,
    googleReviewsExpiresAt: place.expiresAt,
    googlePlaceName: place.googlePlaceName,
    googlePlaceAddress: place.googleFormattedAddress,
    reviewScore: typeof place.rating === 'number' ? place.rating : undefined,
    reviewCount: typeof place.reviewCount === 'number' ? place.reviewCount : undefined,
    normalizedAddress: place.googleFormattedAddress || undefined,
  };
}
