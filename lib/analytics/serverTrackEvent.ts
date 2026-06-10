import {
  createSupabaseAnalyticsClient,
  insertAnalyticsEvent,
} from './insertAnalyticsEvent';
import { sanitizeAnalyticsProperties } from './sanitizeAnalytics';
import type { AnalyticsEventName, AnalyticsEventProperties } from './analyticsTypes';

export async function trackServerEvent(
  eventName: AnalyticsEventName,
  eventProperties: AnalyticsEventProperties = {},
  request?: { headers: { get(name: string): string | null } },
): Promise<void> {
  const client = createSupabaseAnalyticsClient(null);
  if (!client) return;

  try {
    await insertAnalyticsEvent(client, {
      user_id: null,
      anonymous_id: null,
      session_id: null,
      event_name: eventName,
      event_properties: sanitizeAnalyticsProperties({
        ...eventProperties,
        timestamp: new Date().toISOString(),
      }),
      page_path: null,
      referrer: null,
      user_agent: request?.headers.get('user-agent') ?? null,
    });
  } catch {
    // Analytics must never affect user-facing API behavior.
  }
}
