import { NextRequest, NextResponse } from 'next/server';
import {
  getBestParkingPhoto,
} from '../../../lib/parking/parkingLotPhotos';
import { isGooglePlacePhotosLiveBlocked, isGooglePlacesLiveBlocked } from '../../../lib/parking/googlePlacesGuard';
import { runWithPlacesRequestBudget } from '../../../lib/apiUsage/placesRequestBudget';
import {
  fetchGooglePlacePhotoName,
  parkingGooglePlaceToOptionUpdate,
  resolveParkingGooglePlace,
} from '../../../lib/parking/googlePlacesCache';
import type { ParkingGooglePlaceCacheRecord } from '../../../lib/parking/googlePlacesCache';
import {
  buildParkingGoogleCacheKey,
  shouldAttemptGooglePlaceMatch,
} from '../../../lib/parking/googlePlaceMatchUtils';
import { isPlaceholderParkingPhotoUrl } from '../../../lib/parking/parkingLotPhotoShared';
import { TimeoutError, withTimeout } from '../../../lib/utils/asyncTimeout';

const GOOGLE_PLACE_MATCH_TIMEOUT_MS = Number(process.env.GOOGLE_PLACE_MATCH_TIMEOUT_MS || 5000);

type PlaceMatchResult = {
  place: ParkingGooglePlaceCacheRecord;
  photoSelection: Awaited<ReturnType<typeof getBestParkingPhoto>>;
};

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function unavailableFields() {
  return {
    placeId: null,
    displayName: null,
    formattedAddress: null,
    rating: null,
    userRatingCount: null,
    photoUrl: null,
    imageUrl: null,
    images: [],
    photoAttributions: [],
    status: 'unavailable',
  };
}

function airportParkingContext(
  airportCode: string | null,
  fallbackContext: string | null
): string | null {
  const code = airportCode?.trim().toUpperCase();

  if (code === 'SEA') return 'SeaTac WA airport parking';
  if (code) return `${code} airport parking`;

  return fallbackContext;
}

async function withPhotoName(
  place: ParkingGooglePlaceCacheRecord
): Promise<ParkingGooglePlaceCacheRecord> {
  if (place.photoName || !place.googlePlaceId) return place;
  if (place.photoNames?.length) {
    return { ...place, photoName: place.photoNames[0] };
  }

  if (isGooglePlacePhotosLiveBlocked()) {
    return place;
  }

  const photoName = await fetchGooglePlacePhotoName(place.googlePlaceId).catch(() => null);
  return photoName ? { ...place, photoName } : place;
}

async function resolvePlacePhotoSelection(args: {
  place: ParkingGooglePlaceCacheRecord;
  name: string;
  airport: string | null;
  provider: string | null;
  parkingLotId: string | null;
  includeLivePhoto: boolean;
}): Promise<Awaited<ReturnType<typeof getBestParkingPhoto>>> {
  const placeWithPhoto = args.includeLivePhoto ? await withPhotoName(args.place) : args.place;

  return getBestParkingPhoto({
    parkingLotId: args.parkingLotId,
    provider: args.provider,
    providerLotId: args.parkingLotId,
    googlePlaceId: placeWithPhoto.googlePlaceId,
    airportCode: args.airport,
    googlePhotoName: args.includeLivePhoto
      ? placeWithPhoto.photoName || placeWithPhoto.photoNames?.[0] || null
      : null,
    lotName: args.name,
  });
}

export async function GET(req: NextRequest) {
  const body = Object.fromEntries(req.nextUrl.searchParams.entries());
  return handleRequest(body);
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  return handleRequest(body);
}

