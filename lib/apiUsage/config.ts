import type { ApiProvider } from './types';

const DEFAULT_DAILY_LIMITS: Record<ApiProvider, number> = {
  google_routes: 100,
  google_places: 100,
  geocoding: 50,
  apr: 100,
  parkwhiz: 100,
};

/** Rough USD estimates per live call for budgeting (not billing). */
export const ESTIMATED_COST_USD: Record<ApiProvider, number> = {
  google_routes: 0.01,
  google_places: 0.017,
  geocoding: 0.005,
  apr: 0,
  parkwhiz: 0,
};

export function readEnvInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

export function getDailyLimit(provider: ApiProvider): number {
  const envName = `${provider.toUpperCase()}_DAILY_LIMIT`.replace('GOOGLE_', 'GOOGLE_');
  const map: Record<ApiProvider, string> = {
    google_routes: 'GOOGLE_ROUTES_DAILY_LIMIT',
    google_places: 'GOOGLE_PLACES_DAILY_LIMIT',
    geocoding: 'GEOCODING_DAILY_LIMIT',
    apr: 'APR_DAILY_LIMIT',
    parkwhiz: 'PARKWHIZ_DAILY_LIMIT',
  };
  return readEnvInt(map[provider], DEFAULT_DAILY_LIMITS[provider]);
}

export function getMonthlyLimit(provider: ApiProvider): number {
  const map: Record<ApiProvider, string> = {
    google_routes: 'GOOGLE_ROUTES_MONTHLY_LIMIT',
    google_places: 'GOOGLE_PLACES_MONTHLY_LIMIT',
    geocoding: 'GEOCODING_MONTHLY_LIMIT',
    apr: 'APR_MONTHLY_LIMIT',
    parkwhiz: 'PARKWHIZ_MONTHLY_LIMIT',
  };
  return readEnvInt(map[provider], getDailyLimit(provider) * 30);
}

export function isProviderKillSwitchEnabled(provider: ApiProvider): boolean {
  const map: Record<ApiProvider, string> = {
    google_routes: 'DISABLE_GOOGLE_ROUTES',
    google_places: 'DISABLE_GOOGLE_PLACES',
    geocoding: 'DISABLE_GEOCODING',
    apr: 'DISABLE_APR',
    parkwhiz: 'DISABLE_PARKWHIZ',
  };

  const direct = process.env[map[provider]] === 'true';
  if (direct) return true;

  if (provider === 'apr' && process.env.DISABLE_APR_PARKING === 'true') {
    return true;
  }

  return false;
}

export function getMaxGoogleRouteCallsPerSearch(): number {
  return readEnvInt('MAX_GOOGLE_ROUTE_CALLS_PER_SEARCH', 3);
}

export function getMaxLiveQuotesPerSearch(): number {
  return readEnvInt('MAX_LIVE_QUOTES_PER_SEARCH', 3);
}

export function getLiveRouteCacheTtlMs(): number {
  return readEnvInt('LIVE_ROUTE_CACHE_TTL_MINUTES', 30) * 60 * 1000;
}

export function getStaleRouteSnapshotMaxAgeMs(): number {
  return readEnvInt('STALE_ROUTE_SNAPSHOT_MAX_HOURS', 24) * 60 * 60 * 1000;
}
