import { NextRequest, NextResponse } from 'next/server';
import {
  createSupabaseAnalyticsClient,
  insertAnalyticsEvent,
} from '@/lib/analytics/insertAnalyticsEvent';
import {
  betaFeedbackToAnalyticsProperties,
  type BetaFeedbackPayload,
  validateBetaFeedbackPayload,
} from '@/lib/feedback/betaFeedback';
import { sendFeedbackAdminEmailNotification } from '@/lib/feedback/feedbackEmail';

export const runtime = 'nodejs';

type FeedbackStoreResult = {
  stored: boolean;
  reason?: 'supabase_not_configured' | 'store_failed';
};

async function storeFeedbackEvent(
  payload: BetaFeedbackPayload,
  accessToken: string | null,
): Promise<FeedbackStoreResult> {
  const client = createSupabaseAnalyticsClient(accessToken);

  if (!client) {
    return { stored: false, reason: 'supabase_not_configured' };
  }

  let authenticatedUserId: string | null = null;
  if (accessToken) {
    const { data } = await client.auth.getUser();
    authenticatedUserId = data.user?.id ?? null;
  }

  try {
    await insertAnalyticsEvent(client, {
      user_id: authenticatedUserId,
      anonymous_id: null,
      session_id: null,
      event_name: 'feedback_submitted',
      event_properties: betaFeedbackToAnalyticsProperties(payload),
      page_path: payload.context.pagePath,
      referrer: null,
      user_agent: payload.context.userAgent,
    });

    return { stored: true };
  } catch (error) {
    console.warn('[feedback] failed to store report', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return { stored: false, reason: 'store_failed' };
  }
}

async function notifyFeedbackAdmins(payload: BetaFeedbackPayload): Promise<void> {
  try {
    const result = await sendFeedbackAdminEmailNotification(payload);
    if (result.sent) {
      console.info('[feedback] admin email notification sent', {
        provider: result.provider,
        recipientCount: result.recipientCount,
      });
      return;
    }

    console.info('[feedback] admin email notification skipped', {
      provider: result.provider,
      reason: result.reason,
    });
  } catch (error) {
    console.warn('[feedback] failed to send admin email notification', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const payload = validateBetaFeedbackPayload(body, request.headers.get('user-agent'));
  if (!payload) {
    return NextResponse.json({ ok: false, error: 'invalid_feedback' }, { status: 400 });
  }

  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || null;
  const storeResult = await storeFeedbackEvent(payload, accessToken);
  await notifyFeedbackAdmins(payload);

  return NextResponse.json({
    ok: true,
    stored: storeResult.stored,
    ...(storeResult.reason ? { reason: storeResult.reason } : {}),
  });
}
