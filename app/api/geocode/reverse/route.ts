import { NextRequest, NextResponse } from 'next/server';
import { getGoogleMapsServerApiKey } from '@/lib/env/googleMapsServerKey';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const apiKey = getGoogleMapsServerApiKey();

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 });
  }

  if (!apiKey) {
    return NextResponse.json({ error: 'Missing GOOGLE_MAPS_SERVER_API_KEY' }, { status: 500 });
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString(), { cache: 'no-store' });
  const data = await res.json();

  const formattedAddress = data?.results?.[0]?.formatted_address || null;

  return NextResponse.json({
    formattedAddress,
    status: data?.status,
  });
}