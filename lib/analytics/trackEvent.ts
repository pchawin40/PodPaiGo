'use client';

import { getOrCreateAnonymousId, getOrCreateSessionId } from './analyticsIds';
import { stripAnalyticsUrlQueryAndHash } from './sanitizeAnalytics';
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

  const body = JSON.stringify({
    eventName,
    eventProperties: {
      ...(options.eventProperties ?? {}),
      timestamp: new Date().toISOString(),
    },
    anonymousId: getOrCreateAnonymousId(),
    sessionId: getOrCreateSessionId(),
    pagePath: stripAnalyticsUrlQueryAndHash(options.pagePath ?? window.location.pathname),
    referrer: options.referrer
      ? stripAnalyticsUrlQueryAndHash(options.referrer)
      : document.referrer
        ? stripAnalyticsUrlQueryAndHash(document.referrer)
        : null,
  });

  if (!options.accessToken && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/analytics/event', blob)) return;
    } catch {
      // Fall back to fetch below.
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  void fetchFn('/api/analytics/event', {
    method: 'POST',
    headers,
    body,
    keepalive: true,
  }).catch(() => {
    // Analytics must never block navigation or UI.
  });
}
