type HeaderReadable = {
  headers: {
    get(name: string): string | null;
  };
};

export type InMemoryRateLimitEntry = {
  count: number;
  resetAt: number;
};

export type InMemoryRateLimitConfig = {
  windowMs: number;
  max: number;
  maxEntries: number;
};

export type InMemoryRateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
  key: string;
  windowMs: number;
  max: number;
};

export function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  return value.split(',')[0]?.trim() || null;
}

export function requestRateLimitIdentity(request: HeaderReadable): string {
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

export function pruneInMemoryRateLimitStore(
  entries: Map<string, InMemoryRateLimitEntry>,
  now: number,
  maxEntries: number,
): void {
  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) {
      entries.delete(key);
    }
  }

  while (entries.size > maxEntries) {
    const oldestKey = entries.keys().next().value as string | undefined;
    if (!oldestKey) break;
    entries.delete(oldestKey);
  }
}

export function checkInMemoryRateLimit(
  entries: Map<string, InMemoryRateLimitEntry>,
  request: HeaderReadable,
  config: InMemoryRateLimitConfig,
  keyPrefix: string,
  now = Date.now(),
): InMemoryRateLimitResult {
  pruneInMemoryRateLimitStore(entries, now, config.maxEntries);

  const key = `${keyPrefix}:${requestRateLimitIdentity(request)}`;
  const current = entries.get(key);

  if (!current || current.resetAt <= now) {
    entries.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    pruneInMemoryRateLimitStore(entries, now, config.maxEntries);
    return {
      limited: false,
      retryAfterSeconds: 0,
      key,
      windowMs: config.windowMs,
      max: config.max,
    };
  }

  current.count += 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  return {
    limited: current.count > config.max,
    retryAfterSeconds,
    key,
    windowMs: config.windowMs,
    max: config.max,
  };
}
