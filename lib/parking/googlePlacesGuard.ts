import {
  canConsumeGooglePlacesDailyCallSync,
  getGooglePlacesDailyLimit,
  recordGooglePlacesDailyCall,
  type GooglePlacesDailyEndpoint,
} from '../apiUsage/googlePlacesDailyBudget';
import {
  getActivePlacesRequestBudget,
  recordPlacesRequestBlocked,
  tryConsumePlacesRequestCall,
  tryConsumePlacesReviewCall,
  type GooglePlacesEndpoint,
} from '../apiUsage/placesRequestBudget';
import {
  getMaxGooglePhotoMediaPerRequest,
  getMaxGooglePlaceDetailsPerRequest,
  getMaxGooglePlaceReviewsPerRequest,
  getMaxGooglePlacesCallsPerRequest,
} from '../apiUsage/placesRequestLimits';

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
  if (isGooglePlacesLiveBlocked()) return true;
  if (process.env.DISABLE_GOOGLE_PLACE_PHOTOS !== 'false') return true;
  if (getMaxGooglePhotoMediaPerRequest() <= 0) return true;
  if (getMaxGooglePlacesCallsPerRequest() <= 0) return true;
  return false;
}

export function isGooglePlaceReviewsLiveBlocked(): boolean {
  if (isGooglePlacesLiveBlocked()) return true;
  if (process.env.DISABLE_GOOGLE_PLACE_REVIEWS !== 'false') return true;
  if (getMaxGooglePlaceReviewsPerRequest() <= 0) return true;
  if (getMaxGooglePlaceDetailsPerRequest() <= 0) return true;
  if (getMaxGooglePlacesCallsPerRequest() <= 0) return true;
  return false;
}

export function isGoogleParkingDiscoveryLiveBlocked(): boolean {
  return (
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY === 'true' ||
    isGooglePlacesLiveBlocked()
  );
}

function dailyEndpointForPlacesCall(
  endpoint: GooglePlacesEndpoint,
): GooglePlacesDailyEndpoint {
  if (endpoint === 'searchText') return 'searchText';
  if (endpoint === 'getPlace' || endpoint === 'reviews') return 'getPlace';
  return 'photoMedia';
}

function logBudgetGuardSkipped(
  endpoint: GooglePlacesEndpoint,
  context: GooglePlacesCallContext,
): void {
  if (process.env.NODE_ENV === 'test') return;

  console.info('google_live_skipped_budget_guard', {
    endpoint,
    route: context.route ?? 'unknown',
    reason: context.reason,
    lotName: context.lotName ?? null,
    airportCode: context.airportCode ?? null,
    cacheKey: context.cacheKey ?? null,
    dailyLimit: getGooglePlacesDailyLimit(dailyEndpointForPlacesCall(endpoint)),
  });
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

  const dailyEndpoint = dailyEndpointForPlacesCall(endpoint);
  if (!canConsumeGooglePlacesDailyCallSync(dailyEndpoint)) {
    recordPlacesRequestBlocked();
    logBudgetGuardSkipped(endpoint, context);
    return false;
  }

  if (!tryConsumePlacesRequestCall(endpoint)) {
    logBlocked(endpoint, context, 'request_budget');
    return false;
  }

  recordGooglePlacesDailyCall(dailyEndpoint);
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

  const dailyEndpoint = dailyEndpointForPlacesCall('reviews');
  if (!canConsumeGooglePlacesDailyCallSync(dailyEndpoint)) {
    recordPlacesRequestBlocked();
    logBudgetGuardSkipped('reviews', { ...context, reason: context.reason || 'reviews' });
    return false;
  }

  recordGooglePlacesDailyCall(dailyEndpoint);
  logAllowedLiveCall('reviews', { ...context, reason: context.reason || 'reviews' });
  return true;
}
