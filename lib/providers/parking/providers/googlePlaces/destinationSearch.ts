import type { ParkingOption } from '../../../../types';
import { DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES } from '../../../../access/parkAndRideAccess';
import { looksLikeParkAndRideTransitName } from '../../../../parking/parkAndRideClassification';
import {
  mergeLiveCityParkWhizPricing,
  resolveCityParkingPricing,
} from '../../../../parking/cityParkingPricing';
import { findMatchingParkWhizOption } from '../../../../parking/parkWhizMatch';
import { canMakeLiveSearchTextCall, isGoogleParkingDiscoveryLiveBlocked } from '../../../../parking/googlePlacesGuard';
import { getGoogleMapsServerApiKey } from '../../../../env/googleMapsServerKey';
import { getParkWhizDestinationParkingOptions } from '../../../parkWhiz';
import { getCommunityFreeParkingOptions } from '../communityFree/provider';
import { dedupeParkingOptions } from '../../shared/dedupe';
import { withAvailabilityScore } from '../../shared/availability';
import { googleMapsSearchUrl } from '../../shared/urls';
import { debugLog } from '../../../../utils/debug';
import { validateParkingInventoryOption } from '../../../../parking/inventoryValidation';

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

type DestinationSearchMetrics = {
  cacheHits: number;
  cacheMisses: number;
  inFlightHits: number;
  searchTextCallsAttempted: number;
};

const destinationSearchQueryCache = new Map<string, { ts: number; places: GooglePlace[] }>();
const destinationSearchInFlight = new Map<string, Promise<GooglePlace[]>>();

