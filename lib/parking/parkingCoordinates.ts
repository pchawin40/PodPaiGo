import type { ParkingOption } from '../types';

export type ParkingCoordinateSource =
  | 'google_place'
  | 'provider'
  | 'geocoded_address'
  | 'haversine_fallback';

export function getParkingRouteCoordinates(
  option: Pick<ParkingOption, 'canonicalLat' | 'canonicalLng' | 'lat' | 'lng'>,
): { lat?: number; lng?: number } {
  if (typeof option.canonicalLat === 'number' && typeof option.canonicalLng === 'number') {
    return { lat: option.canonicalLat, lng: option.canonicalLng };
  }

  if (typeof option.lat === 'number' && typeof option.lng === 'number') {
    return { lat: option.lat, lng: option.lng };
  }

  return {};
}

export function applyCanonicalCoordinatesToOption(
  option: ParkingOption,
  update: Partial<ParkingOption>,
): ParkingOption {
  return {
    ...option,
    ...update,
  };
}

export function logParkingCoordinateDiagnostic(args: {
  lotName: string;
  providerLat?: number;
  providerLng?: number;
  googleLat?: number;
  googleLng?: number;
  coordinateSource?: ParkingCoordinateSource;
  routeMinutes?: number;
  mapsDestination?: string;
}): void {
  if (process.env.NODE_ENV !== 'development') return;

  console.log('[Parking coordinates]', args);
}
