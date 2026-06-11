import { NextRequest, NextResponse } from 'next/server';
import { getGoogleMapsServerApiKey } from '@/lib/env/googleMapsServerKey';
import { isGooglePlacesLiveBlocked } from '@/lib/parking/googlePlacesGuard';
import { resolveGooglePlaceCoordinates } from '@/lib/parking/googlePlacesCache';

export const dynamic = 'force-dynamic';

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
};

function jsonResponse(body: Record<string, unknown>, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', RESPONSE_HEADERS['Cache-Control']);

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

/**
 * Resolve a Google place_id to coordinates so destinations selected from an
 * autocomplete prediction (place_id only, no lat/lng) can carry a confirmed
 * location into the trip. Budget/kill-switch/key handling lives inside
 * resolveGooglePlaceCoordinates via the shared getPlace guard.
 */
export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get('placeId')?.trim() || '';

  if (!placeId) {
    return jsonResponse({ location: null, status: 'MISSING_PLACE_ID' });
  }

  if (isGooglePlacesLiveBlocked()) {
    return jsonResponse({ location: null, status: 'GOOGLE_PLACES_DISABLED' });
  }

  if (!getGoogleMapsServerApiKey()) {
    return jsonResponse({ location: null, status: 'MISSING_API_KEY' });
  }

  try {
    const location = await resolveGooglePlaceCoordinates(placeId, {
      reason: 'destination_place_resolve',
    });

    if (!location) {
      return jsonResponse({ location: null, status: 'NOT_FOUND' });
    }

    return jsonResponse({ location, status: 'OK' });
  } catch {
    return jsonResponse({ location: null, status: 'ROUTE_FAILED' });
  }
}
