import { NextRequest, NextResponse } from 'next/server';
import {
  fetchGooglePlacePhotoName,
  googlePlacePhotoImageUrl,
  parkingGooglePlaceToOptionUpdate,
  resolveParkingGooglePlace,
} from '../../../lib/parking/googlePlacesCache';
import type { ParkingGooglePlaceCacheRecord } from '../../../lib/parking/googlePlacesCache';
import {
  buildParkingGoogleCacheKey,
  shouldAttemptGooglePlaceMatch,
} from '../../../lib/parking/googlePlaceMatchUtils';
import { TimeoutError, withTimeout } from '../../../lib/utils/asyncTimeout';

const GOOGLE_PLACE_MATCH_TIMEOUT_MS = Number(process.env.GOOGLE_PLACE_MATCH_TIMEOUT_MS || 2500);

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

function unavailableFields() {
  return {
    placeId: null,
    displayName: null,
    formattedAddress: null,
    rating: null,
    userRatingCount: null,
    photoUrl: null,
    imageUrl: null,
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

  const photoName = await fetchGooglePlacePhotoName(place.googlePlaceId).catch(() => null);
  return photoName ? { ...place, photoName } : place;
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
  const parkingLotId = input.parkingLotId ?? input.providerLotId ?? input.parking_lot_id;

  if (!name) {
    return NextResponse.json({ ...unavailableFields(), place: null, source: 'missing-name' });
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
    const result = {
      ...unavailableFields(),
      place: null,
      cacheKey,
      source: 'skipped-non-parking',
    };

    return NextResponse.json(result);
  }

  let placeWithPhoto: ParkingGooglePlaceCacheRecord | null = null;

  try {
    placeWithPhoto = await withTimeout(
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

        return place ? await withPhotoName(place) : null;
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
  const imageUrl = googlePlacePhotoImageUrl(placeWithPhoto?.photoName);
  const photoUrl = imageUrl;
  const placeId = placeWithPhoto?.googlePlaceId || null;
  const displayName = placeWithPhoto?.googlePlaceName || placeWithPhoto?.lotName || null;
  const formattedAddress =
    placeWithPhoto?.googleFormattedAddress || placeWithPhoto?.lotAddress || null;
  const rating = typeof placeWithPhoto?.rating === 'number' ? placeWithPhoto.rating : null;
  const userRatingCount =
    typeof placeWithPhoto?.reviewCount === 'number' ? placeWithPhoto.reviewCount : null;
  const googleMapsUri = placeWithPhoto?.googleMapsUri || null;

  const result = placeWithPhoto
    ? {
        placeId,
        displayName,
        formattedAddress,
        rating,
        userRatingCount,
        photoUrl,
        imageUrl,
        status: 'matched',
        place: {
          placeId,
          googlePlaceId: placeId,
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
        },
        cacheKey: placeWithPhoto.cacheKey,
        source: 'google-places',
      }
    : {
        ...unavailableFields(),
        place: null,
        cacheKey,
        source: 'unavailable',
      };

  return NextResponse.json(result);
}
