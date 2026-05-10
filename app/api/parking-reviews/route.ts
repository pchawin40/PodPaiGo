import { NextRequest, NextResponse } from 'next/server';
import { resolveParkingGooglePlace } from '../../../lib/parking/googlePlacesCache';

function getString(value: FormDataEntryValue | string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId');
  const name = req.nextUrl.searchParams.get('name');
  const airport = req.nextUrl.searchParams.get('airport');
  const address = req.nextUrl.searchParams.get('address');

  if (!placeId && !name) {
    return NextResponse.json({
      reviews: [],
      source: 'missing-input',
    });
  }

  const place = await resolveParkingGooglePlace({
    airportCode: airport,
    lotName: name || placeId || 'Parking lot',
    lotAddress: address,
    googlePlaceId: placeId,
    airportContext: airport,
  });

  return NextResponse.json({
    reviews: place?.reviews ?? [],
    source: place?.source ?? 'unavailable',
    place: place
      ? {
          googlePlaceId: place.googlePlaceId,
          name: place.googlePlaceName || place.lotName,
          rating: place.rating,
          reviewCount: place.reviewCount,
          address: place.googleFormattedAddress || place.lotAddress,
        }
      : null,
  });
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);

  const placeId = getString(form?.get('placeId') ?? null);
  const name = getString(form?.get('name') ?? null);
  const airport = getString(form?.get('airport') ?? null);
  const address = getString(form?.get('address') ?? null);

  if (!placeId && !name) {
    return NextResponse.json({
      reviews: [],
      source: 'missing-input',
    });
  }

  const place = await resolveParkingGooglePlace({
    airportCode: airport,
    lotName: name || placeId || 'Parking lot',
    lotAddress: address,
    googlePlaceId: placeId,
    airportContext: airport,
  });

  return NextResponse.json({
    reviews: place?.reviews ?? [],
    source: place?.source ?? 'unavailable',
    place: place
      ? {
          googlePlaceId: place.googlePlaceId,
          name: place.googlePlaceName || place.lotName,
          rating: place.rating,
          reviewCount: place.reviewCount,
          address: place.googleFormattedAddress || place.lotAddress,
        }
      : null,
  });
}
