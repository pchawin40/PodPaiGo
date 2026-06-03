import {
  getActivePlacesRequestBudget,
  recordPlacesRequestBlocked,
  tryConsumePlacesRequestCall,
  tryConsumePlacesReviewCall,
  type GooglePlacesEndpoint,
} from '../apiUsage/placesRequestBudget';

export type GooglePlacesCallContext = {
  reason: string;
  route?: string;
  lotName?: string | null;
  airportCode?: string | null;
  cacheKey?: string | null;
};

export function isGooglePlacesLiveBlocked(): boolean {
  return process.env.DISABLE_GOOGLE_PLACES === 'true';
}

export function isGooglePlacePhotosLiveBlocked(): boolean {
  return (
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS === 'true' ||
    isGooglePlacesLiveBlocked()
  );
}

export function isGooglePlaceReviewsLiveBlocked(): boolean {
  if (isGooglePlacesLiveBlocked()) return true;

  const flag = process.env.DISABLE_GOOGLE_PLACE_REVIEWS;
  if (flag === 'false') return false;
  return true;
}

export function isGoogleParkingDiscoveryLiveBlocked(): boolean {
  return (
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY === 'true' ||
    isGooglePlacesLiveBlocked()
  );
}

function logBlocked(
  endpoint: GooglePlacesEndpoint,
  context: GooglePlacesCallContext,
  blockReason: 'kill_switch' | 'request_budget',
  killSwitch?: string,
): void {
  if (process.env.NODE_ENV === 'test') return;

  if (blockReason === 'request_budget') {
    console.info('google_places_blocked_by_request_budget', {
      endpoint,
      route: context.route ?? 'unknown',
      reason: context.reason,
      lotName: context.lotName ?? null,
      airportCode: context.airportCode ?? null,
      cacheKey: context.cacheKey ?? null,
      budget: getActivePlacesRequestBudget(),
    });
    return;
  }

  console.info('google_places_blocked_by_kill_switch', {
    endpoint,
    killSwitch: killSwitch ?? 'DISABLE_GOOGLE_PLACES',
    route: context.route ?? 'unknown',
    reason: context.reason,
    lotName: context.lotName ?? null,
    airportCode: context.airportCode ?? null,
    cacheKey: context.cacheKey ?? null,
  });
}

function logAllowedLiveCall(
  endpoint: GooglePlacesEndpoint,
  context: GooglePlacesCallContext,
): void {
  if (process.env.NODE_ENV === 'test') return;

  console.info('[google-places-live]', {
    endpoint,
    route: context.route ?? 'unknown',
    reason: context.reason,
    lotName: context.lotName ?? null,
    airportCode: context.airportCode ?? null,
    cacheKey: context.cacheKey ?? null,
    killSwitchAllowed: true,
  });
}

function guardLiveCall(
  endpoint: GooglePlacesEndpoint,
  context: GooglePlacesCallContext,
  killSwitchBlocked: boolean,
  killSwitchName: string,
): boolean {
  if (killSwitchBlocked) {
    recordPlacesRequestBlocked();
    logBlocked(endpoint, context, 'kill_switch', killSwitchName);
    return false;
  }

  if (!tryConsumePlacesRequestCall(endpoint)) {
    logBlocked(endpoint, context, 'request_budget');
    return false;
  }

  logAllowedLiveCall(endpoint, context);
  return true;
}

export function canMakeLiveSearchTextCall(
  context: GooglePlacesCallContext,
  options?: { discovery?: boolean },
): boolean {
  if (options?.discovery && isGoogleParkingDiscoveryLiveBlocked()) {
    recordPlacesRequestBlocked();
    logBlocked('searchText', context, 'kill_switch', 'DISABLE_GOOGLE_PARKING_DISCOVERY');
    return false;
  }

  return guardLiveCall(
    'searchText',
    context,
    isGooglePlacesLiveBlocked(),
    'DISABLE_GOOGLE_PLACES',
  );
}

export function canMakeLiveGetPlaceCall(context: GooglePlacesCallContext): boolean {
  return guardLiveCall(
    'getPlace',
    context,
    isGooglePlacesLiveBlocked(),
    'DISABLE_GOOGLE_PLACES',
  );
}

export function canMakeLivePhotoMediaCall(context: GooglePlacesCallContext): boolean {
  return guardLiveCall(
    'photoMedia',
    context,
    isGooglePlacePhotosLiveBlocked(),
    'DISABLE_GOOGLE_PLACE_PHOTOS',
  );
}

export function canMakeLiveGoogleReviewCall(context: GooglePlacesCallContext): boolean {
  if (isGooglePlaceReviewsLiveBlocked()) {
    recordPlacesRequestBlocked();
    logBlocked('reviews', { ...context, reason: context.reason || 'reviews' }, 'kill_switch', 'DISABLE_GOOGLE_PLACE_REVIEWS');
    return false;
  }

  if (!tryConsumePlacesReviewCall()) {
    logBlocked('reviews', { ...context, reason: context.reason || 'reviews' }, 'request_budget');
    return false;
  }

  logAllowedLiveCall('reviews', { ...context, reason: context.reason || 'reviews' });
  return true;
}
