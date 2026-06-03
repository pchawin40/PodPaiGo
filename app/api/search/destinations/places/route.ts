import { NextRequest, NextResponse } from 'next/server';
import { getGoogleMapsServerApiKey } from '@/lib/env/googleMapsServerKey';
import {
  canMakeLiveSearchTextCall,
  isGooglePlacesLiveBlocked,
} from '@/lib/parking/googlePlacesGuard';
import type { DestinationSearchResult } from '@/lib/search/destinationSearchTypes';

export const dynamic = 'force-dynamic';

const RESPONSE_HEADERS = {
  'Cache-Control': 'no-store',
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

function jsonResponse(body: Record<string, unknown>, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', RESPONSE_HEADERS['Cache-Control']);

  return NextResponse.json(body, {
    ...init,
    headers,
  });
}

function placeToResult(place: GooglePlace): DestinationSearchResult | null {
  const label = place.displayName?.text?.trim() || '';
  const address = place.formattedAddress?.trim() || label;
  if (!label && !address) return null;

  return {
    id: `google:${place.id || label}`,
    label: label || address,
    address,
    category: 'address',
    source: 'google',
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    confidence: 'medium',
  };
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('input')?.trim() || '';

  if (input.length < 3) {
    return jsonResponse({ results: [], status: 'INPUT_TOO_SHORT' });
  }

  if (isGooglePlacesLiveBlocked()) {
    return jsonResponse({ results: [], status: 'GOOGLE_PLACES_DISABLED' });
  }

  const apiKey = getGoogleMapsServerApiKey();
  if (!apiKey) {
    return jsonResponse({ results: [], status: 'MISSING_API_KEY' });
  }

  if (
    !canMakeLiveSearchTextCall(
      {
        reason: 'destination_search',
        route: '/api/search/destinations/places',
        airportCode: null,
        cacheKey: input,
      },
      { discovery: false },
    )
  ) {
    return jsonResponse({ results: [], status: 'REQUEST_BUDGET_EXCEEDED' });
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: input,
        regionCode: 'US',
        languageCode: 'en',
        maxResultCount: 5,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return jsonResponse({ results: [], status: 'GOOGLE_FAILED' });
    }

    const data = (await response.json()) as { places?: GooglePlace[] };
    const results = (data.places || [])
      .map(placeToResult)
      .filter((result): result is DestinationSearchResult => Boolean(result));

    return jsonResponse({
      results,
      status: results.length > 0 ? 'OK' : 'ZERO_RESULTS',
    });
  } catch {
    return jsonResponse({ results: [], status: 'ROUTE_FAILED' });
  }
}
