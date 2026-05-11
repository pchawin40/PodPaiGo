import { ParkingOption, TripData } from '../types';
import {
  buildParkingGoogleCacheKey,
  shouldAttemptGooglePlaceMatch,
} from './googlePlaceMatchUtils';

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
    matchResultCache.set(cacheKey, parking);
    return parking;
  }

  const inflight = matchInFlightCache.get(cacheKey);
  if (inflight) return inflight;

  const cached = matchResultCache.get(cacheKey);
  if (cached && !options.force) return cached;

  const body = buildRequestBody(parking, airportCode);

  if (process.env.NODE_ENV !== 'production') {
    console.log('[google-place-match client payload]', body);
  }

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
        matchResultCache.set(cacheKey, parking);
        return parking;
      }

      const data = await res.json();

      if (process.env.NODE_ENV !== 'production') {
        console.log('[google-place-match API response]', data);
      }

      const place = data.place;

      if (!place?.googlePlaceId) {
        if (!options.force) {
          matchResultCache.set(cacheKey, parking);
        }
        return parking;
      }

      const enriched: ParkingOption = {
        ...parking,
        googlePlaceId: place.googlePlaceId,
        googleReviews: place.reviews,
        googleReviewsFetchedAt: place.fetchedAt,
        googleReviewsExpiresAt: place.expiresAt,
        googlePlaceName: place.name ?? parking.googlePlaceName,
        googlePlaceAddress: place.address ?? parking.googlePlaceAddress,
        reviewScore: typeof place.rating === 'number' ? place.rating : parking.reviewScore,
        reviewCount: typeof place.reviewCount === 'number' ? place.reviewCount : parking.reviewCount,
        normalizedAddress: place.address ?? parking.normalizedAddress,
        address: place.address ?? parking.address,
      };

      if (process.env.NODE_ENV !== 'production') {
        console.log('[merge google place result into parking option]', {
          cacheKey,
          parkingId: parking.id,
          before: parking,
          place,
          after: enriched,
        });
      }

      matchResultCache.set(cacheKey, enriched);
      return enriched;
    } catch {
      if (!options.force) {
        matchResultCache.set(cacheKey, parking);
      }
      return parking;
    } finally {
      matchInFlightCache.delete(cacheKey);
    }
  })();

  matchInFlightCache.set(cacheKey, promise);
  return promise;
}
