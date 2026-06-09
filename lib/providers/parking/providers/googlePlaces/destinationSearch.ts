import type { ParkingDiscoveryMetadata, ParkingDiscoveryStatus, ParkingOption } from '../../../../types';
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
import { getParkingLotsNearPoint } from '../../../../parking/inventory';
import { inventoryLotToDestinationParkingOption } from '../../../../parking/inventoryToParkingOption';
import {
  inferParkingCategoryFromSignals,
  parseGoogleParkingOptionsSignals,
} from '../../../../parking/googleParkingOptionsSignals';
import { isEventVenueDestination } from '../../../../parking/eventVenueDetection';
import { haversineMiles } from '../../../../parking/routeMinutes';
import { geocodeDestinationForParking } from './destinationGeocode';

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
  parkingOptions?: {
    freeStreetParking?: boolean;
    paidStreetParking?: boolean;
    freeParkingLot?: boolean;
    paidParkingLot?: boolean;
    freeGarageParking?: boolean;
    paidGarageParking?: boolean;
    valetParking?: boolean;
  };
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
  liveBlocked: boolean;
  liveBlockReason: 'budget_limited' | 'quota_limited' | null;
  providerErrors: string[];
};

export type DestinationParkingSearchResult = {
  options: ParkingOption[];
  metadata: ParkingDiscoveryMetadata;
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

/**
 * Build the provider search queries, anchored to the most specific destination
 * available. For event/stadium destinations we use venue-specific phrasing so
 * the search stays near the venue instead of the broader city/downtown.
 */
function buildDestinationSearchQueryPlan(args: {
  destination: string;
  destinationName?: string;
  isEventVenue: boolean;
}): string[] {
  const venueAnchor = (args.destinationName?.trim() || args.destination || '').trim();
  const addressAnchor = (args.destination || '').trim();

  const queries: string[] = [];
  const push = (query: string) => {
    const trimmed = query.trim();
    if (
      trimmed &&
      !queries.some((existing) => normalizeTextQuery(existing) === normalizeTextQuery(trimmed))
    ) {
      queries.push(trimmed);
    }
  };

  if (args.isEventVenue && venueAnchor) {
    push(`event parking near ${venueAnchor}`);
    push(`parking near ${venueAnchor}`);
  } else if (venueAnchor) {
    push(`parking near ${venueAnchor}`);
    push(`parking garage near ${venueAnchor}`);
    push(`public parking near ${venueAnchor}`);
  }

  // Secondary anchor: the full destination address when it differs from the
  // venue name, so a specific name and its street address both contribute.
  if (addressAnchor && normalizeTextQuery(addressAnchor) !== normalizeTextQuery(venueAnchor)) {
    push(`parking near ${addressAnchor}`);
  }

  // Safety net so we never emit an empty plan.
  if (queries.length === 0) {
    push(`parking near ${args.destination}`);
  }

  return queries;
}

const WALK_SPEED_MPH = 3;

/**
 * Preferred walking radius from the destination. Lots within this are treated as
 * primary destination parking; beyond it (up to the hard max) they are kept only
 * as a labeled "farther backup".
 */
function preferredRadiusMiles(isEventVenue: boolean): number {
  return isEventVenue ? 1.0 : 0.75;
}

/** Hard maximum radius. Beyond this, non Park & Ride lots are excluded. */
function maxRadiusMiles(isEventVenue: boolean): number {
  return isEventVenue ? 2.0 : 1.5;
}

function destinationSearchRadiusMeters(isEventVenue: boolean): number {
  const envOverride = Number(process.env.DESTINATION_PARKING_SEARCH_RADIUS_METERS);
  if (Number.isFinite(envOverride) && envOverride > 0) return envOverride;
  // The API locationBias is only a soft hint used to gather candidates; the hard
  // anchoring happens in the per-lot distance classification (preferred / backup
  // / excluded). Event venues gather a little wider since reasonable event lots
  // sit slightly farther out.
  return isEventVenue ? 3200 : 2500;
}

function walkMinutesForDistanceMiles(distanceMiles: number): number {
  if (!Number.isFinite(distanceMiles) || distanceMiles <= 0) return 2;
  return Math.max(2, Math.round((distanceMiles / WALK_SPEED_MPH) * 60));
}

type LotDistanceDecision = 'within_preferred' | 'backup' | 'excluded';

function classifyLotDistance(args: {
  distanceMiles: number | null;
  isEventVenue: boolean;
  isParkAndRide: boolean;
}): LotDistanceDecision {
  // Park & Ride / transit-access lots are intentionally exempt from the
  // destination-radius rules; they are handled as a separate access strategy.
  if (args.isParkAndRide) return 'within_preferred';
  // No coordinates to measure against — keep the lot rather than guess.
  if (args.distanceMiles == null) return 'within_preferred';
  if (args.distanceMiles <= preferredRadiusMiles(args.isEventVenue)) return 'within_preferred';
  if (args.distanceMiles <= maxRadiusMiles(args.isEventVenue)) return 'backup';
  return 'excluded';
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
  const distancePenalty = typeof p.distance === 'number' && Number.isFinite(p.distance)
    ? p.distance * 25
    : 12;
  const transferPenalty = transferMinutes * 1.5;
  const backupPenalty = p.bestFor?.includes('Farther backup') ? 80 : 0;

  return (
    reviewScore * 20 +
    Math.min(reviewCount / 100, 30) +
    availabilityScore * 0.15 -
    transferPenalty -
    estimatedPrice * 0.25 -
    distancePenalty -
    backupPenalty
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
  if (isGoogleParkingDiscoveryLiveBlocked()) {
    args.metrics.liveBlocked = true;
    args.metrics.liveBlockReason = 'budget_limited';
    return [];
  }

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
      args.metrics.liveBlocked = true;
      args.metrics.liveBlockReason = 'budget_limited';
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
          'places.parkingOptions',
        ].join(','),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 429) {
        args.metrics.liveBlocked = true;
        args.metrics.liveBlockReason = 'quota_limited';
      } else {
        args.metrics.providerErrors.push(`google_search_${res.status}`);
      }
      return [];
    }

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

