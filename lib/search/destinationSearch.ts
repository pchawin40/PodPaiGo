import { airportLookupService } from '../airports/lookupService';
import { detectAirportFromDestination } from '../trip/quickGo';
import type { SavedDestination } from '../trip/savedDestinations';
import { debugLog } from '../utils/debug';
import type {
  DestinationSearchCategory,
  DestinationSearchDeps,
  DestinationSearchOptions,
  DestinationSearchResult,
  GeocoderPrediction,
} from './destinationSearchTypes';

export type {
  DestinationSearchCategory,
  DestinationSearchDeps,
  DestinationSearchOptions,
  DestinationSearchResult,
  DestinationSearchSource,
  GeocoderPrediction,
} from './destinationSearchTypes';

const RETAIL_HINT_PATTERN =
  /\b(costco|safeway|walmart|target|fred meyer|qfc|whole foods|trader joe'?s?|home depot|lowe'?s?|grocer(?:y|ies)|supermarket)\b/i;
const GENERIC_LOCAL_DESTINATION_PATTERN =
  /\b(nearest\s+)?(grocery store|grocer(?:y|ies)|supermarket|safeway|costco|mall|shopping district|downtown shopping|downtown|pharmacy|coffee|coffee shop|restaurant|thai food|gym|park|store|retail|target|walmart|whole foods|trader joe'?s?)\b/i;

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isGenericLocalDestinationQuery(query: string): boolean {
  const normalized = normalizeQuery(query).toLowerCase();
  if (!normalized) return false;
  if (detectAirportFromDestination(normalized)) return false;
  return GENERIC_LOCAL_DESTINATION_PATTERN.test(normalized);
}

function dedupeResults(results: DestinationSearchResult[]): DestinationSearchResult[] {
  const seen = new Set<string>();
  const unique: DestinationSearchResult[] = [];

  for (const result of results) {
    const key = `${result.label}|${result.address}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(result);
  }

  return unique;
}

function inferCategory(label: string, address: string): DestinationSearchCategory {
  const combined = `${label} ${address}`.toLowerCase();
  if (RETAIL_HINT_PATTERN.test(combined)) return 'retail';
  return 'address';
}

function scoreTextMatch(text: string, query: string): number {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q) return 0;
  if (lower === q) return 200;
  if (lower.startsWith(q)) return 140;
  if (lower.includes(q)) return 90;
  return 0;
}

function searchSavedDestinations(
  query: string,
  savedDestinations: SavedDestination[],
): DestinationSearchResult[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  return savedDestinations
    .map((saved) => {
      const score = Math.max(
        scoreTextMatch(saved.label, normalizedQuery),
        scoreTextMatch(saved.destination, normalizedQuery),
      );
      return { saved, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ saved }) => ({
      id: `saved:${saved.id}`,
      label: saved.label,
      address: saved.destination,
      category: 'saved' as const,
      source: 'saved' as const,
      lat: saved.lat,
      lng: saved.lng,
      confidence: 'high' as const,
    }));
}

function searchRecentDestinations(
  query: string,
  recentDestinations: string[],
): DestinationSearchResult[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  return recentDestinations
    .map((recent) => ({ recent, score: scoreTextMatch(recent, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .map(({ recent }) => ({
      id: `recent:${recent}`,
      label: recent,
      address: recent,
      category: 'recent' as const,
      source: 'recent' as const,
      confidence: 'medium' as const,
    }));
}

function searchAirportDirectory(query: string): DestinationSearchResult[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const detectedAirport = detectAirportFromDestination(normalizedQuery);
  const detectedResult = detectedAirport
    ? [
        {
          id: `airport:${detectedAirport.id}`,
          label: detectedAirport.label,
          address: detectedAirport.routingAddress,
          category: 'airport' as const,
          source: 'airport' as const,
          lat: detectedAirport.geoLocation?.lat,
          lng: detectedAirport.geoLocation?.lng,
          confidence: 'high' as const,
          airportCode: detectedAirport.id,
        },
      ]
    : [];

  const catalogResults = airportLookupService.searchAirports(normalizedQuery, 5).map((airport) => ({
    id: `airport:${airport.id}`,
    label: airport.label,
    address: airport.routingAddress,
    category: 'airport' as const,
    source: 'airport' as const,
    lat: airport.geoLocation?.lat,
    lng: airport.geoLocation?.lng,
    confidence: 'high' as const,
    airportCode: airport.id,
  }));

  return dedupeResults([...detectedResult, ...catalogResults]);
}

function geocoderPredictionToResult(prediction: GeocoderPrediction): DestinationSearchResult {
  const label = prediction.description.trim();
  const category = inferCategory(label, label);

  return {
    id: `geocoder:${prediction.place_id}`,
    label,
    address: label,
    category,
    source: 'geocoder',
    placeId: prediction.place_id,
    confidence: category === 'retail' ? 'high' : 'medium',
  };
}

async function defaultFetchGeocoder(
  input: string,
  signal?: AbortSignal,
): Promise<GeocoderPrediction[]> {
  const response = await fetch(
    `/api/geocode/autocomplete?input=${encodeURIComponent(input)}`,
    { signal },
  );

  if (!response.ok) return [];

  const data = (await response.json()) as { predictions?: unknown };
  if (!Array.isArray(data.predictions)) return [];

  return data.predictions
    .map((value) => {
      if (!value || typeof value !== 'object') return null;
      const maybe = value as Partial<GeocoderPrediction>;
      const description =
        typeof maybe.description === 'string' ? maybe.description.trim() : '';
      const placeId =
        typeof maybe.place_id === 'string' ? maybe.place_id.trim() : description;
      if (!description) return null;
      return { description, place_id: placeId || description };
    })
    .filter((prediction): prediction is GeocoderPrediction => Boolean(prediction));
}

async function defaultFetchGooglePlaces(
  input: string,
  signal?: AbortSignal,
  locationBias?: { originLat?: number; originLng?: number; originSource?: string },
): Promise<DestinationSearchResult[]> {
  const params = new URLSearchParams({ input });
  if (typeof locationBias?.originLat === 'number' && typeof locationBias.originLng === 'number') {
    params.set('originLat', String(locationBias.originLat));
    params.set('originLng', String(locationBias.originLng));
    if (locationBias.originSource) params.set('originSource', locationBias.originSource);
  }

  const response = await fetch(
    `/api/search/destinations/places?${params.toString()}`,
    { signal },
  );

  if (!response.ok) return [];

  const data = (await response.json()) as { results?: DestinationSearchResult[] };
  return Array.isArray(data.results) ? data.results : [];
}

export function buildTypedDestinationFallback(query: string): DestinationSearchResult {
  const normalizedQuery = normalizeQuery(query);

  return {
    id: `typed:${normalizedQuery}`,
    label: normalizedQuery,
    address: normalizedQuery,
    category: inferCategory(normalizedQuery, normalizedQuery),
    source: 'typed',
    confidence: 'low',
  };
}

export async function searchDestinations(
  options: DestinationSearchOptions,
  deps: DestinationSearchDeps = {},
): Promise<DestinationSearchResult[]> {
  const query = normalizeQuery(options.query);
  const limit = options.limit ?? 8;
  const hasOriginBias =
    typeof options.originLat === 'number' &&
    Number.isFinite(options.originLat) &&
    typeof options.originLng === 'number' &&
    Number.isFinite(options.originLng);
  const genericLocalQuery = isGenericLocalDestinationQuery(query);

  if (query.length < 3) {
    return [];
  }

  const fetchGeocoder = deps.fetchGeocoder ?? defaultFetchGeocoder;
  const fetchGooglePlaces = deps.fetchGooglePlaces ?? defaultFetchGooglePlaces;

  const localResults = dedupeResults([
    ...searchSavedDestinations(query, options.savedDestinations ?? []),
    ...searchRecentDestinations(query, options.recentDestinations ?? []),
    ...searchAirportDirectory(query),
  ]);

  if (localResults.length >= limit) {
    return localResults.slice(0, limit);
  }

  let remoteResults: DestinationSearchResult[] = [];
  let geocoderPredictions: GeocoderPrediction[] = [];
  let googlePlacesCalled = false;
  let remoteRequestCount = 0;

  try {
    geocoderPredictions = await fetchGeocoder(query, options.signal);
    remoteRequestCount += 1;
    remoteResults = geocoderPredictions.map(geocoderPredictionToResult);
  } catch {
    geocoderPredictions = [];
    remoteResults = [];
  }

  let merged = dedupeResults([...localResults, ...remoteResults]);

  const shouldFetchGooglePlaces =
    (genericLocalQuery && hasOriginBias && merged.length < limit) ||
    (geocoderPredictions.length === 0 && merged.length < limit);

  if (shouldFetchGooglePlaces) {
    try {
      googlePlacesCalled = true;
      remoteRequestCount += 1;
      const googleResults = await fetchGooglePlaces(
        query,
        options.signal,
        genericLocalQuery && hasOriginBias
          ? {
              originLat: options.originLat,
              originLng: options.originLng,
              originSource: options.originSource,
            }
          : undefined,
      );
      merged = dedupeResults([...merged, ...googleResults]);
    } catch {
      // Ignore Google Places failures; geocoder and local providers may still be enough.
    }
  }

  debugLog('destination_search_summary', {
    query,
    localCount: localResults.length,
    geocoderCount: geocoderPredictions.length,
    mergedCount: merged.length,
    googlePlacesCalled,
    remoteRequestCount,
    genericLocalQuery,
    locationBiasUsed: genericLocalQuery && hasOriginBias,
  });

  return merged.slice(0, limit);
}

export function destinationSearchResultToSelection(result: DestinationSearchResult): {
  destination: string;
  destinationLabel: string;
  destinationAddress: string;
  destinationSource: DestinationSearchResult['source'];
  destinationLat?: number;
  destinationLng?: number;
  destinationPlaceId?: string;
  destinationConfidence: DestinationSearchResult['confidence'];
  detectedAirportCode?: string;
} {
  return {
    destination: result.address || result.label,
    destinationLabel: result.label,
    destinationAddress: result.address || result.label,
    destinationSource: result.source,
    destinationLat: result.lat,
    destinationLng: result.lng,
    destinationPlaceId: result.placeId,
    destinationConfidence: result.confidence,
    detectedAirportCode: result.airportCode,
  };
}

export function formatDestinationSearchSource(source: DestinationSearchResult['source']): string {
  switch (source) {
    case 'saved':
      return 'Saved destination';
    case 'recent':
      return 'Recent destination';
    case 'airport':
      return 'Airport directory';
    case 'geocoder':
      return 'Address lookup';
    case 'google':
      return 'Google Places';
    case 'typed':
      return 'Typed destination';
    default:
      return 'Unknown source';
  }
}

export function formatDestinationSearchCategory(
  category: DestinationSearchResult['category'],
): string {
  switch (category) {
    case 'saved':
      return 'Saved';
    case 'recent':
      return 'Recent';
    case 'airport':
      return 'Airport';
    case 'retail':
      return 'Retail / grocery';
    case 'address':
      return 'Address';
    default:
      return 'Destination';
  }
}
