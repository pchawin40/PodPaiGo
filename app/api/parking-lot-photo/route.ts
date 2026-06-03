import { NextRequest, NextResponse } from 'next/server';
import { getBestParkingPhoto } from '../../../lib/parking/parkingLotPhotos';
import type { TripParkingContext } from '../../../lib/trip/tripContext';

function getString(value: string | null): string | null {
  if (!value?.trim()) return null;
  return value.trim();
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const tripContext = getString(params.get('tripContext'));
  const normalizedContext: TripParkingContext =
    tripContext === 'city_destination_trip' ? 'city_destination_trip' : 'airport_trip';

  const selection = await getBestParkingPhoto({
    parkingLotId: getString(params.get('parkingLotId')),
    provider: getString(params.get('provider')),
    providerLotId: getString(params.get('providerLotId')),
    googlePlaceId: getString(params.get('googlePlaceId')),
    airportCode: getString(params.get('airportCode')),
    googlePhotoName: getString(params.get('googlePhotoName')),
    lotName: getString(params.get('lotName')),
    lotType: getString(params.get('lotType')),
    tripContext: normalizedContext,
  });

  return NextResponse.json(selection);
}
