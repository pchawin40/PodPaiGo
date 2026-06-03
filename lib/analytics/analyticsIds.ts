const ANONYMOUS_ID_KEY = 'podpaigo-analytics-anonymous-id';
const SESSION_ID_KEY = 'podpaigo-analytics-session-id';
const SESSION_STARTED_KEY = 'podpaigo-analytics-session-started';

const SESSION_MAX_AGE_MS = 30 * 60 * 1000;

function randomId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore quota or privacy mode errors.
  }
}

export function getOrCreateAnonymousId(storage: Storage = localStorage): string {
  const existing = readStorage(storage, ANONYMOUS_ID_KEY);
  if (existing?.trim()) return existing.trim();

  const created = randomId('anon');
  writeStorage(storage, ANONYMOUS_ID_KEY, created);
  return created;
}

export function getOrCreateSessionId(storage: Storage = sessionStorage): string {
  const existing = readStorage(storage, SESSION_ID_KEY);
  const startedRaw = readStorage(storage, SESSION_STARTED_KEY);
  const startedAt = startedRaw ? Number.parseInt(startedRaw, 10) : NaN;
  const isFresh =
    existing?.trim() &&
    Number.isFinite(startedAt) &&
    Date.now() - startedAt < SESSION_MAX_AGE_MS;

  if (isFresh && existing) return existing.trim();

  const created = randomId('sess');
  writeStorage(storage, SESSION_ID_KEY, created);
  writeStorage(storage, SESSION_STARTED_KEY, String(Date.now()));
  return created;
}
