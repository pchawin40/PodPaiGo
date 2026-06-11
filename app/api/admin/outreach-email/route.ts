import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin';
import {
  getOutreachDefaults,
  OUTREACH_TEMPLATES,
  recipientDomain,
  sendOutreachEmailWithResend,
  validateOutreachSendInput,
  type OutreachSendInput,
} from '@/lib/admin/outreachEmail';
import {
  createSupabaseServiceClient,
  insertAnalyticsEvent,
} from '@/lib/analytics/insertAnalyticsEvent';
import { sanitizeAnalyticsProperties } from '@/lib/analytics/sanitizeAnalytics';

export const runtime = 'nodejs';

type RateEntry = {
  count: number;
  resetAt: number;
};

const outreachRateLimit = new Map<string, RateEntry>();

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function checkAdminOutreachRateLimit(adminKey: string, now = Date.now()) {
  const windowMs = readPositiveInt(process.env.OUTREACH_EMAIL_RATE_LIMIT_WINDOW_MS, 10 * 60_000);
  const max = readPositiveInt(process.env.OUTREACH_EMAIL_RATE_LIMIT_MAX, 5);

  for (const [key, entry] of outreachRateLimit) {
    if (entry.resetAt <= now) outreachRateLimit.delete(key);
  }

  const current = outreachRateLimit.get(adminKey);
  if (!current || current.resetAt <= now) {
    outreachRateLimit.set(adminKey, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSeconds: 0 };
  }

  current.count += 1;
  return {
    limited: current.count > max,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

async function recordOutreachSendEvent(args: {
  adminUserId: string | null;
  adminEmail: string | null;
  to: string;
  subject: string;
  templateId: string;
  messageId: string | null;
  testMode: boolean;
  request: NextRequest;
}) {
  const client = createSupabaseServiceClient();
  if (!client) return;

  try {
    await insertAnalyticsEvent(client, {
      user_id: args.adminUserId,
      anonymous_id: null,
      session_id: null,
      event_name: 'admin_outreach_email_sent',
      event_properties: sanitizeAnalyticsProperties({
        recipientDomain: recipientDomain(args.to),
        subject: args.subject,
        templateName: args.templateId,
        sentAt: new Date().toISOString(),
        providerMessageId: args.messageId,
        adminUserId: args.adminUserId,
        adminEmail: args.adminEmail,
        testMode: args.testMode,
      }),
      page_path: '/admin/outreach',
      referrer: null,
      user_agent: args.request.headers.get('user-agent'),
    });
  } catch {
    // Admin email sending should not depend on analytics storage.
  }
}

export function resetOutreachEmailRateLimitForTests(): void {
  outreachRateLimit.clear();
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const defaults = getOutreachDefaults();
  return NextResponse.json({
    defaults,
    templates: OUTREACH_TEMPLATES,
    resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
  });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  let body: OutreachSendInput;
  try {
    body = (await request.json()) as OutreachSendInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  const validation = validateOutreachSendInput(body, admin.user);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error, message: validation.message },
      { status: 400 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: 'missing_resend_api_key',
        message: 'RESEND_API_KEY is not configured for outreach email sending.',
      },
      { status: 503 },
    );
  }

  const rateKey = admin.userId || admin.email || 'unknown-admin';
  const rate = checkAdminOutreachRateLimit(rateKey);
  if (rate.limited) {
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        message: 'Too many outreach emails. Please wait before sending again.',
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSeconds) },
      },
    );
  }

  try {
    const result = await sendOutreachEmailWithResend({
      apiKey,
      to: validation.email.to,
      subject: validation.email.subject,
      body: validation.email.body,
      fromName: validation.email.fromName,
      fromEmail: validation.email.fromEmail,
      replyTo: validation.email.replyTo,
    });

    await recordOutreachSendEvent({
      adminUserId: admin.userId,
      adminEmail: admin.email,
      to: validation.email.to,
      subject: validation.email.subject,
      templateId: validation.email.templateId,
      messageId: result.id,
      testMode: validation.email.testMode,
      request,
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      testMode: validation.email.testMode,
      to: validation.email.to,
      recipientDomain: recipientDomain(validation.email.to),
      messageId: result.id,
    });
  } catch (error) {
    console.warn('[admin-outreach-email] send failed', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return NextResponse.json(
      {
        ok: false,
        error: 'send_failed',
        message: 'Email could not be sent. Check Resend configuration and sender verification.',
      },
      { status: 502 },
    );
  }
}
