import { NextResponse } from 'next/server';
import {
  checkInMemoryRateLimit,
  readPositiveInt,
  type InMemoryRateLimitEntry,
  type InMemoryRateLimitResult,
} from './inMemoryRateLimiter';

type HeaderReadable = {
  headers: {
    get(name: string): string | null;
  };
};

const publicEndpointRateLimitEntries = new Map<string, InMemoryRateLimitEntry>();

export function getPublicEndpointRateLimitConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    windowMs: readPositiveInt(
      env.PUBLIC_API_RATE_LIMIT_WINDOW_MS,
      production ? 60_000 : 10_000,
    ),
    max: readPositiveInt(
      env.PUBLIC_API_RATE_LIMIT_MAX,
      production ? 60 : 1000,
    ),
    maxEntries: readPositiveInt(env.PUBLIC_API_RATE_LIMIT_MAX_ENTRIES, 5000),
  };
}

export function checkPublicEndpointRateLimit(
  route: string,
  request: HeaderReadable,
  now = Date.now(),
): InMemoryRateLimitResult {
  return checkInMemoryRateLimit(
    publicEndpointRateLimitEntries,
    request,
    getPublicEndpointRateLimitConfig(),
    route,
    now,
  );
}

export function publicRateLimitResponse(limit: InMemoryRateLimitResult) {
  return NextResponse.json(
    {
      error: 'rate_limited',
      message: 'Too many requests. Please wait a moment and try again.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(limit.retryAfterSeconds),
      },
    },
  );
}

export function resetPublicEndpointRateLimitsForTests(): void {
  publicEndpointRateLimitEntries.clear();
}
