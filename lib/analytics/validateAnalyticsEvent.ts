import { ANALYTICS_EVENT_NAMES, type AnalyticsTrackPayload } from './analyticsTypes';

const EVENT_NAME_SET = new Set<string>(ANALYTICS_EVENT_NAMES);

export function isAnalyticsEventName(value: string): value is AnalyticsTrackPayload['eventName'] {
  return EVENT_NAME_SET.has(value);
}

export function validateAnalyticsTrackPayload(body: unknown): AnalyticsTrackPayload | null {
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  const eventName =
    typeof record.eventName === 'string'
      ? record.eventName.trim()
      : typeof record.event_name === 'string'
        ? record.event_name.trim()
        : '';

  if (!eventName || !isAnalyticsEventName(eventName)) return null;

  const eventProperties =
    record.eventProperties && typeof record.eventProperties === 'object' && !Array.isArray(record.eventProperties)
      ? (record.eventProperties as Record<string, unknown>)
      : record.event_properties &&
          typeof record.event_properties === 'object' &&
          !Array.isArray(record.event_properties)
        ? (record.event_properties as Record<string, unknown>)
        : {};

  return {
    eventName,
    eventProperties,
    anonymousId:
      typeof record.anonymousId === 'string'
        ? record.anonymousId
        : typeof record.anonymous_id === 'string'
          ? record.anonymous_id
          : null,
    sessionId:
      typeof record.sessionId === 'string'
        ? record.sessionId
        : typeof record.session_id === 'string'
          ? record.session_id
          : null,
    pagePath:
      typeof record.pagePath === 'string'
        ? record.pagePath
        : typeof record.page_path === 'string'
          ? record.page_path
          : null,
    referrer: typeof record.referrer === 'string' ? record.referrer : null,
  };
}
