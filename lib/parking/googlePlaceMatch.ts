import { ParkingOption, TripData } from '../types';
import {
  buildParkingGoogleCacheKey,
  shouldAttemptGooglePlaceMatch,
} from './googlePlaceMatchUtils';
import { mergeParkingRouteStatus, withStableParkingRouteStatus } from './routeStatus';

type MatchCacheEntry = ParkingOption;
type AttachGooglePlaceOptions = {
  force?: boolean;
};

const matchResultCache = new Map<string, MatchCacheEntry>();
const matchInFlightCache = new Map<string, Promise<MatchCacheEntry>>();

function getAirportCode(tripData: TripData | null, fallback?: string | null): string | null {
  return tripData?.airportCode || fallback || null;
}

function buildMatchKey(parking: ParkingOption, airportCode: string | null): string {
  return buildParkingGoogleCacheKey({
    airportCode,
    parkingLotId: parking.providerLotId || parking.id,
    lotName: parking.name,
    lotAddress: parking.address || parking.normalizedAddress || parking.routeDestination || null,
  });
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
    try {
      const res = await fetch('/api/google-place-match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        matchResultCache.set(cacheKey, withStableParkingRouteStatus(parking));
        return withStableParkingRouteStatus(parking);
      }

      const data = await res.json();

      const place = data.place || {};
      const placeId = place?.googlePlaceId || place?.placeId || data.placeId;

      if (!placeId) {
        if (!options.force) {
          matchResultCache.set(cacheKey, withStableParkingRouteStatus(parking));
        }
        return withStableParkingRouteStatus(parking);
      }

      const imageUrl =
        place?.imageUrl ||
        place?.photoUrl ||
        data.imageUrl ||
        data.photoUrl ||
        parking.imageUrl;

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
        images: imageUrl ? [imageUrl] : parking.images,
      }) as ParkingOption;

      matchResultCache.set(cacheKey, enriched);
      return enriched;
    } catch {
      if (!options.force) {
        matchResultCache.set(cacheKey, withStableParkingRouteStatus(parking));
      }
      return withStableParkingRouteStatus(parking);
    } finally {
      matchInFlightCache.delete(cacheKey);
    }
  })();

  matchInFlightCache.set(cacheKey, promise);
  return promise;
}
