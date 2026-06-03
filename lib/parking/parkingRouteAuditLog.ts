import type { ParkingOption } from '../types';
import { debugLog } from '../utils/debug';

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
