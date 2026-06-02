import { bucketDepartureTime } from '../apiUsage/departureBucket';
import { normalizeRouteCachePart } from '../apiUsage/routeCacheKey';
import { getAirportById } from '../airports/catalog';
import { LiveTrafficProvider } from '../providers';
import type { TrafficEstimate } from '../types';

export type RouteLookaheadMode = 'depart_at' | 'arrive_by';
export type RouteLookaheadTravelMode = 'DRIVE';

export type RouteLookaheadRequest = {
  origin: string;
  destination: string;
  mode: RouteLookaheadMode;
  targetTime: string;
  travelMode?: RouteLookaheadTravelMode;
  destinationLatLng?: { lat: number; lng: number } | null;
  airportCode?: string | null;
};

export type RouteLookaheadResponse = {
  routeMinutes: number;
  trafficAwareMinutes: number;
  leaveAt: string;
  arriveAt: string;
  source: 'cache' | 'google-routes' | 'unavailable';
  confidence: 'high' | 'medium' | 'low';
  routeUnavailable?: boolean;
  routeUnavailableReason?: string;
};

export type RouteEstimateFetcher = (
  origin: string,
  destination: string,
  dateTime: string,
  destinationLatLng?: { lat: number; lng: number } | null,
  routeContext?: { airportCode?: string | null; lotId?: string | null },
) => Promise<TrafficEstimate>;

type CachedLookahead = {
  ts: number;
  response: RouteLookaheadResponse;
};

const LOOKAHEAD_CACHE = new Map<string, CachedLookahead>();
const LOOKAHEAD_IN_FLIGHT = new Map<string, Promise<RouteLookaheadResponse>>();

const DEFAULT_TRAFFIC_PROVIDER = new LiveTrafficProvider();
let trafficFetcherOverride: RouteEstimateFetcher | null = null;

function getTrafficFetcher(): RouteEstimateFetcher {
  if (trafficFetcherOverride) return trafficFetcherOverride;

  return (origin, destination, dateTime, destinationLatLng, routeContext) =>
    DEFAULT_TRAFFIC_PROVIDER.getTrafficEstimate(
      origin,
      destination,
      dateTime,
      destinationLatLng,
      routeContext,
    );
}

export function setRouteLookaheadFetcherForTests(fetcher: RouteEstimateFetcher | null): void {
  trafficFetcherOverride = fetcher;
}

export function clearRouteLookaheadCacheForTests(): void {
  LOOKAHEAD_CACHE.clear();
  LOOKAHEAD_IN_FLIGHT.clear();
  trafficFetcherOverride = null;
}

function getLookaheadCacheTtlMs(): number {
  return Number(process.env.LIVE_ROUTE_CACHE_TTL_MINUTES || 30) * 60 * 1000;
}

export function buildRouteLookaheadCacheKey(args: {
  origin: string;
  destination: string;
  mode: RouteLookaheadMode;
  targetTime: string;
  travelMode?: string;
  routeType?: string;
}): string {
  return [
    args.routeType || 'lookahead',
    args.travelMode || 'DRIVE',
    args.mode,
    bucketDepartureTime(args.targetTime),
    normalizeRouteCachePart(args.origin),
    normalizeRouteCachePart(args.destination),
  ].join('|');
}

export function computeDepartAtTiming(
  leaveAtIso: string,
  routeMinutes: number,
): { leaveAt: string; arriveAt: string } {
  const leaveAt = new Date(leaveAtIso);
  const arriveAt = new Date(leaveAt.getTime() + routeMinutes * 60 * 1000);

  return {
    leaveAt: leaveAt.toISOString(),
    arriveAt: arriveAt.toISOString(),
  };
}

export function computeArriveByTiming(
  arriveByIso: string,
  routeMinutes: number,
): { leaveAt: string; arriveAt: string } {
  const arriveAt = new Date(arriveByIso);
  const leaveAt = new Date(arriveAt.getTime() - routeMinutes * 60 * 1000);

  return {
    leaveAt: leaveAt.toISOString(),
    arriveAt: arriveAt.toISOString(),
  };
}

export function resolveLookaheadDestination(
  destination: string,
  airportCode?: string | null,
): { destination: string; destinationLatLng?: { lat: number; lng: number } } {
  const airport = airportCode ? getAirportById(airportCode.toUpperCase()) : null;

  if (airport) {
    return {
      destination: airport.routingAddress || airport.destinationName || destination,
      destinationLatLng: airport.geoLocation,
    };
  }

  return { destination };
}

function confidenceFromEstimate(
  estimate: TrafficEstimate,
  source: RouteLookaheadResponse['source'],
): RouteLookaheadResponse['confidence'] {
  if (estimate.routeUnavailable) return 'low';
  if (source === 'cache' || estimate.trustStatus === 'estimated') return 'medium';
  return 'high';
}

