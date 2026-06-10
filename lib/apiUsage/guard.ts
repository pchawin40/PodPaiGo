import type { ApiProvider, ApiUsageDiagnostics, ProviderCallLog } from './types';
import {
  ESTIMATED_COST_USD,
  getDailyLimit,
  getMaxGoogleRouteCallsPerSearch,
  getMaxLiveQuotesPerSearch,
  getMonthlyLimit,
  isProviderKillSwitchEnabled,
} from './config';
import { getRecentProviderCalls, logProviderCall } from './logging';
import { getActiveSearchBudget } from './searchBudget';
import { recordGooglePlacesDailyCall } from './googlePlacesDailyBudget';
import {
  incrementApiUsageCounter,
  readApiUsageCounter,
} from '../db/apiUsageCounters';

type CounterKey = `${ApiProvider}:${'daily' | 'monthly'}:${string}`;

const inMemoryCounters = new Map<
  CounterKey,
  { count: number; cost: number; lastRequestAt: string | null }
>();

const sessionStats = {
  cacheHits: 0,
  snapshotHits: 0,
  liveCalls: 0,
  blockedByBudget: 0,
  blockedByKillSwitch: 0,
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function counterKey(provider: ApiProvider, period: 'daily' | 'monthly'): CounterKey {
  return `${provider}:${period}:${period === 'daily' ? todayKey() : monthKey()}`;
}

function readInMemoryCounter(provider: ApiProvider, period: 'daily' | 'monthly'): number {
  return inMemoryCounters.get(counterKey(provider, period))?.count ?? 0;
}

function readInMemoryCost(provider: ApiProvider, period: 'daily' | 'monthly'): number {
  return inMemoryCounters.get(counterKey(provider, period))?.cost ?? 0;
}

function bumpInMemoryCounter(provider: ApiProvider, estimatedCost: number): void {
  for (const period of ['daily', 'monthly'] as const) {
    const key = counterKey(provider, period);
    const existing = inMemoryCounters.get(key) || { count: 0, cost: 0, lastRequestAt: null };
    inMemoryCounters.set(key, {
      count: existing.count + 1,
      cost: existing.cost + estimatedCost,
      lastRequestAt: new Date().toISOString(),
    });
  }
}

export type ApiBudgetDecision = {
  allowed: boolean;
  reason?: 'kill_switch' | 'daily_limit' | 'monthly_limit' | 'search_route_limit' | 'search_quote_limit';
};

export async function checkApiBudget(
  provider: ApiProvider,
): Promise<ApiBudgetDecision> {
  if (isProviderKillSwitchEnabled(provider)) {
    return { allowed: false, reason: 'kill_switch' };
  }

  const dailyLimit = getDailyLimit(provider);
  const monthlyLimit = getMonthlyLimit(provider);

  let dailyCount = readInMemoryCounter(provider, 'daily');
  let monthlyCount = readInMemoryCounter(provider, 'monthly');

  try {
    dailyCount = Math.max(dailyCount, await readApiUsageCounter(provider, 'daily', todayKey()));
    monthlyCount = Math.max(monthlyCount, await readApiUsageCounter(provider, 'monthly', monthKey()));
  } catch {
    // In-memory counters remain authoritative when DB unavailable.
  }

  if (dailyCount >= dailyLimit) {
    return { allowed: false, reason: 'daily_limit' };
  }

  if (monthlyCount >= monthlyLimit) {
    return { allowed: false, reason: 'monthly_limit' };
  }

  return { allowed: true };
}

export async function canMakeLiveApiCall(
  provider: ApiProvider,
  options?: { isQuote?: boolean },
): Promise<ApiBudgetDecision> {
  const budget = await checkApiBudget(provider);
  if (!budget.allowed) return budget;

  if (provider === 'google_routes') {
    const { tryConsumeSearchRouteCall } = await import('./searchBudget');
    if (!tryConsumeSearchRouteCall()) {
      return { allowed: false, reason: 'search_route_limit' };
    }
  }

  if (options?.isQuote) {
    const { tryConsumeSearchQuoteCall } = await import('./searchBudget');
    if (!tryConsumeSearchQuoteCall()) {
      return { allowed: false, reason: 'search_quote_limit' };
    }
  }

  return { allowed: true };
}

export async function recordApiUsage(provider: ApiProvider, estimatedCost?: number): Promise<void> {
  const cost = estimatedCost ?? ESTIMATED_COST_USD[provider];
  bumpInMemoryCounter(provider, cost);
  sessionStats.liveCalls += 1;

  // Keep the Google daily-count snapshot honest for routes/geocoding. These
  // endpoints are not guarded through recordGooglePlacesDailyCall elsewhere, so
  // without this their daily counts stayed at 0 and the google_usage_summary
  // log falsely implied route/geocode requests were never attempted.
  if (provider === 'google_routes') {
    recordGooglePlacesDailyCall('routes');
  } else if (provider === 'geocoding') {
    recordGooglePlacesDailyCall('geocoding');
  }

  void incrementApiUsageCounter({
    provider,
    periodType: 'daily',
    periodKey: todayKey(),
    estimatedCost: cost,
  }).catch(() => undefined);

  void incrementApiUsageCounter({
    provider,
    periodType: 'monthly',
    periodKey: monthKey(),
    estimatedCost: cost,
  }).catch(() => undefined);
}

export function recordCacheHit(): void {
  sessionStats.cacheHits += 1;
}

export function recordSnapshotHit(): void {
  sessionStats.snapshotHits += 1;
}

export function recordBlockedByBudget(): void {
  sessionStats.blockedByBudget += 1;
}

export function recordBlockedByKillSwitch(): void {
  sessionStats.blockedByKillSwitch += 1;
}

export function emitProviderCall(entry: ProviderCallLog): void {
  if (entry.cacheHit) recordCacheHit();
  if (entry.snapshotHit) recordSnapshotHit();
  if (entry.blockedByBudget) recordBlockedByBudget();
  if (entry.blockedByKillSwitch) recordBlockedByKillSwitch();

  logProviderCall(entry);
}

export function getApiUsageDiagnostics(): ApiUsageDiagnostics {
  const providers = (
    ['google_routes', 'google_places', 'geocoding', 'apr', 'parkwhiz'] as ApiProvider[]
  ).reduce<ApiUsageDiagnostics['providers']>((acc, provider) => {
    const dailyKey = counterKey(provider, 'daily');
    const monthlyKey = counterKey(provider, 'monthly');
    acc[provider] = {
      dailyCount: inMemoryCounters.get(dailyKey)?.count ?? 0,
      monthlyCount: inMemoryCounters.get(monthlyKey)?.count ?? 0,
      dailyLimit: getDailyLimit(provider),
      monthlyLimit: getMonthlyLimit(provider),
      estimatedCostToday: readInMemoryCost(provider, 'daily'),
      estimatedCostMonth: readInMemoryCost(provider, 'monthly'),
      lastRequestAt:
        inMemoryCounters.get(dailyKey)?.lastRequestAt ||
        inMemoryCounters.get(monthlyKey)?.lastRequestAt ||
        null,
      disabled: isProviderKillSwitchEnabled(provider),
    };
    return acc;
  }, {} as ApiUsageDiagnostics['providers']);

  const budget = getActiveSearchBudget();

  return {
    providers,
    session: { ...sessionStats },
    searchBudget: {
      active: Boolean(budget),
      routeCalls: budget?.routeCalls ?? 0,
      quoteCalls: budget?.quoteCalls ?? 0,
      maxRouteCalls: getMaxGoogleRouteCallsPerSearch(),
      maxQuoteCalls: getMaxLiveQuotesPerSearch(),
    },
  };
}

export function resetApiUsageStateForTests(): void {
  inMemoryCounters.clear();
  sessionStats.cacheHits = 0;
  sessionStats.snapshotHits = 0;
  sessionStats.liveCalls = 0;
  sessionStats.blockedByBudget = 0;
  sessionStats.blockedByKillSwitch = 0;
}

export { getRecentProviderCalls, isProviderKillSwitchEnabled };
