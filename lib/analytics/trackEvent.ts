'use client';

import { getOrCreateAnonymousId, getOrCreateSessionId } from './analyticsIds';
import type { AnalyticsEventName, AnalyticsEventProperties } from './analyticsTypes';

export type TrackEventOptions = {
  eventProperties?: AnalyticsEventProperties;
  accessToken?: string | null;
  pagePath?: string | null;
  referrer?: string | null;
};

export function trackEvent(eventName: AnalyticsEventName, options: TrackEventOptions = {}): void {
  const fetchFn = typeof globalThis !== 'undefined' ? globalThis.fetch : undefined;
  if (typeof window === 'undefined' || typeof fetchFn !== 'function') return;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  void fetchFn('/api/analytics/event', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      eventName,
      eventProperties: options.eventProperties ?? {},
      anonymousId: getOrCreateAnonymousId(),
      sessionId: getOrCreateSessionId(),
      pagePath: options.pagePath ?? window.location.pathname,
      referrer: options.referrer ?? (document.referrer || null),
    }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never block navigation or UI.
  });
}
