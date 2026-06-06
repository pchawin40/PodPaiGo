import type { ParkingOption } from '../../../../types';
import { DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES } from '../../../../access/parkAndRideAccess';
import { canMakeLiveSearchTextCall, isGoogleParkingDiscoveryLiveBlocked } from '../../../../parking/googlePlacesGuard';
import { getGoogleMapsServerApiKey } from '../../../../env/googleMapsServerKey';
import { getAirportById } from '../../../../airports/catalog';
import { resolveParkingPricing } from '../../../pricingResolver';
import { resolveDynamicParkingPrice } from '../../../dynamicParkingPricing';
import { withAvailabilityScore } from '../../shared/availability';
import { milesBetween } from '../../shared/geo';
import { googleMapsSearchUrl } from '../../shared/urls';
import { debugLog } from '../../../../utils/debug';

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  photos?: Array<{
    name?: string;
    widthPx?: number;
    heightPx?: number;
  }>;
};

type AirportSearchMetrics = {
  cacheHits: number;
  cacheMisses: number;
  searchTextCallsAttempted: number;
};

const airportSearchQueryCache = new Map<string, { ts: number; places: GooglePlace[] }>();
const airportSearchInFlight = new Map<string, Promise<GooglePlace[]>>();
const AIRPORT_SEARCH_QUERY_TTL_MS =
  Number(process.env.PLACES_SEARCH_QUERY_CACHE_TTL_HOURS || 24) * 60 * 60 * 1000;

function getMinParkingResultsToStop(): number {
  return Number(process.env.GOOGLE_PARKING_MIN_RESULTS_BEFORE_STOP || 5);
}

const UNRELATED_BUSINESS_PATTERNS = [
  'restaurant',
  'coffee',
  'cafe',
  'bar & grill',
  'bar and grill',
  'hotel front desk',
  'gas station',
  'fuel stop',
  'car wash',
  'auto repair',
  'grocery',
  'supermarket',
  'pharmacy',
  'bank',
  'atm',
  'church',
  'school',
  'daycare',
  'gym',
  'fitness center',
];

const PARKING_TRANSIT_NAME_PATTERNS = [
  'parking',
  'park and ride',
  'park & ride',
  'park-and-ride',
  'park n ride',
  'transit center',
  'transit centre',
  'link station',
  'light rail',
  'station parking',
  'northgate transit',
  'northgate station',
  'airport parking',
  'long term parking',
  'long-term parking',
  'shuttle parking',
  'hotel parking',
  'garage',
  ' parking lot',
  'parking garage',
  'airport shuttle',
  'airport garage',
  'terminal parking',
];

export function resetAirportSearchCacheForTests(): void {
  airportSearchQueryCache.clear();
  airportSearchInFlight.clear();
}

