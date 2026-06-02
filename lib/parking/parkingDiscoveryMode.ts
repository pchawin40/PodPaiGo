import {
  isGoogleParkingDiscoveryLiveBlocked,
  isGooglePlacesLiveBlocked,
} from './googlePlacesGuard';

export const LIVE_PARKING_DISCOVERY_DISABLED_MESSAGE =
  'Live parking discovery is disabled. Showing cached/provider parking options only.';

export const CACHED_PARKING_UNAVAILABLE_MESSAGE =
  'Cached parking options are unavailable for this airport right now.';

export function isLiveGoogleParkingDiscoveryEnabled(): boolean {
  return !isGoogleParkingDiscoveryLiveBlocked();
}

export function isLiveGooglePlacesEnrichmentEnabled(): boolean {
  return !isGooglePlacesLiveBlocked();
}

export function getParkingDiscoveryNotice(parkingCount = 0): string | undefined {
  if (isLiveGoogleParkingDiscoveryEnabled()) return undefined;

  return parkingCount > 0
    ? LIVE_PARKING_DISCOVERY_DISABLED_MESSAGE
    : CACHED_PARKING_UNAVAILABLE_MESSAGE;
}
