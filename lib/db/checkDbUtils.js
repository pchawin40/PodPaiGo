const PLACEHOLDER_PATTERNS = [
  '<PROJECT_REF>',
  '<PASSWORD>',
  'postgres.<PROJECT_REF>',
];

function resolveDatabaseUrl(env = process.env) {
  const primary = env.DATABASE_URL?.trim();
  if (primary) return primary;

  const fallback = env.LOCAL_DATABASE_URL?.trim();
  if (fallback) return fallback;

  return '';
}

function isPlaceholderUrl(url) {
  if (!url) return true;
  const normalized = url.trim();
  if (!normalized) return true;

  return PLACEHOLDER_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function sanitizeConnectionString(url) {
  if (!url) return '(missing)';

  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:([^:@/]+)@/, ':***@');
  }
}

function sslConfig(url) {
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    return false;
  }

  return { rejectUnauthorized: false };
}

module.exports = {
  PLACEHOLDER_PATTERNS,
  resolveDatabaseUrl,
  isPlaceholderUrl,
  sanitizeConnectionString,
  sslConfig,
};
