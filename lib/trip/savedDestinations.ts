export type SavedDestinationAccessType =
  | 'free'
  | 'paid'
  | 'validated'
  | 'employee-only'
  | 'permit'
  | 'unknown';

export type SavedDestination = {
  id: string;
  label: string;
  destination: string;
  notes?: string | null;
  accessType: SavedDestinationAccessType;
  lat?: number;
  lng?: number;
  createdAt: string;
  updatedAt: string;
};

export const SAVED_DESTINATIONS_STORAGE_KEY = 'podpaigo-saved-destinations';
export const RECENT_DESTINATIONS_STORAGE_KEY = 'podpaigo-recent-destinations';
export const MAX_SAVED_DESTINATIONS = 24;
export const MAX_RECENT_DESTINATIONS = 8;

function createId(prefix: string): string {
  return crypto.randomUUID?.() ?? `${prefix}-${Date.now()}`;
}

export function readSavedDestinations(): SavedDestination[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(SAVED_DESTINATIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedDestination[]) : [];
  } catch {
    return [];
  }
}

export function writeSavedDestinations(destinations: SavedDestination[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      SAVED_DESTINATIONS_STORAGE_KEY,
      JSON.stringify(destinations.slice(0, MAX_SAVED_DESTINATIONS)),
    );
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function upsertSavedDestination(input: {
  label: string;
  destination: string;
  notes?: string | null;
  accessType?: SavedDestinationAccessType;
  lat?: number;
  lng?: number;
}): SavedDestination[] {
  const now = new Date().toISOString();
  const existing = readSavedDestinations();
  const normalizedDestination = input.destination.trim().toLowerCase();
  const found = existing.find(
    (item) => item.destination.trim().toLowerCase() === normalizedDestination,
  );

  if (found) {
    const next = existing.map((item) =>
      item.id === found.id
        ? {
            ...item,
            label: input.label.trim() || item.label,
            notes: input.notes ?? item.notes,
            accessType: input.accessType ?? item.accessType,
            lat: input.lat ?? item.lat,
            lng: input.lng ?? item.lng,
            updatedAt: now,
          }
        : item,
    );
    writeSavedDestinations(next);
    return next;
  }

  const created: SavedDestination = {
    id: createId('saved-destination'),
    label: input.label.trim() || input.destination.trim(),
    destination: input.destination.trim(),
    notes: input.notes ?? null,
    accessType: input.accessType ?? 'unknown',
    lat: input.lat,
    lng: input.lng,
    createdAt: now,
    updatedAt: now,
  };

  const next = [created, ...existing].slice(0, MAX_SAVED_DESTINATIONS);
  writeSavedDestinations(next);
  return next;
}

export function deleteSavedDestination(id: string): SavedDestination[] {
  const next = readSavedDestinations().filter((item) => item.id !== id);
  writeSavedDestinations(next);
  return next;
}

export function getRecentDestinations(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(RECENT_DESTINATIONS_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberRecentDestination(destination: string): void {
  if (typeof window === 'undefined') return;

  const trimmed = destination.trim();
  if (trimmed.length < 3) return;

  try {
    const recents = getRecentDestinations();
    const next = [trimmed, ...recents.filter((value) => value !== trimmed)].slice(
      0,
      MAX_RECENT_DESTINATIONS,
    );
    window.localStorage.setItem(RECENT_DESTINATIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private mode errors.
  }
}