function destinationSearchQueryTtlMs(): number {
  const hours = Number(process.env.PLACES_SEARCH_QUERY_CACHE_TTL_HOURS || 24);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

function minDestinationParkingResultsToStop(): number {
  const configured = Number(process.env.DESTINATION_PARKING_MIN_RESULTS_BEFORE_STOP || 5);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 5;
}

function roundCoord(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeTextQuery(textQuery: string): string {
  return textQuery.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildDestinationSearchQueryPlan(destination: string): string[] {
  return [
    `parking near ${destination}`,
    `parking garage near ${destination}`,
    `public parking near ${destination}`,
  ];
}

function resolveParkingRateTiming(args: {
  dateTime: string;
  checkInDate?: string;
  checkInAt?: string;
}): { arrivalDate?: string; arrivalTime?: string } {
  const checkInAtMatch = args.checkInAt?.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (checkInAtMatch) {
    return {
      arrivalDate: checkInAtMatch[1],
      arrivalTime: checkInAtMatch[2],
    };
  }

  const dateTimeMatch = args.dateTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (dateTimeMatch) {
    return {
      arrivalDate: args.checkInDate || dateTimeMatch[1],
      arrivalTime: dateTimeMatch[2],
    };
  }

  return {
    arrivalDate: args.checkInDate,
    arrivalTime: undefined,
  };
}

export function buildDestinationParkingSearchCacheKey(args: {
  destinationLat?: number;
  destinationLng?: number;
  radiusMeters: number;
  textQuery: string;
}): string {
  const lat = typeof args.destinationLat === 'number' ? roundCoord(args.destinationLat) : 'none';
  const lng = typeof args.destinationLng === 'number' ? roundCoord(args.destinationLng) : 'none';
  return `${lat},${lng}|${args.radiusMeters}|${normalizeTextQuery(args.textQuery)}`;
}

export function resetDestinationParkingSearchCacheForTests(): void {
  destinationSearchQueryCache.clear();
  destinationSearchInFlight.clear();
}

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

function isValidDestinationParkingPlace(place: GooglePlace): boolean {
  const name = String(place.displayName?.text || '').toLowerCase();
  const address = String(place.formattedAddress || '').toLowerCase();

  const looksLikeParking =
    name.includes('parking') ||
    name.includes('garage') ||
    name.includes('lot') ||
    address.includes('parking');

  if (!looksLikeParking) return false;
  if (place.businessStatus === 'CLOSED_PERMANENTLY') return false;

  return true;
}

function hasEnoughDestinationParkingCandidates(places: GooglePlace[]): boolean {
  return places.filter(isValidDestinationParkingPlace).length >= minDestinationParkingResultsToStop();
}

function destinationLocationBias(args: {
  destinationLat?: number;
  destinationLng?: number;
  searchRadiusMeters: number;
}): Record<string, unknown> | undefined {
  if (typeof args.destinationLat !== 'number' || typeof args.destinationLng !== 'number') {
    return undefined;
  }

  return {
    circle: {
      center: {
        latitude: args.destinationLat,
        longitude: args.destinationLng,
      },
      radius: args.searchRadiusMeters,
    },
  };
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

export function buildCuratedDestinationParkingHints(args: {
  destination: string;
  parkingDurationMinutes: number;
  arrivalDate?: string;
  arrivalTime?: string;
}): ParkingOption[] {
  const normalized = args.destination.toLowerCase();
  const isPikePlace =
    normalized.includes('pike place') ||
    normalized.includes('pike market');

  if (!isPikePlace) return [];

  const pricing = resolveCityParkingPricing({
    name: 'Pike Place Market Parking Garage',
    address: '1531 Western Ave, Seattle, WA 98101',
    durationMinutes: args.parkingDurationMinutes,
    covered: true,
    arrivalDate: args.arrivalDate,
    arrivalTime: args.arrivalTime,
  });

  return [
    withAvailabilityScore({
      id: 'official-pike-place-market-parking',
      name: 'Pike Place Market Parking Garage',
      address: '1531 Western Ave, Seattle, WA 98101',
      normalizedAddress: '1531 Western Ave, Seattle, WA 98101',
      routeDestination: '1531 Western Ave, Seattle, WA 98101',
      type: 'official',
      price: pricing.price,
      priceMin: pricing.priceMin,
      priceMax: pricing.priceMax,
      priceDisplay: pricing.priceDisplay,
      priceUnit: pricing.priceUnit,
      pricingConfidence: pricing.pricingConfidence,
      rateRules: pricing.rateRules,
      activeRate: pricing.activeRate,
      priceNote: `${pricing.priceNote} Provider controls final price.`,
      priceSource: pricing.priceSource,
      priceConfidence: pricing.priceConfidence,
      trustStatus: pricing.trustStatus,
      sourceName: 'Official parking info',
      sourceLink: 'https://www.pikeplacemarket.org/parking/',
      mapLink: googleMapsSearchUrl('Pike Place Market Parking Garage 1531 Western Ave Seattle WA'),
      availability: 50,
      availabilityStatus: 'unknown',
      isAvailable: true,
      distance: 8,
      parkingBufferMinutes: 8,
      transferToTerminalMinutes: 6,
      transferType: 'walk',
      covered: true,
      lastUpdated: new Date().toISOString(),
      assumptions: [
        'Curated official destination parking hint.',
        ...(pricing.assumptions || []),
        'No live scraping of the official website is performed at request time.',
      ],
      bestFor: ['Official parking info', 'Public garage', 'Destination parking'],
      providerSource: 'official-destination-hint',
      fetchedAt: new Date().toISOString(),
      priceFreshness: 'estimated',
    }),
  ];
}

async function fetchPlacesForDestinationQuery(args: {
  textQuery: string;
  searchRadiusMeters: number;
  destinationLat?: number;
  destinationLng?: number;
  apiKey: string;
  metrics: DestinationSearchMetrics;
}): Promise<GooglePlace[]> {
  if (isGoogleParkingDiscoveryLiveBlocked()) return [];

  const cacheKey = buildDestinationParkingSearchCacheKey({
    destinationLat: args.destinationLat,
    destinationLng: args.destinationLng,
    radiusMeters: args.searchRadiusMeters,
    textQuery: args.textQuery,
  });

  const cached = destinationSearchQueryCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < destinationSearchQueryTtlMs()) {
    args.metrics.cacheHits += 1;
    debugLog('destination_parking_search_cache_hit', { cacheKey, textQuery: args.textQuery });
    return cached.places;
  }

  const inFlight = destinationSearchInFlight.get(cacheKey);
  if (inFlight) {
    args.metrics.inFlightHits += 1;
    debugLog('destination_parking_search_inflight_hit', { cacheKey, textQuery: args.textQuery });
    return inFlight;
  }

  args.metrics.cacheMisses += 1;

  const promise = (async () => {
    if (
      !canMakeLiveSearchTextCall(
        {
          reason: 'destination_parking_discovery',
          route: 'getDestinationParkingOptions',
          airportCode: null,
          cacheKey,
        },
        { discovery: true },
      )
    ) {
      return [];
    }

    args.metrics.searchTextCallsAttempted += 1;
    debugLog('destination_parking_search_google_call', {
      textQuery: args.textQuery,
      cacheKey,
    });

    const body: Record<string, unknown> = {
      textQuery: args.textQuery,
    };
    const locationBias = destinationLocationBias({
      destinationLat: args.destinationLat,
      destinationLng: args.destinationLng,
      searchRadiusMeters: args.searchRadiusMeters,
    });
    if (locationBias) body.locationBias = locationBias;

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
      body: JSON.stringify(body),
    });

    if (!res.ok) return [];

    const data = (await res.json()) as { places?: GooglePlace[] };
    const places = Array.isArray(data.places) ? data.places : [];
    destinationSearchQueryCache.set(cacheKey, { ts: Date.now(), places });
    return places;
  })();

  destinationSearchInFlight.set(cacheKey, promise);

  try {
    return await promise;
  } finally {
    destinationSearchInFlight.delete(cacheKey);
  }
}

export async function getDestinationParkingOptions(args: {
  origin: string;
  destination: string;
  dateTime: string;
  parkingDurationMinutes?: number;
  destinationLat?: number;
  destinationLng?: number;
  checkInDate?: string;
  checkOutDate?: string;
  checkInAt?: string;
  checkOutAt?: string;
}): Promise<ParkingOption[]> {
  const key = getGoogleMapsServerApiKey();

  const searchRadiusMeters = Number(
    process.env.DESTINATION_PARKING_SEARCH_RADIUS_METERS || 2500,
  );

  const maxResults = Number(
    process.env.DESTINATION_PARKING_MAX_RESULTS || 20,
  );

  const searchQueryPlan = buildDestinationSearchQueryPlan(args.destination);
  const metrics: DestinationSearchMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    inFlightHits: 0,
    searchTextCallsAttempted: 0,
  };
  const executedQueries: string[] = [];
  let places: GooglePlace[] = [];

  if (key) {
    for (const textQuery of searchQueryPlan) {
      executedQueries.push(textQuery);
      const queryPlaces = await fetchPlacesForDestinationQuery({
        textQuery,
        searchRadiusMeters,
        destinationLat: args.destinationLat,
        destinationLng: args.destinationLng,
        apiKey: key,
        metrics,
      }).catch((error) => {
        debugLog('destination_parking_provider_failed', {
          provider: 'google',
          destination: args.destination,
          textQuery,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      });

      places = dedupeGooglePlaces([...places, ...queryPlaces]);

      if (hasEnoughDestinationParkingCandidates(places)) {
        break;
      }
    }
  } else {
    debugLog('destination_parking_provider_failed', {
      provider: 'google',
      destination: args.destination,
      error: 'missing_google_maps_server_api_key',
    });
  }

  const durationMinutes = Math.max(60, args.parkingDurationMinutes ?? 4 * 60);
  const rateTiming = resolveParkingRateTiming(args);

  const liveParkWhizOptions =
    typeof args.destinationLat === 'number' &&
    typeof args.destinationLng === 'number' &&
    args.checkInDate &&
    args.checkOutDate
      ? await getParkWhizDestinationParkingOptions({
          destination: args.destination,
          coordinates: { lat: args.destinationLat, lng: args.destinationLng },
          checkInDate: args.checkInDate,
          checkOutDate: args.checkOutDate,
          checkInAt: args.checkInAt,
          checkOutAt: args.checkOutAt,
        }).catch((error) => {
          debugLog('destination_parking_provider_failed', {
            provider: 'parkwhiz',
            destination: args.destination,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        })
      : [];

  const matchedLiveParkWhizIds = new Set<string>();
  const communityOptions =
    typeof args.destinationLat === 'number' &&
    typeof args.destinationLng === 'number'
      ? await getCommunityFreeParkingOptions({
          airportCode: 'GENERAL',
          destination: args.destination,
          destinationKind: 'general',
          destinationLat: args.destinationLat,
          destinationLng: args.destinationLng,
          dateTime: args.dateTime,
          parkingDurationMinutes: args.parkingDurationMinutes,
          checkInDate: args.checkInDate,
          checkOutDate: args.checkOutDate,
        }).catch((error) => {
          debugLog('destination_parking_provider_failed', {
            provider: 'community-free',
            destination: args.destination,
            error: error instanceof Error ? error.message : String(error),
          });
          return [];
        })
      : [];

  const mapped = places
    .filter(isValidDestinationParkingPlace)
    .slice(0, maxResults)
    .map((place: GooglePlace): ParkingOption => {
      const name = place.displayName?.text || 'Parking near destination';
      const lowerName = name.toLowerCase();

      const isGarage =
        lowerName.includes('garage') ||
        lowerName.includes('covered');

      const isParkAndRide = looksLikeParkAndRideTransitName(name);
      const walkToDestination = isParkAndRide ? 10 : 8;
      const pricing = resolveCityParkingPricing({
        name,
        address: place.formattedAddress,
        durationMinutes,
        covered: isGarage,
        arrivalDate: rateTiming.arrivalDate,
        arrivalTime: rateTiming.arrivalTime,
      });

      const routeDestination = place.formattedAddress || name;

      const rating =
        typeof place.rating === 'number' ? place.rating : undefined;

      const reviewCount =
        typeof place.userRatingCount === 'number'
          ? place.userRatingCount
          : undefined;

      let option: ParkingOption = {
        id: `destination-google-${place.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        name,
        type: isParkAndRide ? 'park-and-ride' : isGarage ? 'official' : 'off-airport',
        price: pricing.price,
        priceMin: pricing.priceMin,
        priceMax: pricing.priceMax,
        priceDisplay: pricing.priceDisplay,
        priceUnit: pricing.priceUnit,
        pricingConfidence: pricing.pricingConfidence,
        rateRules: pricing.rateRules,
        activeRate: pricing.activeRate,
        priceNote: pricing.priceNote,
        priceSource: pricing.priceSource,
        priceConfidence: pricing.priceConfidence,
        availabilityStatus: 'unknown',
        isAvailable: true,
        availability: 50,
        availabilityScore: 50,
        trustStatus: pricing.trustStatus ?? 'estimated',
        sourceName: pricing.priceSource === 'official-rate' ? 'Official rate card' : 'Estimated city parking',
        sourceLink: place.googleMapsUri || googleMapsSearchUrl(routeDestination),
        mapLink: googleMapsSearchUrl(routeDestination),
        googlePlaceId: place.id,
        googleMapsUri: place.googleMapsUri,
        address: place.formattedAddress,
        normalizedAddress: place.formattedAddress,
        imageUrl: undefined,
        images: undefined,
        lat: place.location?.latitude,
        lng: place.location?.longitude,
        routeDestination,
        routeUnavailable: false,
        distance: 10,
        parkingBufferMinutes: 8,
        transferToTerminalMinutes: isParkAndRide ? 25 : walkToDestination,
        transferType: isParkAndRide ? 'transit' : 'walk',
        walkingMinutes: undefined,
        shuttleMinutes: undefined,
        shuttleWaitMinutes: undefined,
        bufferRiskMinutes: undefined,
        covered: isGarage,
        reviewScore: rating,
        reviewCount,
        searchQuery: executedQueries.join(' | '),
        lastUpdated: new Date().toISOString(),
        assumptions: [
          'Discovered from Google Places near your destination.',
          ...(pricing.assumptions || []),
          isParkAndRide
            ? 'Park & Ride rules vary. Do not assume overnight parking unless verified.'
            : 'Walk time to your destination is estimated from the lot location.',
        ].filter(Boolean),
        bestFor: [
          rating && rating >= 4.4 ? 'Best Reviews' : '',
          isGarage ? 'Covered' : '',
          isParkAndRide ? 'Park & Ride' : 'City parking',
        ].filter(Boolean),
        providerSource: 'google',
        fetchedAt: new Date().toISOString(),
        priceFreshness: pricing.priceDisplay === 'live' ? 'live' : 'estimated',
        parkAndRideRules: isParkAndRide ? DEFAULT_UNKNOWN_PARK_AND_RIDE_RULES : undefined,
      };

      const liveMatch = findMatchingParkWhizOption(option, liveParkWhizOptions);
      if (liveMatch) {
        matchedLiveParkWhizIds.add(liveMatch.id);
        option = mergeLiveCityParkWhizPricing(option, liveMatch);
      }

      return withAvailabilityScore(option);
    });

  debugLog('destination_parking_search_summary', {
    destination: args.destination,
    searchTextCallsAttempted: metrics.searchTextCallsAttempted,
    cacheHits: metrics.cacheHits,
    cacheMisses: metrics.cacheMisses,
    inFlightHits: metrics.inFlightHits,
    fallbackQueryCount: Math.max(0, executedQueries.length - 1),
    finalGoogleResultCount: mapped.length,
  });

  const unmatchedLiveParkWhiz = liveParkWhizOptions
    .filter((live) => !matchedLiveParkWhizIds.has(live.id))
    .map((live) =>
      withAvailabilityScore({
        ...live,
        id: `destination-parkwhiz-${live.id}`,
        assumptions: [
          ...(live.assumptions || []),
          'Live ParkWhiz city quote discovered near your destination.',
        ],
      }),
    );

  const curatedHints = buildCuratedDestinationParkingHints({
    destination: args.destination,
    parkingDurationMinutes: durationMinutes,
    arrivalDate: rateTiming.arrivalDate,
    arrivalTime: rateTiming.arrivalTime,
  });

  const validatedOptions = [...communityOptions, ...curatedHints, ...mapped, ...unmatchedLiveParkWhiz].filter((option) => {
    const result = validateParkingInventoryOption(option);
    if (!result.valid) {
      debugLog('parking_inventory_filtered', {
        reason: result.reason,
        destination: args.destination,
        name: option.name,
        sourceName: option.sourceName,
        bookingProvider: option.bookingProvider,
        sourceLink: option.sourceLink,
      });
      return false;
    }
    return true;
  });

  const finalOptions = dedupeParkingOptions(validatedOptions)
    .sort((a, b) => scoreGoogleParkingOption(b) - scoreGoogleParkingOption(a))
    .slice(0, maxResults);

  debugLog('destination_parking_fetch_summary', {
    destination: args.destination,
    destinationLat: args.destinationLat,
    destinationLng: args.destinationLng,
    googleResultCount: mapped.length,
    parkWhizResultCount: liveParkWhizOptions.length,
    communityResultCount: communityOptions.length,
    finalResultCount: finalOptions.length,
    googleEnabled: Boolean(key),
  });

  return finalOptions;
}
