import { ParkingOption, TripData } from '../types';
import {
  shouldAttemptGooglePlaceMatch,
} from './googlePlaceMatchUtils';
import { mergeParkingRouteStatus, withStableParkingRouteStatus } from './routeStatus';
import { shouldDiscoverParkingForTrip } from '../trip/tripContext';
import { logParkingPhotoReviewTrace } from './photoReviewDebug';
import { selectBestParkingPhotoFields } from './parkingLotPhotoShared';

type MatchCacheEntry = ParkingOption;
type AttachGooglePlaceOptions = {
  force?: boolean;
  includePhoto?: boolean;
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

function buildRequestBody(
  parking: ParkingOption,
  tripData: TripData | null,
  airportCode: string | null,
  options: { includePhoto: boolean },
) {
  return {
    name: parking.name,
    address: parking.address || parking.normalizedAddress || parking.routeDestination || null,
    airport: airportCode,
    destinationKind: tripData?.destinationKind ?? 'airport',
    parkingLotId: parking.providerLotId || parking.id || null,
    provider: parking.bookingProvider || null,
    source: parking.sourceName || null,
    googlePlaceId: parking.googlePlaceId || null,
    includePhoto: options.includePhoto,
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
  if (tripData && !shouldDiscoverParkingForTrip(tripData)) {
    return withStableParkingRouteStatus(parking);
  }

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

  if (
    !options.force &&
    parking.googlePlaceId &&
    parking.coordinateSource === 'google_place' &&
    typeof parking.canonicalLat === 'number' &&
    typeof parking.canonicalLng === 'number'
  ) {
    const enriched = withStableParkingRouteStatus(parking);
    matchResultCache.set(cacheKey, enriched);
    return enriched;
  }

  const inflight = matchInFlightCache.get(cacheKey);
  if (inflight && !options.force) return inflight;

  const cached = matchResultCache.get(cacheKey);
  if (cached && !options.force) return withStableParkingRouteStatus(cached);

  const body = buildRequestBody(parking, tripData, airportCode, {
    includePhoto: options.includePhoto ?? false,
  });

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
      const placeLat = typeof place.lat === 'number' ? place.lat : undefined;
      const placeLng = typeof place.lng === 'number' ? place.lng : undefined;

      const placeId =
        place?.googlePlaceId ||
        place?.placeId ||
        data.googlePlaceId ||
        data.placeId ||
        data.id;

      const responsePhotoFields = selectBestParkingPhotoFields(
        {
          imageUrl:
            place?.imageUrl ||
            place?.photoUrl ||
            data.imageUrl ||
            data.photoUrl ||
            data.photo ||
            null,
          images: [
            ...stringArray(place?.images),
            ...stringArray(data.images),
          ],
          photoSource: place?.photoSource ?? data.photoSource,
          photoAttribution: place?.photoAttribution ?? data.photoAttribution,
          photoAttributionUrl: place?.photoAttributionUrl ?? data.photoAttributionUrl,
          photoAttributions: stringArray(place?.photoAttributions).length
            ? stringArray(place?.photoAttributions)
            : stringArray(data.photoAttributions),
          requiresGoogleAttribution:
            typeof place?.requiresGoogleAttribution === 'boolean'
              ? place.requiresGoogleAttribution
              : typeof data.requiresGoogleAttribution === 'boolean'
                ? data.requiresGoogleAttribution
                : undefined,
        },
        parking,
      );
      const imageUrl = responsePhotoFields.imageUrl;
      const responseImages = responsePhotoFields.images ?? [];
      const googlePhotoNames = uniqueStrings([
        place.googlePhotoName,
        place.photoName,
        data.googlePhotoName,
        data.photoName,
        ...stringArray(place.googlePhotoNames),
        ...stringArray(place.photoNames),
        ...stringArray(data.googlePhotoNames),
        ...stringArray(data.photoNames),
        parking.googlePhotoName,
        ...(parking.googlePhotoNames || []),
      ]);

      if (!placeId) {
        const fallbackWithImage = imageUrl
          ? ({
            ...parking,
            ...responsePhotoFields,
          } as ParkingOption)
          : withStableParkingRouteStatus(parking);

        logParkingPhotoReviewTrace('after_client_google_place_attach', fallbackWithImage, {
          stageNote: 'Google place match response had no place id; keeping parking object with any returned image',
          apiReturnedPlaceId: false,
          apiReturnedGooglePhotoName: Boolean(googlePhotoNames.length),
          selectedVisualSource:
            fallbackWithImage.googlePhotoName || fallbackWithImage.googlePhotoNames?.length
              ? 'google photo'
              : fallbackWithImage.imageUrl || fallbackWithImage.images?.length
                ? 'provider image'
                : 'illustration',
          illustrationReason:
            fallbackWithImage.googlePhotoName || fallbackWithImage.googlePhotoNames?.length || fallbackWithImage.imageUrl || fallbackWithImage.images?.length
              ? null
              : 'google_place_match_response_had_no_metadata',
        });

        if (!options.force) {
          matchResultCache.set(cacheKey, withStableParkingRouteStatus(fallbackWithImage));
        }

        return withStableParkingRouteStatus(fallbackWithImage);
      }

      const enriched: ParkingOption = mergeParkingRouteStatus(parking, {
        ...parking,
        ...((typeof placeLat === 'number' && typeof placeLng === 'number')
          ? {
              canonicalLat: placeLat,
              canonicalLng: placeLng,
              canonicalAddress: place.formattedAddress ?? place.address ?? parking.canonicalAddress,
              coordinateSource: 'google_place' as const,
              lat: placeLat,
              lng: placeLng,
            }
          : {}),
        googlePlaceId: placeId,
        googleReviews: place.reviews ?? parking.googleReviews,
        googleReviewsFetchedAt: place.fetchedAt ?? parking.googleReviewsFetchedAt,
        googleReviewsExpiresAt: place.expiresAt ?? parking.googleReviewsExpiresAt,
        googlePlaceName: place.displayName ?? place.name ?? parking.googlePlaceName,
        googlePlaceAddress: place.formattedAddress ?? place.address ?? parking.googlePlaceAddress,
        googleMapsUri: place.googleMapsUri ?? parking.googleMapsUri,
        googlePhotoName: googlePhotoNames[0] ?? parking.googlePhotoName,
        googlePhotoNames: googlePhotoNames.length ? googlePhotoNames : parking.googlePhotoNames,
        photoSource: responsePhotoFields.photoSource ?? parking.photoSource,
        photoAttribution: responsePhotoFields.photoAttribution ?? parking.photoAttribution,
        photoAttributionUrl:
          responsePhotoFields.photoAttributionUrl ?? parking.photoAttributionUrl,
        photoAttributions: responsePhotoFields.photoAttributions ?? parking.photoAttributions,
        requiresGoogleAttribution:
          responsePhotoFields.requiresGoogleAttribution ?? parking.requiresGoogleAttribution,
        reviewScore: typeof place.rating === 'number' ? place.rating : parking.reviewScore,
        reviewCount:
          typeof place.userRatingCount === 'number'
            ? place.userRatingCount
            : typeof place.reviewCount === 'number'
              ? place.reviewCount
              : parking.reviewCount,
        normalizedAddress: place.formattedAddress ?? place.address ?? parking.normalizedAddress,
        address: place.formattedAddress ?? place.address ?? parking.address,
        ...responsePhotoFields,
      }) as ParkingOption;

      logParkingPhotoReviewTrace('after_client_google_place_attach', enriched, {
        stageNote: 'Google place match response merged into parking option',
        apiReturnedPlaceId: true,
        apiReturnedGooglePhotoName: Boolean(googlePhotoNames.length),
        selectedVisualSource:
          enriched.googlePhotoName || enriched.googlePhotoNames?.length
            ? 'google photo'
            : enriched.imageUrl || enriched.images?.length
              ? 'provider image'
              : 'illustration',
        illustrationReason:
          enriched.googlePhotoName || enriched.googlePhotoNames?.length || enriched.imageUrl || enriched.images?.length
            ? null
            : 'google_place_match_response_merged_without_photo_metadata',
      });

      matchResultCache.set(cacheKey, enriched);
      return enriched;
    } catch {
      logParkingPhotoReviewTrace('after_client_google_place_attach', parking, {
        stageNote: 'Google place match request failed; keeping original parking object',
        apiRequestFailed: true,
        selectedVisualSource:
          parking.googlePhotoName || parking.googlePhotoNames?.length
            ? 'google photo'
            : parking.imageUrl || parking.images?.length
              ? 'provider image'
              : 'illustration',
        illustrationReason:
          parking.googlePhotoName || parking.googlePhotoNames?.length || parking.imageUrl || parking.images?.length
            ? null
            : 'google_place_match_request_failed_and_original_has_no_photo_metadata',
      });
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
