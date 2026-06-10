import { stripAnalyticsUrlQueryAndHash } from '@/lib/analytics/sanitizeAnalytics';

export const BETA_FEEDBACK_TYPES = [
  'wrong_price',
  'wrong_route_time',
  'parking_lot_issue',
  'review_issue',
  'app_bug',
  'other',
] as const;

export type BetaFeedbackType = (typeof BETA_FEEDBACK_TYPES)[number];

export type BetaFeedbackPayload = {
  issueType: BetaFeedbackType;
  message: string;
  email: string | null;
  context: {
    pageUrl: string | null;
    pagePath: string | null;
    resultType: string | null;
    tripType: string | null;
    airportCode: string | null;
    provider: string | null;
    lotId: string | null;
    lotName: string | null;
    timestamp: string;
    userAgent: string | null;
  };
};

const FEEDBACK_TYPE_SET = new Set<string>(BETA_FEEDBACK_TYPES);
const MAX_MESSAGE_LENGTH = 2000;
const MAX_EMAIL_LENGTH = 254;
const MAX_CONTEXT_STRING_LENGTH = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(value: unknown, maxLength = MAX_CONTEXT_STRING_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function readIssueType(value: unknown): BetaFeedbackType | null {
  const type = readString(value, 80);
  return type && FEEDBACK_TYPE_SET.has(type) ? (type as BetaFeedbackType) : null;
}

function readEmail(value: unknown): string | null {
  const email = readString(value, MAX_EMAIL_LENGTH);
  if (!email) return null;
  return EMAIL_PATTERN.test(email) ? email : null;
}

function readSafeUrl(value: unknown): string | null {
  const url = readString(value);
  if (!url) return null;
  return stripAnalyticsUrlQueryAndHash(url) || null;
}

export function validateBetaFeedbackPayload(
  body: unknown,
  requestUserAgent: string | null,
): BetaFeedbackPayload | null {
  if (!body || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  const issueType = readIssueType(record.issueType ?? record.issue_type);
  const message = readString(record.message, MAX_MESSAGE_LENGTH);

  if (!issueType || !message) return null;

  const context =
    record.context && typeof record.context === 'object' && !Array.isArray(record.context)
      ? (record.context as Record<string, unknown>)
      : {};

  const timestamp = readString(context.timestamp, 80) || new Date().toISOString();

  return {
    issueType,
    message,
    email: readEmail(record.email),
    context: {
      pageUrl: readSafeUrl(context.pageUrl),
      pagePath: readSafeUrl(context.pagePath),
      resultType: readString(context.resultType, 80),
      tripType: readString(context.tripType, 80),
      airportCode: readString(context.airportCode, 12)?.toUpperCase() ?? null,
      provider: readString(context.provider, 160),
      lotId: readString(context.lotId, 160),
      lotName: readString(context.lotName, 240),
      timestamp,
      userAgent: readString(context.userAgent, 500) || requestUserAgent,
    },
  };
}

export function betaFeedbackToAnalyticsProperties(payload: BetaFeedbackPayload) {
  return {
    reportType: payload.issueType,
    message: payload.message,
    email: payload.email,
    pageUrl: payload.context.pageUrl,
    pagePath: payload.context.pagePath,
    resultType: payload.context.resultType,
    tripType: payload.context.tripType,
    airportCode: payload.context.airportCode,
    provider: payload.context.provider,
    lotId: payload.context.lotId,
    lotName: payload.context.lotName,
    timestamp: payload.context.timestamp,
    userAgent: payload.context.userAgent,
    sourcePage: 'results',
  };
}
