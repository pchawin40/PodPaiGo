import { ParkingOption, TripData } from '../types';
import {
  shouldAttemptGooglePlaceMatch,
} from './googlePlaceMatchUtils';
import { mergeParkingRouteStatus, withStableParkingRouteStatus } from './routeStatus';

type MatchCacheEntry = ParkingOption;
type AttachGooglePlaceOptions = {
  force?: boolean;
};

const GOOGLE_PLACE_MATCH_CLIENT_TIMEOUT_MS = 2500;
const matchResultCache = new Map<string, MatchCacheEntry>();
const matchInFlightCache = new Map<string, Promise<MatchCacheEntry>>();

function getAirportCode(tripData: TripData | null, fallback?: string | null): string | null {
  return tripData?.airportCode || fallback || null;
}

function buildMatchKey(parking: ParkingOption, airportCode: string | null): string {
  const normalize = (value: string | null | undefined) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  return [
    String(airportCode || 'UNKNOWN').toUpperCase(),
    `name:${normalize(parking.name)}`,
    `addr:${normalize(parking.address || parking.normalizedAddress || parking.routeDestination)}`,
    `provider:${normalize(parking.bookingProvider)}`,
    `source:${normalize(parking.sourceName)}`,
  ].join('|');
}

function buildRequestBody(parking: ParkingOption, airportCode: string | null) {
  return {
    name: parking.name,
    address: parking.address || parking.normalizedAddress || parking.routeDestination || null,
    airport: airportCode,
    parkingLotId: parking.providerLotId || parking.id || null,
    provider: parking.bookingProvider || null,
    source: parking.sourceName || null,
    googlePlaceId: parking.googlePlaceId || null,
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export async function attachGooglePlaceToParking(
  parking: ParkingOption,
  tripData: TripData | null,
  airportCodeOverride?: string | null,
  options: AttachGooglePlaceOptions = {}
): Promise<ParkingOption> {
  const airportCode = getAirportCode(tripData, airportCodeOverride);
  const cacheKey = buildMatchKey(parking, airportCode);

  if (!shouldAttemptGooglePlaceMatch({
    lotName: parking.name,
    lotAddress: parking.address || parking.normalizedAddress || parking.routeDestination || null,
    provider: parking.bookingProvider || null,
    source: parking.sourceName || null,
    airportCode,
  })) {
    matchResultCache.set(cacheKey, withStableParkingRouteStatus(parking));
    return withStableParkingRouteStatus(parking);
  }

  const inflight = matchInFlightCache.get(cacheKey);
  if (inflight) return inflight;

  const cached = matchResultCache.get(cacheKey);
  if (cached && !options.force) return withStableParkingRouteStatus(cached);

  const body = buildRequestBody(parking, airportCode);

  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOOGLE_PLACE_MATCH_CLIENT_TIMEOUT_MS);

    try {
      const res = await fetch('/api/google-place-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        matchResultCache.set(cacheKey, withStableParkingRouteStatus(parking));
        return withStableParkingRouteStatus(parking);
      }

      const data = await res.json();

      const place = data.place || data || {};

      const placeId =
        place?.googlePlaceId ||
        place?.placeId ||
        data.googlePlaceId ||
        data.placeId ||
        data.id;

      const responseImages = uniqueStrings([
        place?.imageUrl ||
        place?.photoUrl ||
        data.imageUrl ||
        data.photoUrl ||
        data.photo ||
        null,
        ...stringArray(place?.images),
        ...stringArray(data.images),
        parking.imageUrl,
        ...(parking.images || []),
      ]);

      const imageUrl = responseImages[0];

      if (!placeId) {
        const fallbackWithImage = imageUrl
          ? ({
            ...parking,
            imageUrl,
            images: responseImages.length ? responseImages : [imageUrl],
          } as ParkingOption)
          : withStableParkingRouteStatus(parking);

        if (!options.force) {
          matchResultCache.set(cacheKey, withStableParkingRouteStatus(fallbackWithImage));
        }

        return withStableParkingRouteStatus(fallbackWithImage);
      }

      const enriched: ParkingOption = mergeParkingRouteStatus(parking, {
        ...parking,
        googlePlaceId: placeId,
        googleReviews: place.reviews ?? parking.googleReviews,
        googleReviewsFetchedAt: place.fetchedAt ?? parking.googleReviewsFetchedAt,
        googleReviewsExpiresAt: place.expiresAt ?? parking.googleReviewsExpiresAt,
        googlePlaceName: place.displayName ?? place.name ?? parking.googlePlaceName,
        googlePlaceAddress: place.formattedAddress ?? place.address ?? parking.googlePlaceAddress,
        googleMapsUri: place.googleMapsUri ?? parking.googleMapsUri,
        reviewScore: typeof place.rating === 'number' ? place.rating : parking.reviewScore,
        reviewCount:
          typeof place.userRatingCount === 'number'
            ? place.userRatingCount
            : typeof place.reviewCount === 'number'
              ? place.reviewCount
              : parking.reviewCount,
        normalizedAddress: place.formattedAddress ?? place.address ?? parking.normalizedAddress,
        address: place.formattedAddress ?? place.address ?? parking.address,
        imageUrl: imageUrl || undefined,
        images: imageUrl ? responseImages : parking.images,
      }) as ParkingOption;

      matchResultCache.set(cacheKey, enriched);
      return enriched;
    } catch {
      if (!options.force) {
        matchResultCache.set(cacheKey, withStableParkingRouteStatus(parking));
      }
      return withStableParkingRouteStatus(parking);
    } finally {
      clearTimeout(timeout);
      matchInFlightCache.delete(cacheKey);
    }
  })();

  matchInFlightCache.set(cacheKey, promise);
  return promise;
}
