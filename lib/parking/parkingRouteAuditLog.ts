import type { ParkingOption, TrafficEstimate } from '../types';
import { debugLog } from '../utils/debug';

export type ParkingRouteToLotSource =
  | 'google_live'
  | 'google_cached'
  | 'mapbox'
  | 'fallback'
  | 'unavailable'
  | 'deferred_haversine';

function resolveParkingRouteToLotSource(
  estimate: TrafficEstimate | null | undefined,
  options?: { deferred?: boolean; cached?: boolean },
): ParkingRouteToLotSource {
  if (options?.deferred) return 'deferred_haversine';
  if (!estimate) return 'unavailable';
  if (estimate.routeUnavailable) return 'unavailable';

  const sourceName = estimate.sourceName || '';

  if (sourceName === 'Mapbox Directions') return 'mapbox';
  if (sourceName === 'Estimated from coordinates' || sourceName === 'Estimated route model') {
    return 'fallback';
  }
  if (sourceName.includes('Google Routes')) {
    return options?.cached ? 'google_cached' : 'google_live';
  }

  return estimate.trustStatus === 'live' ? 'google_live' : 'fallback';
}

export type ParkingRouteCoordinateAuditInput = {
  lotId: string;
  lotName: string;
  providerLat?: number | null;
  providerLng?: number | null;
  cachedLat?: number | null;
  cachedLng?: number | null;
  googleLat?: number | null;
  googleLng?: number | null;
  googlePlaceId?: string | null;
  coordinateSource?: string | null;
  routeDestinationUsed: string;
  routeDepartureTime: string;
  routeCacheKey: string;
  liveRouteCacheKey: string;
  liveRouteSelected: boolean;
};

export function logParkingRouteCoordinateAudit(input: ParkingRouteCoordinateAuditInput): void {
  debugLog('[Parking route coordinate audit]', {
    lotId: input.lotId,
    lotName: input.lotName,
    providerCoords:
      input.providerLat != null && input.providerLng != null
        ? { lat: input.providerLat, lng: input.providerLng }
        : null,
    cachedCoords:
      input.cachedLat != null && input.cachedLng != null
        ? { lat: input.cachedLat, lng: input.cachedLng }
        : null,
    googleCoords:
      input.googleLat != null && input.googleLng != null
        ? { lat: input.googleLat, lng: input.googleLng }
        : null,
    googlePlaceId: input.googlePlaceId ?? null,
    coordinateSource: input.coordinateSource ?? null,
    routeDestinationUsed: input.routeDestinationUsed,
    routeDepartureTime: input.routeDepartureTime,
    routeCacheKey: input.routeCacheKey,
    liveRouteCacheKey: input.liveRouteCacheKey,
    liveRouteSelected: input.liveRouteSelected,
  });
}

export type ParkingRouteToLotDebugInput = {
  lotName: string;
  lotAddress?: string | null;
  lotCoordinates?: { lat: number; lng: number } | null;
  originText?: string | null;
  originCoordinates?: { lat: number; lng: number } | null;
  routePurpose: string;
  cacheKey: string;
  liveRouteCacheKey?: string | null;
  source: ParkingRouteToLotSource;
  durationMinutes: number | null;
  distanceMeters?: number | null;
  departureTime: string;
  trafficAware?: boolean;
  routeToLot: boolean;
  routeToAirport?: boolean;
  cached: boolean;
  cacheKeyComponents?: Record<string, string | null>;
};

export function logParkingRouteToLot(input: ParkingRouteToLotDebugInput): void {
  debugLog('[Parking route-to-lot]', {
    lotName: input.lotName,
    lotAddress: input.lotAddress ?? null,
    lotCoordinates: input.lotCoordinates ?? null,
    originText: input.originText ?? null,
    originCoordinates: input.originCoordinates ?? null,
    routePurpose: input.routePurpose,
    cacheKey: input.cacheKey,
    liveRouteCacheKey: input.liveRouteCacheKey ?? null,
    source: input.source,
    durationMinutes: input.durationMinutes,
    distanceMeters: input.distanceMeters ?? null,
    departureTime: input.departureTime,
    trafficAware: input.trafficAware ?? null,
    routeToLot: input.routeToLot,
    routeToAirport: input.routeToAirport ?? false,
    cached: input.cached,
    cacheKeyComponents: input.cacheKeyComponents ?? null,
  });
}

export function parkingRouteAuditFromOption(
  option: ParkingOption,
  entry: {
    routeDestination: string;
    routeCacheKey: string;
    liveRouteCacheKey: string;
    destinationLatLng?: { lat: number; lng: number } | null;
  },
  routeDepartureTime: string,
  liveRouteSelected: boolean,
): ParkingRouteCoordinateAuditInput {
  return {
    lotId: String(option.id || option.name || 'unknown'),
    lotName: option.name,
    providerLat: option.providerLat,
    providerLng: option.providerLng,
    cachedLat: option.lat,
    cachedLng: option.lng,
    googleLat: option.canonicalLat ?? entry.destinationLatLng?.lat,
    googleLng: option.canonicalLng ?? entry.destinationLatLng?.lng,
    googlePlaceId: option.googlePlaceId,
    coordinateSource: option.coordinateSource,
    routeDestinationUsed: entry.routeDestination,
    routeDepartureTime,
    routeCacheKey: entry.routeCacheKey,
    liveRouteCacheKey: entry.liveRouteCacheKey,
    liveRouteSelected,
  };
}
