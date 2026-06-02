import {
  getMaxGooglePhotoMediaPerRequest,
  getMaxGooglePlaceDetailsPerRequest,
  getMaxGooglePlacesCallsPerRequest,
  getMaxGoogleSearchTextPerRequest,
} from '../apiUsage/placesRequestLimits';
import { getGooglePlacesCacheWriteTimeoutMs } from './googlePlacesCacheWrite';
import {
  isGoogleParkingDiscoveryLiveBlocked,
  isGooglePlacePhotosLiveBlocked,
  isGooglePlacesLiveBlocked,
} from './googlePlacesGuard';

export type EffectiveGooglePlacesConfig = {
  disableGooglePlaces: boolean;
  disableGooglePlacePhotos: boolean;
  disableGoogleParkingDiscovery: boolean;
  disableParkingDbCache: boolean;
  maxGooglePlacesCallsPerRequest: number;
  maxGoogleSearchTextPerRequest: number;
  maxGooglePlaceDetailsPerRequest: number;
  maxGooglePhotoMediaPerRequest: number;
  googlePlacesCacheWriteTimeoutMs: number;
  nodeEnv: string;
  livePlacesEnabled: boolean;
  livePhotosEnabled: boolean;
  discoveryEnabled: boolean;
  dbCacheEnabled: boolean;
};

export type GooglePlacesRequestSummary = {
  route?: string;
  requestKey: string;
  searchTextUsed: number;
  getPlaceUsed: number;
  photoMediaUsed: number;
  totalUsed: number;
  blocked: number;
};

export function isParkingDbCacheDisabled(): boolean {
  return process.env.DISABLE_PARKING_DB_CACHE === 'true';
}

export function getEffectiveGooglePlacesConfig(): EffectiveGooglePlacesConfig {
  const disableGooglePlaces = isGooglePlacesLiveBlocked();
  const disableGooglePlacePhotos = isGooglePlacePhotosLiveBlocked();
  const disableGoogleParkingDiscovery = isGoogleParkingDiscoveryLiveBlocked();
  const disableParkingDbCache = isParkingDbCacheDisabled();

  return {
    disableGooglePlaces,
    disableGooglePlacePhotos,
    disableGoogleParkingDiscovery,
    disableParkingDbCache,
    maxGooglePlacesCallsPerRequest: getMaxGooglePlacesCallsPerRequest(),
    maxGoogleSearchTextPerRequest: getMaxGoogleSearchTextPerRequest(),
    maxGooglePlaceDetailsPerRequest: getMaxGooglePlaceDetailsPerRequest(),
    maxGooglePhotoMediaPerRequest: getMaxGooglePhotoMediaPerRequest(),
    googlePlacesCacheWriteTimeoutMs: getGooglePlacesCacheWriteTimeoutMs(),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    livePlacesEnabled: !disableGooglePlaces,
    livePhotosEnabled: !disableGooglePlacePhotos,
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
  return `[google-places-config] request ${route} used=${used} blocked=${summary.blocked}`;
}

export function inferGooglePlacesRequestRoute(requestKey: string): string {
  if (requestKey.startsWith('google-place-match:')) return '/api/google-place-match';
  if (requestKey.startsWith('google-place-photo:')) return '/api/google-place-photo';
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

  if (process.env.DEBUG_LOGS === 'true') {
    console.info(`google_places_config_${event}`, {
      ...config,
      route: meta?.route ?? null,
      requestKey: meta?.requestKey ?? null,
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