function buildLookaheadResponse(args: {
  estimate: TrafficEstimate;
  mode: RouteLookaheadMode;
  targetTime: string;
  source: RouteLookaheadResponse['source'];
}): RouteLookaheadResponse {
  const { estimate, mode, targetTime, source } = args;

  if (estimate.routeUnavailable || estimate.duration <= 0) {
    return {
      routeMinutes: 0,
      trafficAwareMinutes: 0,
      leaveAt: targetTime,
      arriveAt: targetTime,
      source: 'unavailable',
      confidence: 'low',
      routeUnavailable: true,
      routeUnavailableReason:
        estimate.routeUnavailableReason || 'Route timing unavailable for this scenario.',
    };
  }

  const timing =
    mode === 'depart_at'
      ? computeDepartAtTiming(targetTime, estimate.duration)
      : computeArriveByTiming(targetTime, estimate.duration);

  return {
    routeMinutes: estimate.duration,
    trafficAwareMinutes: estimate.duration,
    leaveAt: timing.leaveAt,
    arriveAt: timing.arriveAt,
    source,
    confidence: confidenceFromEstimate(estimate, source),
  };
}

async function fetchRouteEstimate(args: {
  origin: string;
  destination: string;
  departureTime: string;
  destinationLatLng?: { lat: number; lng: number } | null;
  airportCode?: string | null;
}): Promise<{ estimate: TrafficEstimate; source: 'cache' | 'google-routes' }> {
  const fetcher = getTrafficFetcher();
  const estimate = await fetcher(
    args.origin,
    args.destination,
    args.departureTime,
    args.destinationLatLng,
    { airportCode: args.airportCode ?? null, lotId: 'lookahead' },
  );

  const source: 'cache' | 'google-routes' =
    estimate.sourceName?.toLowerCase().includes('cached') ||
    estimate.trustStatus === 'estimated'
      ? 'cache'
      : 'google-routes';

  return { estimate, source };
}

async function resolveRouteLookaheadInternal(
  request: RouteLookaheadRequest,
): Promise<RouteLookaheadResponse> {
  const origin = request.origin.trim();
  const resolvedDestination = resolveLookaheadDestination(
    request.destination.trim(),
    request.airportCode,
  );
  const destination = resolvedDestination.destination.trim();
  const destinationLatLng = request.destinationLatLng ?? resolvedDestination.destinationLatLng;

  if (!origin || !destination) {
    return {
      routeMinutes: 0,
      trafficAwareMinutes: 0,
      leaveAt: request.targetTime,
      arriveAt: request.targetTime,
      source: 'unavailable',
      confidence: 'low',
      routeUnavailable: true,
      routeUnavailableReason: 'Origin and destination are required.',
    };
  }

  const cacheKey = buildRouteLookaheadCacheKey({
    origin,
    destination,
    mode: request.mode,
    targetTime: request.targetTime,
    travelMode: request.travelMode || 'DRIVE',
  });

  const cached = LOOKAHEAD_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < getLookaheadCacheTtlMs()) {
    return { ...cached.response, source: 'cache' };
  }

  if (request.mode === 'depart_at') {
    const { estimate, source } = await fetchRouteEstimate({
      origin,
      destination,
      departureTime: request.targetTime,
      destinationLatLng,
      airportCode: request.airportCode,
    });

    const response = buildLookaheadResponse({
      estimate,
      mode: request.mode,
      targetTime: request.targetTime,
      source,
    });

    if (!response.routeUnavailable) {
      LOOKAHEAD_CACHE.set(cacheKey, { ts: Date.now(), response });
    }

    return response;
  }

  const arriveTarget = new Date(request.targetTime);
  const initialDepart = new Date(arriveTarget.getTime() - 90 * 60 * 1000).toISOString();
  const initial = await fetchRouteEstimate({
    origin,
    destination,
    departureTime: initialDepart,
    destinationLatLng,
    airportCode: request.airportCode,
  });

  if (initial.estimate.routeUnavailable || initial.estimate.duration <= 0) {
    return buildLookaheadResponse({
      estimate: initial.estimate,
      mode: request.mode,
      targetTime: request.targetTime,
      source: initial.source,
    });
  }

  const refinedDepart = computeArriveByTiming(
    request.targetTime,
    initial.estimate.duration,
  ).leaveAt;

  const refined = await fetchRouteEstimate({
    origin,
    destination,
    departureTime: refinedDepart,
    destinationLatLng,
    airportCode: request.airportCode,
  });

  const response = buildLookaheadResponse({
    estimate: refined.estimate,
    mode: request.mode,
    targetTime: request.targetTime,
    source: refined.source,
  });

  if (!response.routeUnavailable) {
    LOOKAHEAD_CACHE.set(cacheKey, { ts: Date.now(), response });
  }

  return response;
}

export async function resolveRouteLookahead(
  request: RouteLookaheadRequest,
): Promise<RouteLookaheadResponse> {
  const origin = request.origin.trim();
  const destination = request.destination.trim();

  const cacheKey = buildRouteLookaheadCacheKey({
    origin,
    destination,
    mode: request.mode,
    targetTime: request.targetTime,
    travelMode: request.travelMode || 'DRIVE',
  });

  const cached = LOOKAHEAD_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < getLookaheadCacheTtlMs()) {
    return { ...cached.response, source: 'cache' };
  }

  const inFlight = LOOKAHEAD_IN_FLIGHT.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = resolveRouteLookaheadInternal(request).finally(() => {
    LOOKAHEAD_IN_FLIGHT.delete(cacheKey);
  });

  LOOKAHEAD_IN_FLIGHT.set(cacheKey, promise);
  return promise;
}
