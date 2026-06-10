const MAX_STRING_LENGTH = 200;
export const MAX_ANALYTICS_PROPERTIES_JSON_LENGTH = 6000;

const ALLOWED_PROPERTY_KEYS = new Set([
  'eventName',
  'timestamp',
  'sessionId',
  'anonymousId',
  'airportCode',
  'resultType',
  'destinationCategory',
  'provider',
  'lotId',
  'lotName',
  'parkingLotId',
  'parkingLotName',
  'rank',
  'index',
  'priceTotal',
  'priceLabel',
  'driveToLotMinutes',
  'walkMinutes',
  'sourcePage',
  'requestSource',
  'cacheStatus',
  'cacheKey',
  'windowMs',
  'retryAfterSeconds',
  'mode',
  'sort',
  'preference',
  'city',
  'region',
  'country',
  'tripType',
  'intent',
  'surface',
  'ctaType',
  'reportType',
  'message',
  'pageUrl',
  'pagePath',
  'userAgent',
  'resultId',
  'resultName',
  'accessType',
  'originSource',
  'destinationSource',
  'configuredProvider',
  'liveProviderActive',
  'confirmed',
  'hasUser',
  'savedCount',
  'originTextSafe',
  'ctaType',
]);

const SENSITIVE_KEY_PATTERN =
  /(email|e-mail|phone|tel|mobile|password|secret|token|api[_-]?key|authorization|bearer|ssn|passport)/i;

const EMAIL_VALUE_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_VALUE_PATTERN = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const TOKEN_VALUE_PATTERN = /\b(?:sk|pk|rk)_[a-z0-9]{10,}\b/i;

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function estimateJsonLength(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return MAX_ANALYTICS_PROPERTIES_JSON_LENGTH + 1;
  }
}

export function stripAnalyticsUrlQueryAndHash(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    return `${url.origin}${url.pathname}`;
  } catch {
    const [withoutHash] = trimmed.split('#');
    return (withoutHash || '').split('?')[0] || '';
  }
}

function sanitizeValue(key: string, value: unknown, originTextAllowed: boolean): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(key)) return undefined;
    if (EMAIL_VALUE_PATTERN.test(value)) return undefined;
    if (PHONE_VALUE_PATTERN.test(value)) return undefined;
    if (TOKEN_VALUE_PATTERN.test(value)) return undefined;
    if ((key === 'originText' || key === 'destinationText') && !originTextAllowed) {
      return '[redacted]';
    }
    if (key === 'pageUrl' || key === 'pagePath') {
      return truncateString(stripAnalyticsUrlQueryAndHash(value));
    }
    return truncateString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeValue(key, item, originTextAllowed))
      .filter((item) => item !== undefined);
  }

  if (isPlainObject(value)) {
    return sanitizeAnalyticsProperties(value, originTextAllowed);
  }

  return undefined;
}

export function sanitizeAnalyticsProperties(
  input: Record<string, unknown> | null | undefined,
  forceOriginTextSafe = false,
): Record<string, unknown> {
  if (!input || !isPlainObject(input)) return {};
  if (estimateJsonLength(input) > MAX_ANALYTICS_PROPERTIES_JSON_LENGTH) return {};

  const originTextAllowed = forceOriginTextSafe || input.originTextSafe === true;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (!ALLOWED_PROPERTY_KEYS.has(key) && key !== 'originText' && key !== 'destinationText') {
      continue;
    }

    const next = sanitizeValue(key, value, originTextAllowed);
    if (next !== undefined) {
      sanitized[key] = next;
    }
  }

  if (sanitized.originTextSafe === true) {
    delete sanitized.originTextSafe;
  }

  return sanitized;
}