function roundCoord(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeTextQuery(textQuery: string): string {
  return textQuery.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildAirportSearchCacheKey(args: {
  airportCode: string;
  airportCoordinates: { lat: number; lng: number };
  radiusMeters: number;
  textQuery: string;
}): string {
  const lat = roundCoord(args.airportCoordinates.lat);
  const lng = roundCoord(args.airportCoordinates.lng);
  const query = normalizeTextQuery(args.textQuery);
  return `${args.airportCode.toUpperCase()}|${lat},${lng}|${args.radiusMeters}|${query}`;
}

function buildSearchQueryPlan(airportLabel: string): string[] {
  return [
    `airport parking near ${airportLabel}`,
    `off airport parking near ${airportLabel}`,
    `park and ride to ${airportLabel}`,
  ];
}

export function looksLikeParkingOrTransitName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  if (!normalized) return false;

  if (UNRELATED_BUSINESS_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return false;
  }

  if (PARKING_TRANSIT_NAME_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }

  if (normalized.includes('northgate')) return true;

  if (/\b(shuttle|garage|lot)\b/.test(normalized)) return true;

  if (normalized.includes('airport')) return true;

  if (
    normalized.includes('park') &&
    (normalized.includes('park and') ||
      normalized.includes('park &') ||
      normalized.includes('park n') ||
      normalized.includes('park,') ||
      normalized.includes(' park ') ||
      normalized.endsWith(' park'))
  ) {
    return true;
  }

  if (/\bstation\b/.test(normalized) && !normalized.includes('gas station')) {
    return true;
  }

  return false;
}

function isHighConfidenceParkingPlace(place: GooglePlace): boolean {
  const name = String(place.displayName?.text || '');
  if (!looksLikeParkingOrTransitName(name)) return false;

  const rating = typeof place.rating === 'number' ? place.rating : 0;
  const reviewCount = typeof place.userRatingCount === 'number' ? place.userRatingCount : 0;
  return rating >= 4 || reviewCount >= 20;
}

function filterRawGooglePlaces(
  places: GooglePlace[],
  airportCoordinates: { lat: number; lng: number },
  maxParkingDistanceMiles: number,
): { filtered: GooglePlace[]; droppedByName: number; droppedByGeo: number } {
  let droppedByName = 0;
  let droppedByGeo = 0;

  const filtered = places.filter((place) => {
    const name = String(place.displayName?.text || '');

    if (!looksLikeParkingOrTransitName(name)) {
      droppedByName += 1;
      return false;
    }

    const lat = place.location?.latitude;
    const lng = place.location?.longitude;

    if (typeof lat === 'number' && typeof lng === 'number') {
      const milesFromAirport = milesBetween(
        { lat: airportCoordinates.lat, lng: airportCoordinates.lng },
        { lat, lng },
      );

      if (milesFromAirport > maxParkingDistanceMiles) {
        droppedByGeo += 1;
        return false;
      }
    }

    return true;
  });

  return { filtered, droppedByName, droppedByGeo };
}

function hasEnoughParkingCandidates(
  places: GooglePlace[],
  airportCoordinates: { lat: number; lng: number },
  maxParkingDistanceMiles: number,
): boolean {
  const { filtered } = filterRawGooglePlaces(places, airportCoordinates, maxParkingDistanceMiles);

  if (filtered.length >= getMinParkingResultsToStop()) {
    return true;
  }

  const highConfidenceCount = filtered.filter(isHighConfidenceParkingPlace).length;
  return filtered.length >= 3 && highConfidenceCount >= 2;
}

function scoreGoogleParkingOption(p: ParkingOption): number {
  const reviewScore = p.reviewScore ?? 0;
  const reviewCount = p.reviewCount ?? 0;
  const transferMinutes = p.shuttleMinutes ?? p.walkingMinutes ?? p.transferToTerminalMinutes ?? 15;
  const estimatedPrice = p.price ?? 40;
  const availabilityScore = p.availabilityScore ?? p.availability ?? 50;

  return (
    reviewScore * 20 +
    Math.min(reviewCount / 100, 30) +
    availabilityScore * 0.15 -
    transferMinutes -
    estimatedPrice * 0.25
  );
}

function googlePhotoNames(
  photos: GooglePlace['photos'] | null | undefined,
  limit = 4,
): string[] {
  return Array.from(
    new Set(
      (photos ?? [])
        .map((photo) => photo.name?.trim() || '')
        .filter((name): name is string => Boolean(name)),
    ),
  ).slice(0, limit);
}

function resolveLotKeyFromName(name: string): string | null {
  const lower = name.toLowerCase();

  if (lower.includes('wally')) return 'wallypark';
  if (lower.includes('masterpark') || lower.includes('master park') || lower.includes('master')) return 'masterpark';
  if (lower.includes('doug fox') || lower.includes('doug')) return 'doug fox';
  if (lower.includes('park n jet') || lower.includes('park and jet') || lower.includes('parknjet')) return 'park n jet';
  if (lower.includes('ajax')) return 'ajax';
  if (lower.includes('jiffy')) return 'jiffy';
  if (lower.includes('mvp')) return 'mvp';
  if (lower.includes('extra car')) return 'extra car';
  if (lower.includes('shuttlepark') || lower.includes('shuttle park')) return 'shuttlepark';
  if (lower.includes('seatacpark') || lower.includes('seatac park')) return 'seatacpark';

  return null;
}

import { looksLikeParkAndRideTransitName } from '../../../../parking/parkAndRideClassification';

function dedupeGooglePlaces(places: GooglePlace[]): GooglePlace[] {
  const seen = new Set<string>();
  const unique: GooglePlace[] = [];

  for (const place of places) {
    const key = (place.id || place.displayName?.text || place.formattedAddress || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(place);
  }

  return unique;
}

function logGoogleParkingDiagnostics(stats: {
  airportCode: string;
  fetched: number;
  droppedByName: number;
  droppedByGeo: number;
  afterDedupe: number;
  returned: number;
}): void {
  if (process.env.NODE_ENV !== 'development') return;

  console.log('[google-parking]', stats);
}

async function fetchPlacesForQuery(args: {
  textQuery: string;
  airportCode: string;
  airportCoordinates: { lat: number; lng: number };
  parkingSearchRadiusMeters: number;
  apiKey: string;
  metrics: AirportSearchMetrics;
}): Promise<GooglePlace[]> {
  if (isGoogleParkingDiscoveryLiveBlocked()) return [];

  const cacheKey = buildAirportSearchCacheKey({
    airportCode: args.airportCode,
    airportCoordinates: args.airportCoordinates,
    radiusMeters: args.parkingSearchRadiusMeters,
    textQuery: args.textQuery,
  });

  const cached = airportSearchQueryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < AIRPORT_SEARCH_QUERY_TTL_MS) {
    args.metrics.cacheHits += 1;
    debugLog('airport_parking_search_cache_hit', {
      airportCode: args.airportCode,
      cacheKey,
      textQuery: args.textQuery,
    });
    return cached.places;
  }

  const inFlight = airportSearchInFlight.get(cacheKey);
  if (inFlight) {
    debugLog('airport_parking_search_inflight_hit', {
      airportCode: args.airportCode,
      cacheKey,
      textQuery: args.textQuery,
    });
    return inFlight;
  }

  args.metrics.cacheMisses += 1;

  const promise = (async () => {
    if (
      !canMakeLiveSearchTextCall(
        {
          reason: 'airport_parking_discovery',
          route: 'searchAirportGoogleParking',
          airportCode: args.airportCode,
          cacheKey,
        },
        { discovery: true },
      )
    ) {
      return [];
    }

    args.metrics.searchTextCallsAttempted += 1;
    debugLog('airport_parking_search_google_call', {
      airportCode: args.airportCode,
      cacheKey,
      textQuery: args.textQuery,
    });

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': args.apiKey,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.googleMapsUri',
          'places.rating',
          'places.userRatingCount',
          'places.businessStatus',
          'places.location',
          'places.photos',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: args.textQuery,
        locationBias: {
          circle: {
            center: {
              latitude: args.airportCoordinates.lat,
              longitude: args.airportCoordinates.lng,
            },
            radius: args.parkingSearchRadiusMeters,
          },
        },
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const places = Array.isArray(data.places) ? data.places : [];
    airportSearchQueryCache.set(cacheKey, { ts: Date.now(), places });
    return places;
  })();

  airportSearchInFlight.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    airportSearchInFlight.delete(cacheKey);
  }
}

