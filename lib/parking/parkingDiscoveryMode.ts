import {
  isGoogleParkingDiscoveryLiveBlocked,
  isGooglePlacesLiveBlocked,
} from './googlePlacesGuard';
import { SHOWING_CACHED_PROVIDER_DATA_MESSAGE } from './googlePlacesSafeMode';

export const LIVE_PARKING_DISCOVERY_DISABLED_MESSAGE = `${SHOWING_CACHED_PROVIDER_DATA_MESSAGE} (live Google Places discovery disabled).`;

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