export async function getDestinationParkingOptionsWithMetadata(args: {
  origin: string;
  destination: string;
  destinationName?: string;
  destinationKind?: string;
  dateTime: string;
  parkingDurationMinutes?: number;
  destinationLat?: number;
  destinationLng?: number;
  checkInDate?: string;
  checkOutDate?: string;
  checkInAt?: string;
  checkOutAt?: string;
}): Promise<DestinationParkingSearchResult> {
  const key = getGoogleMapsServerApiKey();

  const isEventVenue =
    isEventVenueDestination({
      destination: args.destination,
      destinationKind: args.destinationKind,
      origin: args.origin,
    }) ||
    isEventVenueDestination({
      destination: args.destinationName,
      destinationKind: args.destinationKind,
      origin: args.origin,
    });

  // Fuzzy text-input city/event trips often arrive without destinationLat/Lng.
  // Geocode the venue/address once (server key, budget-guarded, independent of
  // any traffic provider) so every lot can be measured against a real anchor
  // instead of collapsing to an equal ~8-minute walk. Downstream reads of
  // args.destinationLat/Lng then transparently use the resolved coordinates.
  if (typeof args.destinationLat !== 'number' || typeof args.destinationLng !== 'number') {
    const geocodedDestination = await geocodeDestinationForParking({
      destination: args.destination,
      destinationName: args.destinationName,
    });
    if (geocodedDestination) {
      args = {
        ...args,
        destinationLat: geocodedDestination.lat,
        destinationLng: geocodedDestination.lng,
      };
    }
  }

  const searchRadiusMeters = destinationSearchRadiusMeters(isEventVenue);

  const configuredMaxResults = Number(
    process.env.DESTINATION_PARKING_MAX_RESULTS || 20,
  );
  const maxResults = isEventVenue
    ? Math.max(configuredMaxResults, 30)
    : configuredMaxResults;

  const searchQueryPlan = buildDestinationSearchQueryPlan({
    destination: args.destination,
    destinationName: args.destinationName,
    isEventVenue,
  });

  debugLog('destination_parking_discovery_anchor', {
    parkingDiscoveryDestinationText: args.destinationName?.trim() || args.destination,
    rawDestination: args.destination,
    destinationKind: args.destinationKind ?? null,
    parkingDiscoveryDestinationCoords:
      typeof args.destinationLat === 'number' && typeof args.destinationLng === 'number'
        ? { lat: args.destinationLat, lng: args.destinationLng }
        : null,
    eventVenue: isEventVenue,
    searchRadiusMeters,
    searchQueryPlan,
  });
  const metrics: DestinationSearchMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    inFlightHits: 0,
    searchTextCallsAttempted: 0,
    liveBlocked: false,
    liveBlockReason: null,
    providerErrors: [],
  };
  const executedQueries: string[] = [];
  let places: GooglePlace[] = [];
  const cachedInventoryLots =
    typeof args.destinationLat === 'number' &&
    typeof args.destinationLng === 'number'
      ? await getParkingLotsNearPoint({
          lat: args.destinationLat,
          lng: args.destinationLng,
          limit: maxResults,
          radiusMiles: searchRadiusMeters / 1609.34,
          destinationKind: 'general',
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          metrics.providerErrors.push(`supabase_cache:${message}`);
          debugLog('destination_parking_provider_failed', {
            provider: 'supabase-cache',
            destination: args.destination,
            error: message,
          });
          return [];
        })
      : [];

  const cachedInventoryOptions = cachedInventoryLots.map((lot) =>
    withAvailabilityScore(
      inventoryLotToDestinationParkingOption({
        lot,
        origin: args.origin,
        destination: args.destination,
      }),
    ),
  );

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
        const message = error instanceof Error ? error.message : String(error);
        metrics.providerErrors.push(`google:${message}`);
        debugLog('destination_parking_provider_failed', {
          provider: 'google',
          destination: args.destination,
          textQuery,
          error: message,
        });
        return [];
      });

      places = dedupeGooglePlaces([...places, ...queryPlaces]);

      if (metrics.liveBlocked || hasEnoughDestinationParkingCandidates(places)) {
        break;
      }
    }
  } else {
    metrics.providerErrors.push('google:missing_google_maps_server_api_key');
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
          destinationKind: args.destinationKind,
          isEventVenue,
          coordinates: { lat: args.destinationLat, lng: args.destinationLng },
          checkInDate: args.checkInDate,
          checkOutDate: args.checkOutDate,
          checkInAt: args.checkInAt,
          checkOutAt: args.checkOutAt,
        }).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          metrics.providerErrors.push(`parkwhiz:${message}`);
          debugLog('destination_parking_provider_failed', {
            provider: 'parkwhiz',
            destination: args.destination,
            error: message,
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
          const message = error instanceof Error ? error.message : String(error);
          metrics.providerErrors.push(`community-free:${message}`);
          debugLog('destination_parking_provider_failed', {
            provider: 'community-free',
            destination: args.destination,
            error: message,
          });
          return [];
        })
      : [];

  const googleCandidateLimit = isEventVenue
    ? Math.max(maxResults * 2, 60)
    : maxResults;
  const mappedWithDistance = places
    .filter(isValidDestinationParkingPlace)
    .slice(0, googleCandidateLimit)
    .map((place: GooglePlace) => {
      const name = place.displayName?.text || 'Parking near destination';
      const lowerName = name.toLowerCase();

      const isGarage =
        lowerName.includes('garage') ||
        lowerName.includes('covered');

      const isParkAndRide = looksLikeParkAndRideTransitName(name);

      // Anchor each lot to the resolved destination coordinates so far-away
      // downtown lots are measured, demoted, or excluded instead of all being
      // treated as an equal 8-minute walk. When no anchor is available (e.g.
      // geocoding unavailable) we leave distance/walk unset rather than invent a
      // uniform value that makes every lot look equally close.
      const placeLat = place.location?.latitude;
      const placeLng = place.location?.longitude;
      const distanceMiles =
        typeof args.destinationLat === 'number' &&
        typeof args.destinationLng === 'number' &&
        typeof placeLat === 'number' &&
        typeof placeLng === 'number'
          ? haversineMiles(args.destinationLat, args.destinationLng, placeLat, placeLng)
          : null;
      const decision = classifyLotDistance({ distanceMiles, isEventVenue, isParkAndRide });
      const isBackup = decision === 'backup';
      const distanceUnknown = !isParkAndRide && distanceMiles == null;
      const walkMinutes: number | undefined = isParkAndRide
        ? 25
        : distanceMiles != null
          ? walkMinutesForDistanceMiles(distanceMiles)
          : undefined;

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

      const googleParkingOptions = parseGoogleParkingOptionsSignals(place.parkingOptions);
      const parkingCategory = inferParkingCategoryFromSignals(googleParkingOptions);

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
        googleParkingOptions: googleParkingOptions ?? undefined,
        parkingCategory,
        address: place.formattedAddress,
        normalizedAddress: place.formattedAddress,
        imageUrl: undefined,
        images: undefined,
        lat: place.location?.latitude,
        lng: place.location?.longitude,
        routeDestination,
        routeUnavailable: false,
        distance: distanceMiles != null ? Number(distanceMiles.toFixed(2)) : undefined,
        parkingBufferMinutes: 8,
        transferToTerminalMinutes: walkMinutes,
        transferType: isParkAndRide ? 'transit' : 'walk',
        walkingMinutes: isParkAndRide ? undefined : walkMinutes,
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
          ...(googleParkingOptions?.freeParkingLot
            ? ['Google Places suggests free customer parking may be available — verify posted signs.']
            : []),
          ...(googleParkingOptions?.freeStreetParking
            ? ['Google Places suggests nearby street parking may exist — verify posted limits and rules.']
            : []),
          ...(pricing.assumptions || []),
          isParkAndRide
            ? 'Park & Ride rules vary. Do not assume overnight parking unless verified.'
            : distanceUnknown
              ? "We couldn't pinpoint your destination's location, so distance and walk time aren't estimated for this lot — verify before you go."
              : 'Walk time to your destination is estimated from the lot location.',
          ...(isBackup
            ? ['Farther from your destination — shown as a backup, not a primary option.']
            : []),
        ].filter(Boolean),
        bestFor: [
          rating && rating >= 4.4 ? 'Best Reviews' : '',
          isGarage ? 'Covered' : '',
          isBackup ? 'Farther backup' : isParkAndRide ? 'Park & Ride' : 'City parking',
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

      debugLog('destination_parking_lot_distance', {
        name,
        address: place.formattedAddress ?? null,
        coords:
          typeof placeLat === 'number' && typeof placeLng === 'number'
            ? { lat: placeLat, lng: placeLng }
            : null,
        distanceMiles: distanceMiles != null ? Number(distanceMiles.toFixed(3)) : null,
        decision,
        eventVenue: isEventVenue,
        isParkAndRide,
        included: decision !== 'excluded',
      });

      return { option: withAvailabilityScore(option), decision, distanceMiles };
    });

  const rankDecision = (decision: LotDistanceDecision) =>
    decision === 'within_preferred' ? 0 : 1;
  const mapped = mappedWithDistance
    .filter((entry) => entry.decision !== 'excluded')
    .sort((a, b) => {
      // Primary destination lots before farther backups, then nearest first.
      const rankDiff = rankDecision(a.decision) - rankDecision(b.decision);
      if (rankDiff !== 0) return rankDiff;
      return (a.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.distanceMiles ?? Number.POSITIVE_INFINITY);
    })
    .map((entry) => entry.option);
  const excludedFarCount = mappedWithDistance.length - mapped.length;

  debugLog('destination_parking_search_summary', {
    destination: args.destination,
    destinationName: args.destinationName ?? null,
    eventVenue: isEventVenue,
    cachedInventoryCount: cachedInventoryOptions.length,
    searchTextCallsAttempted: metrics.searchTextCallsAttempted,
    cacheHits: metrics.cacheHits,
    cacheMisses: metrics.cacheMisses,
    inFlightHits: metrics.inFlightHits,
    liveBlocked: metrics.liveBlocked,
    liveBlockReason: metrics.liveBlockReason,
    fallbackQueryCount: Math.max(0, executedQueries.length - 1),
    excludedFarCount,
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

  const validatedOptions = [
    ...cachedInventoryOptions,
    ...communityOptions,
    ...curatedHints,
    ...mapped,
    ...unmatchedLiveParkWhiz,
  ].filter((option) => {
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
  const liveCount = communityOptions.length + mapped.length + unmatchedLiveParkWhiz.length;
  const cachedCount = finalOptions.filter((option) => option.providerSource === 'destination-cache').length;
  const cachedCheckTimes = finalOptions
    .filter((option) => option.providerSource === 'destination-cache')
    .map((option) => option.fetchedAt || option.lastUpdated)
    .filter((value): value is string => Boolean(value))
    .sort();
  const latestCachedCheck = cachedCheckTimes[cachedCheckTimes.length - 1];
  const status: ParkingDiscoveryStatus =
    liveCount > 0
      ? 'live_refreshed'
      : cachedCount > 0
        ? metrics.liveBlockReason === 'quota_limited'
          ? 'cache_only_quota_limited'
          : metrics.liveBlocked
            ? 'cache_only_budget_limited'
            : metrics.providerErrors.length > 0
              ? 'provider_error'
              : 'cache_only_budget_limited'
        : metrics.liveBlockReason === 'quota_limited'
          ? 'cache_only_quota_limited'
          : metrics.providerErrors.length > 0 && !metrics.liveBlocked
            ? 'provider_error'
            : 'cache_empty';

  const finalOptionsWithStatus = finalOptions.map((option) =>
    option.providerSource === 'destination-cache'
      ? {
          ...option,
          parkingDiscoveryStatus: status,
          parkingDiscoveryMessage: 'Live availability not confirmed.',
        }
      : option,
  );
  const metadata: ParkingDiscoveryMetadata = {
    status,
    cachedCount,
    liveCount,
    providerErrors: metrics.providerErrors,
    liveRefreshPaused:
      status === 'cache_only_budget_limited' ||
      status === 'cache_only_quota_limited',
    lastChecked: latestCachedCheck,
    message:
      status === 'cache_only_budget_limited' || status === 'cache_only_quota_limited'
        ? 'Live parking refresh paused to control API cost. Showing saved parking options.'
        : status === 'cache_empty'
          ? 'No saved parking options found near this destination yet.'
          : status === 'provider_error'
            ? 'Parking provider refresh failed. Showing any saved parking options available.'
            : undefined,
  };

  debugLog('destination_parking_fetch_summary', {
    destination: args.destination,
    destinationLat: args.destinationLat,
    destinationLng: args.destinationLng,
    cachedInventoryCount: cachedInventoryOptions.length,
    googleResultCount: mapped.length,
    parkWhizResultCount: liveParkWhizOptions.length,
    communityResultCount: communityOptions.length,
    finalResultCount: finalOptionsWithStatus.length,
    googleEnabled: Boolean(key),
    discoveryStatus: status,
  });

  return {
    options: finalOptionsWithStatus,
    metadata,
  };
}

export async function getDestinationParkingOptions(args: {
  origin: string;
  destination: string;
  destinationName?: string;
  destinationKind?: string;
  dateTime: string;
  parkingDurationMinutes?: number;
  destinationLat?: number;
  destinationLng?: number;
  checkInDate?: string;
  checkOutDate?: string;
  checkInAt?: string;
  checkOutAt?: string;
}): Promise<ParkingOption[]> {
  const result = await getDestinationParkingOptionsWithMetadata(args);
  return result.options;
}