export async function getGoogleParkingPlaces(args: {
  airportCode?: string;
  airportCoordinates?: { lat: number; lng: number };
  destination: string;
}): Promise<ParkingOption[]> {
  const key = getGoogleMapsServerApiKey();
  const airportCode = (args.airportCode || 'SEA').toUpperCase();
  const airport = getAirportById(airportCode);
  const airportCoordinates = args.airportCoordinates ?? airport?.geoLocation;
  const airportLabel = airport?.label ?? airportCode;
  const searchQueryPlan = buildSearchQueryPlan(airportLabel);

  const parkingSearchRadiusMeters = Number(
    process.env.PARKING_SEARCH_RADIUS_METERS || 50000,
  );

  const maxParkingDistanceMiles = Number(
    process.env.PARKING_MAX_DISTANCE_MILES || 25,
  );

  const maxReturnedOptions = Number(
    process.env.GOOGLE_PARKING_MAX_RESULTS || 50,
  );

  if (!key || !airportCoordinates) return [];

  const metrics: AirportSearchMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    searchTextCallsAttempted: 0,
  };

  const executedQueries: string[] = [];
  let fetchedPlaces: GooglePlace[] = [];

  for (const textQuery of searchQueryPlan) {
    executedQueries.push(textQuery);
    const places = await fetchPlacesForQuery({
      textQuery,
      airportCode,
      airportCoordinates,
      parkingSearchRadiusMeters,
      apiKey: key,
      metrics,
    });
    fetchedPlaces = dedupeGooglePlaces([...fetchedPlaces, ...places]);

    if (hasEnoughParkingCandidates(fetchedPlaces, airportCoordinates, maxParkingDistanceMiles)) {
      break;
    }
  }

  const dedupedPlaces = dedupeGooglePlaces(fetchedPlaces);

  let droppedByName = 0;
  let droppedByGeo = 0;

  const filteredPlaces = dedupedPlaces.filter((place: GooglePlace) => {
    const name = String(place.displayName?.text || '');

    if (!looksLikeParkingOrTransitName(name)) {
      droppedByName += 1;
      return false;
    }

    const lat = place.location?.latitude;
    const lng = place.location?.longitude;

    if (typeof lat === 'number' && typeof lng === 'number') {
      const milesFromAirport = milesBetween(
        { lat: airportCoordinates.lat, lng: airportCoordinates.lng },
        { lat, lng },
      );

      if (milesFromAirport > maxParkingDistanceMiles) {
        droppedByGeo += 1;
        return false;
      }
    }

    return true;
  });

  const mapped = await Promise.all(
    filteredPlaces.map(async (place: GooglePlace): Promise<ParkingOption> => {
        const rating = typeof place.rating === 'number' ? place.rating : undefined;
        const reviewCount = typeof place.userRatingCount === 'number' ? place.userRatingCount : undefined;
        const photoNames = googlePhotoNames(place.photos);

        const name = place.displayName?.text || `${airportCode} Parking`;
        const lowerName = name.toLowerCase();
        const isParkAndRide = looksLikeParkAndRideTransitName(name);

        const lotKey = resolveLotKeyFromName(name);

        const isOfficial =
          lowerName.includes(`${airportCode.toLowerCase()} parking garage`) ||
          lowerName.includes('terminal parking') ||
          lowerName.includes('official') ||
          lowerName.includes('airport garage');

        const staticPricing = resolveParkingPricing({
          airportCode,
          lotName: name,
          lotKind: isOfficial ? 'official' : isParkAndRide ? 'park-and-ride' : 'off-airport',
        });

        const dynamicPricing = lotKey
          ? await resolveDynamicParkingPrice(lotKey)
          : null;

        const isCovered =
          lowerName.includes('garage') ||
          lowerName.includes('covered') ||
          lowerName.includes('wally') ||
          lowerName.includes('masterpark');

        const hasDynamicPrice =
          typeof dynamicPricing?.price === 'number' && dynamicPricing.price > 0;
        const price = hasDynamicPrice ? dynamicPricing.price! : staticPricing.price;
        const priceMin = hasDynamicPrice ? undefined : staticPricing.priceMin;
        const priceMax = hasDynamicPrice ? undefined : staticPricing.priceMax;
        const priceDisplay = hasDynamicPrice ? dynamicPricing.priceDisplay : staticPricing.priceDisplay;
        const priceUnit = hasDynamicPrice ? dynamicPricing.priceUnit : staticPricing.priceUnit;
        const priceNote = hasDynamicPrice ? dynamicPricing.priceNote : staticPricing.priceNote;
        const priceConfidence = hasDynamicPrice ? dynamicPricing.priceConfidence : staticPricing.priceConfidence;

        const option: ParkingOption = {
          id: `${airportCode.toLowerCase()}-google-${place.id}`,
          name,
          serviceAirportCode: airportCode,
          type: isOfficial ? 'official' : isParkAndRide ? 'park-and-ride' : 'off-airport',
          price: price ?? staticPricing.price ?? 20,
          priceMin,
          priceMax,
          priceDisplay,
          priceUnit: priceUnit ?? undefined,
          priceNote,
          availabilityStatus: 'unknown',
          isAvailable: place.businessStatus !== 'CLOSED_PERMANENTLY',
          priceSource: dynamicPricing?.status === 'found' && hasDynamicPrice ? 'direct-lot-rate' : staticPricing.priceSource,
          priceConfidence,
          bookingProvider: staticPricing.bookingProvider,
          trustStatus: dynamicPricing?.status === 'found' ? 'verified-source' : 'estimated',
          sourceName: 'Google Places',
          searchQuery: executedQueries.join(' | '),
          distance: 10,
          availability: 50,
          routeUnavailable: false,
          sourceLink: place.googleMapsUri || googleMapsSearchUrl(name),
          mapLink: place.googleMapsUri || googleMapsSearchUrl(place.formattedAddress || name),
          googlePlaceId: place.id,
          googleMapsUri: place.googleMapsUri,
          googlePhotoName: photoNames[0],
          googlePhotoNames: photoNames.length ? photoNames : undefined,
          address: place.formattedAddress,
          imageUrl: undefined,
          images: undefined,
          lat: place.location?.latitude,
          lng: place.location?.longitude,
          normalizedAddress: place.formattedAddress,
          routeDestination: place.formattedAddress || name,
          lastUpdated: dynamicPricing?.lastChecked || new Date().toISOString(),
          parkingBufferMinutes: 15,
          transferToTerminalMinutes: isParkAndRide ? 45 : isOfficial ? 5 : 12,
          transferType: isParkAndRide ? 'transit' : isOfficial ? 'walk' : 'shuttle',
          assumptions: [
            'Live parking listing from Google Places.',
            place.rating
              ? `Google rating: ${place.rating} (${place.userRatingCount || 0} reviews)`
              : 'No Google rating available.',
            dynamicPricing?.status === 'found'
              ? 'Dynamic price found from configured source.'
              : dynamicPricing?.status === 'fallback'
                ? 'Using known baseline price because live crawler did not find a current price.'
                : 'Estimated nearby parking rate; confirm on provider.',
          ],
          walkingMinutes: isParkAndRide ? 8 : isOfficial ? 5 : 2,
          shuttleMinutes: isParkAndRide || isOfficial ? undefined : 12,
          covered: isCovered,
          reviewScore: rating,
          reviewCount,
          availabilityScore: 50,
          bestFor: [
            rating && rating >= 4.4 ? 'Best Reviews' : '',
            isCovered ? 'Best Weather' : '',
            isOfficial ? 'Closest Walk' : 'Compare Listed Deal',
            isParkAndRide ? 'Park & Ride' : '',
          ].filter(Boolean),
          parkAndRideRules: isParkAndRide ? DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES : undefined,
        };

        return withAvailabilityScore(option);
      }),
  );

  const returned = mapped
    .sort((a, b) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, maxReturnedOptions);

  const fallbackQueryCount = Math.max(0, executedQueries.length - 1);

  debugLog('[google-parking-search]', {
    airportCode,
    searchTextCallsAttempted: metrics.searchTextCallsAttempted,
    cacheHits: metrics.cacheHits,
    cacheMisses: metrics.cacheMisses,
    fallbackQueryCount,
    finalResultCount: returned.length,
  });

  logGoogleParkingDiagnostics({
    airportCode,
    fetched: fetchedPlaces.length,
    droppedByName,
    droppedByGeo,
    afterDedupe: dedupedPlaces.length,
    returned: returned.length,
  });

  return returned;
}
