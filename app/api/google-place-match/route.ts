import { NextRequest, NextResponse } from 'next/server';
import {
  parkingGooglePlaceToOptionUpdate,
  resolveParkingGooglePlace,
} from '../../../lib/parking/googlePlacesCache';
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

export async function GET(req: NextRequest) {
  const body = Object.fromEntries(req.nextUrl.searchParams.entries());
  return handleRequest(body);
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);
  return handleRequest(body);
}

async function handleRequest(input: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[google-place-match server input]', input);
  }

  const name = toString(input.name);
  const airport = toString(input.airport) || toString(input.airportCode);
  const address = toString(input.address);
  const googlePlaceId = toString(input.googlePlaceId);
  const airportContext = toString(input.airportContext) || toString(input.destination);
  const provider = toString(input.provider);
  const source = toString(input.source);
  const parkingLotId = input.parkingLotId ?? input.providerLotId ?? input.parking_lot_id;

  if (!name) {
    return NextResponse.json({ place: null, source: 'missing-name' });
  }

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
      place: null,
      cacheKey: buildParkingGoogleCacheKey({
        airportCode: airport || null,
        parkingLotId: parkingLotId != null ? String(parkingLotId) : null,
        lotName: name,
        lotAddress: address,
      }),
      source: 'skipped-non-parking',
    };

    if (process.env.NODE_ENV !== 'production') {
      console.log('[google-place-match result]', result);
    }

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
  });

  const result = place
    ? {
        place: {
          googlePlaceId: place.googlePlaceId,
          name: place.googlePlaceName || place.lotName,
          rating: place.rating,
          reviewCount: place.reviewCount,
          address: place.googleFormattedAddress || place.lotAddress,
          reviews: place.reviews,
          fetchedAt: place.fetchedAt,
          expiresAt: place.expiresAt,
          source: place.source,
          matchConfidence: place.matchConfidence,
          ...parkingGooglePlaceToOptionUpdate(place),
        },
        cacheKey: place.cacheKey,
        source: place.source,
      }
    : {
        place: null,
        cacheKey: buildParkingGoogleCacheKey({
          airportCode: airport || null,
          parkingLotId: parkingLotId != null ? String(parkingLotId) : null,
          lotName: name,
          lotAddress: address,
        }),
        source: 'unavailable',
      };

  if (process.env.NODE_ENV !== 'production') {
    console.log('[google-place-match result]', result);
  }

  return NextResponse.json(result);
}
