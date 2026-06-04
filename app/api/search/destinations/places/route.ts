import { NextRequest, NextResponse } from 'next/server';
import { dedupeDestinationPlacesRequest } from '@/lib/apiUsage/destinationSearchCache';
import { runWithPlacesRequestBudget } from '@/lib/apiUsage/placesRequestBudget';
import { getGoogleMapsServerApiKey } from '@/lib/env/googleMapsServerKey';
import {
  canMakeLiveSearchTextCall,
  isGooglePlacesLiveBlocked,
} from '@/lib/parking/googlePlacesGuard';
import { isGenericLocalDestinationQuery } from '@/lib/search/destinationSearch';
import type { DestinationSearchResult } from '@/lib/search/destinationSearchTypes';
import { debugLog } from '@/lib/utils/debug';

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

function normalizedCacheInput(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

function parseCoordinate(value: string | null, min: number, max: number): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function buildDestinationPlacesCacheKey(input: string, originLat: number | null, originLng: number | null): string {
  const normalized = normalizedCacheInput(input);
  if (
    originLat == null ||
    originLng == null ||
    !isGenericLocalDestinationQuery(normalized)
  ) {
    return normalized;
  }

  return `${normalized}|origin:${roundCoordinate(originLat)},${roundCoordinate(originLng)}`;
}

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
  const originLat = parseCoordinate(request.nextUrl.searchParams.get('originLat'), -90, 90);
  const originLng = parseCoordinate(request.nextUrl.searchParams.get('originLng'), -180, 180);
  const cacheKey = buildDestinationPlacesCacheKey(input, originLat, originLng);
  const useLocationBias =
    originLat != null &&
    originLng != null &&
    isGenericLocalDestinationQuery(input);

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

  try {
    const body = await dedupeDestinationPlacesRequest(cacheKey, async () => {
      return runWithPlacesRequestBudget(
        `destination-search:${cacheKey}`,
        async () => {
          if (
            !canMakeLiveSearchTextCall(
              {
                reason: 'destination_search',
                route: '/api/search/destinations/places',
                airportCode: null,
                cacheKey,
              },
              { discovery: false },
            )
          ) {
            return { results: [], status: 'REQUEST_BUDGET_EXCEEDED' };
          }

          debugLog('destination_search_google_call', {
            endpoint: 'places-search-text-new',
            query: input,
            locationBiasUsed: useLocationBias,
          });

          const requestBody: Record<string, unknown> = {
            textQuery: input,
            regionCode: 'US',
            languageCode: 'en',
            maxResultCount: 5,
          };

          if (useLocationBias) {
            requestBody.locationBias = {
              circle: {
                center: {
                  latitude: originLat,
                  longitude: originLng,
                },
                radius: 20000,
              },
            };
          }

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
            body: JSON.stringify(requestBody),
            cache: 'no-store',
          });

          if (!response.ok) {
            return { results: [], status: 'GOOGLE_FAILED' };
          }

          const data = (await response.json()) as { places?: GooglePlace[] };
          const results = (data.places || [])
            .map(placeToResult)
            .filter((result): result is DestinationSearchResult => Boolean(result));

          debugLog('destination_search_places_summary', {
            query: input,
            cacheKey,
            googleCallCount: 1,
            resultCount: results.length,
            locationBiasUsed: useLocationBias,
          });

          return {
            results,
            status: results.length > 0 ? 'OK' : 'ZERO_RESULTS',
          };
        },
        { route: '/api/search/destinations/places' },
      );
    });

    return jsonResponse(body);
  } catch {
    return jsonResponse({ results: [], status: 'ROUTE_FAILED' });
  }
}
