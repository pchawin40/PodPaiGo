import { NextRequest, NextResponse } from 'next/server';
import { getGoogleMapsServerApiKey } from '@/lib/env/googleMapsServerKey';

export const dynamic = 'force-dynamic';

type Prediction = {
  description: string;
  place_id: string;
};

type GoogleAutocompletePrediction = {
  description?: string;
  place_id?: string;
};

type GoogleAutocompleteResponse = {
  status?: string;
  error_message?: string;
  predictions?: GoogleAutocompletePrediction[];
};

type GoogleTextSearchResult = {
  formatted_address?: string;
  name?: string;
  place_id?: string;
};

type GoogleTextSearchResponse = {
  status?: string;
  error_message?: string;
  results?: GoogleTextSearchResult[];
};

type GooglePredictionResult = {
  predictions: Prediction[];
  status: string;
  errorMessage: string | null;
  failed: boolean;
  httpStatus: number | null;
};

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

function dedupePredictions(predictions: Prediction[]): Prediction[] {
  const seen = new Set<string>();
  const unique: Prediction[] = [];

  for (const prediction of predictions) {
    const description = prediction.description.trim();
    const placeId = prediction.place_id.trim();
    const key = `${placeId || description}`.toLowerCase();

    if (!description || !key || seen.has(key)) continue;

    seen.add(key);
    unique.push({
      description,
      place_id: placeId || description,
    });
  }

  return unique.slice(0, 8);
}

function autocompletePredictions(data: GoogleAutocompleteResponse): Prediction[] {
  return dedupePredictions(
    (data.predictions || [])
      .map((prediction) => ({
        description: prediction.description || '',
        place_id: prediction.place_id || prediction.description || '',
      }))
      .filter((prediction) => prediction.description)
  );
}

function textSearchDescription(result: GoogleTextSearchResult): string {
  const name = (result.name || '').trim();
  const address = (result.formatted_address || '').trim();

  if (!name) return address;
  if (!address) return name;
  if (address.toLowerCase().startsWith(name.toLowerCase())) return address;

  return `${name}, ${address}`;
}

function textSearchPredictions(data: GoogleTextSearchResponse): Prediction[] {
  return dedupePredictions(
    (data.results || [])
      .map((result) => {
        const description = textSearchDescription(result);

        return {
          description,
          place_id: result.place_id || description,
        };
      })
      .filter((prediction) => prediction.description)
  );
}

function isExpectedEmptyStatus(status: string): boolean {
  return status === 'OK' || status === 'ZERO_RESULTS';
}

async function fetchGoogleJson<T>(url: URL): Promise<{
  data: T | null;
  errorMessage: string | null;
  httpStatus: number;
}> {
  const response = await fetch(url.toString(), { cache: 'no-store' });
  let data: T | null = null;

  try {
    data = (await response.json()) as T;
  } catch {
    data = null;
  }

  return {
    data,
    errorMessage: response.ok ? null : `Google returned HTTP ${response.status}`,
    httpStatus: response.status,
  };
}

async function fetchAutocomplete(input: string, apiKey: string): Promise<GooglePredictionResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
  url.searchParams.set('input', input);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('components', 'country:us');
  url.searchParams.set('language', 'en');

  const { data, errorMessage, httpStatus } = await fetchGoogleJson<GoogleAutocompleteResponse>(url);
  const status = data?.status || 'UNKNOWN_ERROR';
  const googleError = data?.error_message || errorMessage;
  const failed = Boolean(googleError) || !isExpectedEmptyStatus(status);

  return {
    predictions: status === 'OK' && data ? autocompletePredictions(data) : [],
    status,
    errorMessage: googleError || null,
    failed,
    httpStatus,
  };
}

async function fetchTextSearch(input: string, apiKey: string): Promise<GooglePredictionResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
  url.searchParams.set('query', input);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('region', 'us');
  url.searchParams.set('language', 'en');

  const { data, errorMessage, httpStatus } = await fetchGoogleJson<GoogleTextSearchResponse>(url);
  const status = data?.status || 'UNKNOWN_ERROR';
  const googleError = data?.error_message || errorMessage;
  const failed = Boolean(googleError) || !isExpectedEmptyStatus(status);

  return {
    predictions: status === 'OK' && data ? textSearchPredictions(data) : [],
    status,
    errorMessage: googleError || null,
    failed,
    httpStatus,
  };
}

function devDetails(result: GooglePredictionResult) {
  if (process.env.NODE_ENV !== 'development') return undefined;

  return {
    status: result.status,
    httpStatus: result.httpStatus,
    errorMessage: result.errorMessage,
  };
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('input')?.trim() || '';
  const apiKey = getGoogleMapsServerApiKey();

  if (input.length < 3) {
    return jsonResponse({ predictions: [], status: 'INPUT_TOO_SHORT' });
  }

  if (!apiKey) {
    console.warn('Google address autocomplete: missing GOOGLE_MAPS_SERVER_API_KEY');
    return jsonResponse({
      predictions: [],
      status: 'MISSING_API_KEY',
      error: 'Missing GOOGLE_MAPS_SERVER_API_KEY',
    });
  }

  try {
    const autocomplete = await fetchAutocomplete(input, apiKey);

    if (autocomplete.predictions.length > 0) {
      return jsonResponse({
        predictions: autocomplete.predictions,
        status: autocomplete.status,
        source: 'places-autocomplete',
      });
    }

    const textSearch = await fetchTextSearch(input, apiKey);

    if (textSearch.predictions.length > 0) {
      return jsonResponse({
        predictions: textSearch.predictions,
        status: textSearch.status,
        source: 'places-text-search',
      });
    }

    if (autocomplete.failed || textSearch.failed) {
      console.warn('Google address autocomplete failed', {
        input,
        autocomplete: devDetails(autocomplete) || autocomplete.status,
        textSearch: devDetails(textSearch) || textSearch.status,
      });

      return jsonResponse({
        predictions: [],
        status: textSearch.status || autocomplete.status || 'GOOGLE_FAILED',
        error: 'Google address autocomplete failed',
        autocomplete: devDetails(autocomplete),
        textSearch: devDetails(textSearch),
      });
    }

    return jsonResponse({
      predictions: [],
      status: textSearch.status || autocomplete.status || 'ZERO_RESULTS',
      source: 'none',
    });
  } catch (error) {
    console.warn('Google address autocomplete route failed', error);

    return jsonResponse({
      predictions: [],
      status: 'ROUTE_FAILED',
      error: 'Google address autocomplete route failed',
      message:
        process.env.NODE_ENV === 'development' && error instanceof Error
          ? error.message
          : undefined,
    });
  }
}