async function handleRequest(input: Record<string, unknown>) {
  const name = toString(input.name);
  const airport = toString(input.airport) || toString(input.airportCode);
  const address = toString(input.address);
  const googlePlaceId = toString(input.googlePlaceId);
  const airportContext = toString(input.airportContext) || toString(input.destination);
  const resolvedAirportContext = airportParkingContext(airport, airportContext);
  const provider = toString(input.provider);
  const source = toString(input.source);
  const includeLivePhoto = toBoolean(input.includePhoto);
  const parkingLotId = input.parkingLotId ?? input.providerLotId ?? input.parking_lot_id;

  if (!name) {
    return NextResponse.json({ ...unavailableFields(), place: null, source: 'missing-name' });
  }

  const lowerName = name.toLowerCase();

  if (
    lowerName.includes('spothero') ||
    lowerName.includes('way.com') ||
    lowerName.includes('cheapestairportparking')
  ) {
    return NextResponse.json({
      ...unavailableFields(),
      place: null,
      source: 'skipped-marketplace-wrapper',
    });
  }

  const cacheKey = buildParkingGoogleCacheKey({
    airportCode: airport || null,
    parkingLotId: parkingLotId != null ? String(parkingLotId) : null,
    lotName: name,
    lotAddress: address,
  });

  if (
    !shouldAttemptGooglePlaceMatch({
      lotName: name,
      lotAddress: address,
      provider,
      source,
      airportCode: airport,
    })
  ) {
    return NextResponse.json({
      ...unavailableFields(),
      place: null,
      cacheKey,
      source: 'skipped-non-parking',
    });
  }

  return runWithPlacesRequestBudget(`google-place-match:${cacheKey}`, async () => {
    let matchResult: PlaceMatchResult | null = null;

    try {
      matchResult = await withTimeout(
        (async () => {
          const place = await resolveParkingGooglePlace({
            airportCode: airport || null,
            parkingLotId: parkingLotId != null ? String(parkingLotId) : null,
            lotName: name,
            lotAddress: address,
            googlePlaceId,
            airportContext: resolvedAirportContext,
            provider,
            source,
          });

          if (!place) return null;

          const photoSelection = await resolvePlacePhotoSelection({
            place,
            name,
            airport: airport || null,
            provider,
            parkingLotId: parkingLotId != null ? String(parkingLotId) : null,
            includeLivePhoto,
          });

          return {
            place,
            photoSelection,
          };
        })(),
        GOOGLE_PLACE_MATCH_TIMEOUT_MS,
        'Google place match',
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        return NextResponse.json({
          ...unavailableFields(),
          status: 'timeout',
          place: null,
          cacheKey,
          source: 'timeout',
        });
      }

      console.error('google-place-match failed', error);

      return NextResponse.json(
        {
          ...unavailableFields(),
          status: 'error',
          place: null,
          cacheKey,
          source: 'error',
          message:
            process.env.NODE_ENV === 'development' && error instanceof Error
              ? error.message
              : 'Google place match failed',
          stack:
            process.env.NODE_ENV === 'development' && error instanceof Error
              ? error.stack
              : undefined,
        },
        { status: 500 },
      );
    }

    const placeWithPhoto = matchResult?.place ?? null;
    const photoSelection = matchResult?.photoSelection ?? null;

    const imageUrl =
      photoSelection?.source !== 'placeholder' &&
      !isPlaceholderParkingPhotoUrl(photoSelection?.imageUrl)
        ? photoSelection?.imageUrl ?? null
        : null;
    const photoUrl = imageUrl;
    const photoAttributions = photoSelection?.attribution ? [photoSelection.attribution] : [];
    const placeId = placeWithPhoto?.googlePlaceId || null;
    const displayName = placeWithPhoto?.googlePlaceName || placeWithPhoto?.lotName || null;
    const formattedAddress =
      placeWithPhoto?.googleFormattedAddress || placeWithPhoto?.lotAddress || null;
    const rating = typeof placeWithPhoto?.rating === 'number' ? placeWithPhoto.rating : null;
    const userRatingCount =
      typeof placeWithPhoto?.reviewCount === 'number' ? placeWithPhoto.reviewCount : null;
    const googleMapsUri = placeWithPhoto?.googleMapsUri || null;
    const lat = typeof placeWithPhoto?.lat === 'number' ? placeWithPhoto.lat : null;
    const lng = typeof placeWithPhoto?.lng === 'number' ? placeWithPhoto.lng : null;

    const result = placeWithPhoto
      ? {
        placeId,
        displayName,
        formattedAddress,
        lat,
        lng,
        coordinateSource: lat != null && lng != null ? 'google_place' : null,
        rating,
        userRatingCount,
        photoUrl,
        imageUrl,
        images: imageUrl ? [imageUrl] : [],
        photoAttributions,
        photoSource: photoSelection?.source,
        photoAttribution: photoSelection?.attribution ?? null,
        photoAttributionUrl: photoSelection?.attributionUrl ?? null,
        requiresGoogleAttribution: photoSelection?.requiresGoogleAttribution ?? false,
        status: 'matched',
        place: {
          placeId,
          googlePlaceId: placeId,
          lat,
          lng,
          coordinateSource: lat != null && lng != null ? 'google_place' : undefined,
          name: displayName,
          displayName,
          googleMapsUri,
          rating,
          reviewCount: userRatingCount,
          userRatingCount,
          address: formattedAddress,
          formattedAddress,
          reviews: placeWithPhoto.reviews,
          fetchedAt: placeWithPhoto.fetchedAt,
          expiresAt: placeWithPhoto.expiresAt,
          source: placeWithPhoto.source,
          matchConfidence: placeWithPhoto.matchConfidence,
          ...parkingGooglePlaceToOptionUpdate(placeWithPhoto),
          photoUrl,
          imageUrl,
          images: imageUrl ? [imageUrl] : [],
          photoAttributions,
          photoSource: photoSelection?.source,
          photoAttribution: photoSelection?.attribution ?? null,
          photoAttributionUrl: photoSelection?.attributionUrl ?? null,
          requiresGoogleAttribution: photoSelection?.requiresGoogleAttribution ?? false,
          status: 'matched',
        },
        cacheKey: placeWithPhoto.cacheKey,
        source: isGooglePlacesLiveBlocked() && placeWithPhoto.source !== 'google-places'
          ? placeWithPhoto.source
          : 'google-places',
      }
      : {
        ...unavailableFields(),
        place: null,
        cacheKey,
        source: 'unavailable',
      };

    return NextResponse.json(result);
  });
}
