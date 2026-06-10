import { createHash } from 'crypto';
import {
  checkInMemoryRateLimit,
  readPositiveInt,
  requestRateLimitIdentity,
  type InMemoryRateLimitEntry,
} from './inMemoryRateLimiter';

type HeaderReadable = {
  headers: {
    get(name: string): string | null;
  };
};

const rateLimitEntries = new Map<string, InMemoryRateLimitEntry>();

export function getRecommendationsRateLimitConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    windowMs: readPositiveInt(
      env.RECOMMENDATIONS_RATE_LIMIT_WINDOW_MS,
      production ? 60_000 : 10_000,
    ),
    max: readPositiveInt(
      env.RECOMMENDATIONS_RATE_LIMIT_MAX,
      production ? 30 : 300,
    ),
    maxEntries: readPositiveInt(env.RECOMMENDATIONS_RATE_LIMIT_MAX_ENTRIES, 5000),
  };
}

export function getRecommendationsCacheTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const seconds = Number.parseInt(env.RECOMMENDATIONS_CACHE_TTL_SECONDS ?? '30', 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds * 1000;
}

export function getRecommendationsCacheMaxEntries(env: NodeJS.ProcessEnv = process.env): number {
  return readPositiveInt(env.RECOMMENDATIONS_CACHE_MAX_ENTRIES, 500);
}

export function hashRecommendationRequest(bodyText: string): string {
  return createHash('sha256').update(bodyText).digest('hex');
}

export function recommendationRateLimitKey(request: HeaderReadable): string {
  return requestRateLimitIdentity(request);
}

export function checkRecommendationsRateLimit(
  request: HeaderReadable,
  now = Date.now(),
): {
  limited: boolean;
  retryAfterSeconds: number;
  key: string;
  windowMs: number;
  max: number;
} {
  const config = getRecommendationsRateLimitConfig();
  return checkInMemoryRateLimit(rateLimitEntries, request, config, 'recommendations', now);
}

export function resetRecommendationsRateLimitForTests(): void {
  rateLimitEntries.clear();
}

export function getRecommendationsRateLimitEntryCountForTests(): number {
  return rateLimitEntries.size;
}
