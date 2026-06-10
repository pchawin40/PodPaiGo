import { createHash } from 'crypto';

type HeaderReadable = {
  headers: {
    get(name: string): string | null;
  };
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitEntries = new Map<string, RateLimitEntry>();

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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
  };
}

export function getRecommendationsCacheTtlMs(env: NodeJS.ProcessEnv = process.env): number {
  const seconds = Number.parseInt(env.RECOMMENDATIONS_CACHE_TTL_SECONDS ?? '30', 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds * 1000;
}

export function hashRecommendationRequest(bodyText: string): string {
  return createHash('sha256').update(bodyText).digest('hex');
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  return value.split(',')[0]?.trim() || null;
}

export function recommendationRateLimitKey(request: HeaderReadable): string {
  const sessionId =
    request.headers.get('x-podpaigo-session-id') ||
    request.headers.get('x-session-id');
  if (sessionId?.trim()) return `session:${sessionId.trim().slice(0, 120)}`;

  const forwardedFor = firstHeaderValue(request.headers.get('x-forwarded-for'));
  if (forwardedFor) return `ip:${forwardedFor}`;

  const realIp =
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip');
  if (realIp?.trim()) return `ip:${realIp.trim()}`;

  return 'ip:unknown';
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
  const key = recommendationRateLimitKey(request);
  const current = rateLimitEntries.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitEntries.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      limited: false,
      retryAfterSeconds: 0,
      key,
      ...config,
    };
  }

  current.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  return {
    limited: current.count > config.max,
    retryAfterSeconds,
    key,
    ...config,
  };
}

export function resetRecommendationsRateLimitForTests(): void {
  rateLimitEntries.clear();
}
