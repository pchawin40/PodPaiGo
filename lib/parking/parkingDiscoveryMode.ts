import {
  isGoogleParkingDiscoveryLiveBlocked,
  isGooglePlacesLiveBlocked,
} from './googlePlacesGuard';

export const LIVE_PARKING_DISCOVERY_DISABLED_MESSAGE =
  'Live parking discovery is disabled. Showing cached/provider options only.';

export function isLiveGoogleParkingDiscoveryEnabled(): boolean {
  return !isGoogleParkingDiscoveryLiveBlocked();
}

export function isLiveGooglePlacesEnrichmentEnabled(): boolean {
  return !isGooglePlacesLiveBlocked();
}

export function getParkingDiscoveryNotice(): string | undefined {
  return isLiveGoogleParkingDiscoveryEnabled()
    ? undefined
    : LIVE_PARKING_DISCOVERY_DISABLED_MESSAGE;
}
