import { getAdminEmails } from '@/lib/auth/admin';
import { stripAnalyticsUrlQueryAndHash } from '@/lib/analytics/sanitizeAnalytics';
import type { BetaFeedbackPayload } from './betaFeedback';

type FeedbackEmailResult =
  | {
      sent: true;
      recipientCount: number;
      provider: 'resend';
    }
  | {
      sent: false;
      skipped: true;
      reason: 'missing_resend_config' | 'missing_admin_recipients';
      provider: 'resend';
    };

function readable(value: string | null | undefined): string {
  return value?.trim() || 'Not provided';
}

function formatFeedbackLot(payload: BetaFeedbackPayload): string {
  const name = payload.context.lotName?.trim();
  const id = payload.context.lotId?.trim();
  if (name && id) return `${name} (${id})`;
  return name || id || 'Not provided';
}

export function formatFeedbackEmailText(payload: BetaFeedbackPayload): string {
  const safePageUrl = payload.context.pageUrl
    ? stripAnalyticsUrlQueryAndHash(payload.context.pageUrl)
    : null;

  return [
    'PodPaiGo beta feedback received.',
    '',
    `Issue type: ${payload.issueType}`,
    '',
    'Message:',
    payload.message,
    '',
    `User submitted email: ${readable(payload.email)}`,
    `Page URL: ${readable(safePageUrl)}`,
    `Result type: ${readable(payload.context.resultType)}`,
    `Trip type: ${readable(payload.context.tripType)}`,
    `Provider: ${readable(payload.context.provider)}`,
    `Lot: ${formatFeedbackLot(payload)}`,
    `Timestamp: ${readable(payload.context.timestamp)}`,
    `User agent: ${readable(payload.context.userAgent)}`,
  ].join('\n');
}

export async function sendFeedbackAdminEmailNotification(
  payload: BetaFeedbackPayload,
  env: NodeJS.ProcessEnv = process.env,
): Promise<FeedbackEmailResult> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.FEEDBACK_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    return {
      sent: false,
      skipped: true,
      reason: 'missing_resend_config',
      provider: 'resend',
    };
  }

  const recipients = getAdminEmails(env.ADMIN_EMAILS);
  if (!recipients.length) {
    return {
      sent: false,
      skipped: true,
      reason: 'missing_admin_recipients',
      provider: 'resend',
    };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `[PodPaiGo Beta Feedback] ${payload.issueType}`,
      text: formatFeedbackEmailText(payload),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend feedback email failed ${response.status}: ${body.slice(0, 200)}`);
  }

  return {
    sent: true,
    recipientCount: recipients.length,
    provider: 'resend',
  };
}
