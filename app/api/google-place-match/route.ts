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

  const place = await resolveParkingGooglePlace({
    airportCode: airport || null,
    parkingLotId: parkingLotId != null ? String(parkingLotId) : null,
    lotName: name,
    lotAddress: address,
    googlePlaceId,
    airportContext,
    provider,
    source,
  }).catch(() => null);

  const placeWithPhoto = place ? await withPhotoName(place) : null;
  const imageUrl = googlePlacePhotoImageUrl(placeWithPhoto?.photoName);
  const photoUrl = imageUrl;

  const result = placeWithPhoto
    ? {
        placeId: placeWithPhoto.googlePlaceId || null,
        displayName: placeWithPhoto.googlePlaceName || placeWithPhoto.lotName || null,
        formattedAddress: placeWithPhoto.googleFormattedAddress || placeWithPhoto.lotAddress || null,
        rating: typeof placeWithPhoto.rating === 'number' ? placeWithPhoto.rating : null,
        userRatingCount: typeof placeWithPhoto.reviewCount === 'number' ? placeWithPhoto.reviewCount : null,
        photoUrl,
        imageUrl,
        status: imageUrl ? 'available' : 'unavailable',
        place: {
          placeId: placeWithPhoto.googlePlaceId,
          googlePlaceId: placeWithPhoto.googlePlaceId,
          name: placeWithPhoto.googlePlaceName || placeWithPhoto.lotName,
          displayName: placeWithPhoto.googlePlaceName || placeWithPhoto.lotName,
          googleMapsUri: placeWithPhoto.googleMapsUri,
          rating: placeWithPhoto.rating,
          reviewCount: placeWithPhoto.reviewCount,
          userRatingCount: placeWithPhoto.reviewCount,
          address: placeWithPhoto.googleFormattedAddress || placeWithPhoto.lotAddress,
          formattedAddress: placeWithPhoto.googleFormattedAddress || placeWithPhoto.lotAddress,
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
        source: placeWithPhoto.source,
      }
    : {
        ...unavailableFields(),
        place: null,
        cacheKey,
        source: 'unavailable',
      };

  return NextResponse.json(result);
}
