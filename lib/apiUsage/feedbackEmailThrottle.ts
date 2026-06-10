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

const feedbackEmailThrottleEntries = new Map<string, InMemoryRateLimitEntry>();

export function getFeedbackEmailThrottleConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    windowMs: readPositiveInt(env.FEEDBACK_EMAIL_THROTTLE_MS, 5 * 60_000),
    max: 1,
    maxEntries: readPositiveInt(env.FEEDBACK_EMAIL_THROTTLE_MAX_ENTRIES, 5000),
  };
}

export function checkFeedbackEmailThrottle(
  request: HeaderReadable,
  now = Date.now(),
): InMemoryRateLimitResult {
  return checkInMemoryRateLimit(
    feedbackEmailThrottleEntries,
    request,
    getFeedbackEmailThrottleConfig(),
    'feedback-email',
    now,
  );
}

export function resetFeedbackEmailThrottleForTests(): void {
  feedbackEmailThrottleEntries.clear();
}
