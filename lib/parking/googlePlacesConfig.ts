import {
  getMaxGooglePhotoMediaPerRequest,
  getMaxGooglePlaceDetailsPerRequest,
  getMaxGooglePlaceReviewsPerRequest,
  getMaxGooglePlacesCallsPerRequest,
  getMaxGoogleSearchTextPerRequest,
} from '../apiUsage/placesRequestLimits';
import { getGooglePlacesDailyCountsSnapshot } from '../apiUsage/googlePlacesDailyBudget';
import { getGooglePlacesCacheWriteTimeoutMs } from './googlePlacesCacheWrite';
import {
  isGoogleParkingDiscoveryLiveBlocked,
  isGooglePlacePhotosLiveBlocked,
  isGooglePlaceReviewsLiveBlocked,
  isGooglePlacesLiveBlocked,
} from './googlePlacesGuard';

export type EffectiveGooglePlacesConfig = {
  disableGooglePlaces: boolean;
  disableGooglePlacePhotos: boolean;
  disableGooglePlaceReviews: boolean;
  disableGoogleParkingDiscovery: boolean;
  disableParkingDbCache: boolean;
  maxGooglePlacesCallsPerRequest: number;
  maxGoogleSearchTextPerRequest: number;
  maxGooglePlaceDetailsPerRequest: number;
  maxGooglePhotoMediaPerRequest: number;
  maxGooglePlaceReviewsPerRequest: number;
  googlePlacesCacheWriteTimeoutMs: number;
  nodeEnv: string;
  livePlacesEnabled: boolean;
  livePhotosEnabled: boolean;
  liveReviewsEnabled: boolean;
  discoveryEnabled: boolean;
  dbCacheEnabled: boolean;
};

export type GooglePlacesRequestSummary = {
  route?: string;
  requestKey: string;
  searchTextUsed: number;
  getPlaceUsed: number;
  photoMediaUsed: number;
  reviewsUsed: number;
  totalUsed: number;
  blocked: number;
};

export function isParkingDbCacheDisabled(): boolean {
  return process.env.DISABLE_PARKING_DB_CACHE === 'true';
}

export function getEffectiveGooglePlacesConfig(): EffectiveGooglePlacesConfig {
  const disableGooglePlaces = isGooglePlacesLiveBlocked();
  const disableGooglePlacePhotos = isGooglePlacePhotosLiveBlocked();
  const disableGooglePlaceReviews = isGooglePlaceReviewsLiveBlocked();
  const disableGoogleParkingDiscovery = isGoogleParkingDiscoveryLiveBlocked();
  const disableParkingDbCache = isParkingDbCacheDisabled();

  return {
    disableGooglePlaces,
    disableGooglePlacePhotos,
    disableGooglePlaceReviews,
    disableGoogleParkingDiscovery,
    disableParkingDbCache,
    maxGooglePlacesCallsPerRequest: getMaxGooglePlacesCallsPerRequest(),
    maxGoogleSearchTextPerRequest: getMaxGoogleSearchTextPerRequest(),
    maxGooglePlaceDetailsPerRequest: getMaxGooglePlaceDetailsPerRequest(),
    maxGooglePhotoMediaPerRequest: getMaxGooglePhotoMediaPerRequest(),
    maxGooglePlaceReviewsPerRequest: getMaxGooglePlaceReviewsPerRequest(),
    googlePlacesCacheWriteTimeoutMs: getGooglePlacesCacheWriteTimeoutMs(),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    livePlacesEnabled: !disableGooglePlaces,
    livePhotosEnabled: !disableGooglePlacePhotos,
    liveReviewsEnabled: !disableGooglePlaceReviews,
    discoveryEnabled: !disableGoogleParkingDiscovery,
    dbCacheEnabled: !disableParkingDbCache,
  };
}

export function formatGooglePlacesSafetySummary(
  config: EffectiveGooglePlacesConfig = getEffectiveGooglePlacesConfig(),
): string {
  const caps = [
    config.maxGoogleSearchTextPerRequest,
    config.maxGooglePlaceDetailsPerRequest,
    config.maxGooglePhotoMediaPerRequest,
    config.maxGooglePlacesCallsPerRequest,
  ].join('/');

  return `[google-places-config] livePlaces=${config.livePlacesEnabled} photos=${config.livePhotosEnabled} discovery=${config.discoveryEnabled} caps=${caps} dbCache=${config.dbCacheEnabled}`;
}

export function formatGooglePlacesRequestSummaryLine(summary: GooglePlacesRequestSummary): string {
  const used = [
    summary.searchTextUsed,
    summary.getPlaceUsed,
    summary.photoMediaUsed,
    summary.totalUsed,
  ].join('/');

  const route = summary.route ?? 'unknown';
  return `[google-places-config] request ${route} used=${used} reviews=${summary.reviewsUsed} blocked=${summary.blocked}`;
}

export function inferGooglePlacesRequestRoute(requestKey: string): string {
  if (requestKey.startsWith('google-place-match:')) return '/api/google-place-match';
  if (requestKey.startsWith('google-place-photo:')) return '/api/google-place-photo';
  if (requestKey.startsWith('parking-reviews:')) return '/api/parking-reviews';
  if (requestKey.startsWith('live-refresh:')) return '/api/parking/live-refresh';
  return '/api/recommendations';
}

export function logGooglePlacesConfig(
  event: 'startup' | 'request',
  meta?: { route?: string; requestKey?: string },
): void {
  if (process.env.NODE_ENV === 'test') return;

  const config = getEffectiveGooglePlacesConfig();
  const isDev = config.nodeEnv === 'development';

  if (event === 'startup' || isDev) {
    console.info(formatGooglePlacesSafetySummary(config));
  }

  if (process.env.DEBUG_LOGS === 'true' || process.env.NEXT_PUBLIC_DEBUG_UI === 'true') {
    console.info(`google_places_config_${event}`, {
      ...config,
      route: meta?.route ?? null,
      requestKey: meta?.requestKey ?? null,
    });
    console.info('parking_reviews_env_debug', {
      disableGooglePlaces: config.disableGooglePlaces,
      disableGooglePlaceReviews: config.disableGooglePlaceReviews,
      maxGooglePlaceReviewsPerRequest: config.maxGooglePlaceReviewsPerRequest,
      maxGooglePlaceDetailsPerRequest: config.maxGooglePlaceDetailsPerRequest,
      liveReviewsEnabled: config.liveReviewsEnabled,
    });
  }
}

export function logGooglePlacesRequestSummary(summary: GooglePlacesRequestSummary): void {
  if (process.env.NODE_ENV === 'test') return;

  const config = getEffectiveGooglePlacesConfig();
  const isDev = config.nodeEnv === 'development';

  if (isDev) {
    console.info(formatGooglePlacesRequestSummaryLine(summary));
  }

  if (process.env.DEBUG_LOGS === 'true') {
    console.info('google_places_request_summary', summary);
  }
}

export function logGoogleUsageSummary(summary: GooglePlacesRequestSummary): void {
  if (process.env.NODE_ENV === 'test') return;

  console.info('google_usage_summary', {
    route: summary.route ?? 'unknown',
    requestKey: summary.requestKey,
    searchTextUsed: summary.searchTextUsed,
    getPlaceUsed: summary.getPlaceUsed,
    photoMediaUsed: summary.photoMediaUsed,
    reviewsUsed: summary.reviewsUsed,
    totalUsed: summary.totalUsed,
    blocked: summary.blocked,
    dailyCounts: getGooglePlacesDailyCountsSnapshot(),
  });
}
