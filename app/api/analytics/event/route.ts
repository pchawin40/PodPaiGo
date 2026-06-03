import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAnalyticsClient,
  insertAnalyticsEvent,
} from '../../../../lib/analytics/insertAnalyticsEvent';
import { sanitizeAnalyticsProperties } from '../../../../lib/analytics/sanitizeAnalytics';
import { validateAnalyticsTrackPayload } from '../../../../lib/analytics/validateAnalyticsEvent';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
    }

    const payload = validateAnalyticsTrackPayload(body);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }

    const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
    const client = createSupabaseAnalyticsClient(accessToken);

    if (!client) {
      return NextResponse.json({ ok: true, stored: false, reason: 'supabase_not_configured' });
    }

    let authenticatedUserId: string | null = null;
    if (accessToken) {
      const { data } = await client.auth.getUser();
      authenticatedUserId = data.user?.id ?? null;
    }

    const sanitizedProperties = sanitizeAnalyticsProperties(payload.eventProperties);
    const userAgent = request.headers.get('user-agent');

    await insertAnalyticsEvent(client, {
      user_id: authenticatedUserId,
      anonymous_id: payload.anonymousId?.trim() || null,
      session_id: payload.sessionId?.trim() || null,
      event_name: payload.eventName,
      event_properties: sanitizedProperties,
      page_path: payload.pagePath?.trim() || null,
      referrer: payload.referrer?.trim() || null,
      user_agent: userAgent,
    });

    return NextResponse.json({ ok: true, stored: true });
  } catch (error) {
    console.warn('[analytics-event] failed to store event', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json({ ok: true, stored: false, reason: 'store_failed' });
  }
}
