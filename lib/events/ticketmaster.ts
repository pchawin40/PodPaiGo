import type { EventParkingSignal } from '../types';

type LookupInput = {
  destinationName?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  parkingCheckInDate?: string | null;
  parkingCheckInTime?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  date?: string | null;
  time?: string | null;
  timezone?: string | null;
  now?: Date;
};

export type EventLookupTripDateTimeSource =
  | 'parking-window'
  | 'arrival'
  | 'trip-time'
  | 'now-fallback';

type TicketmasterEvent = {
  name?: string;
  url?: string;
  distance?: number;
  dates?: {
    start?: {
      localDate?: string;
      localTime?: string;
      dateTime?: string;
    };
  };
  _embedded?: {
    venues?: Array<{
      name?: string;
      location?: {
        latitude?: string;
        longitude?: string;
      };
    }>;
  };
};

type TicketmasterResponse = {
  _embedded?: {
    events?: TicketmasterEvent[];
  };
};

type CacheEntry = {
  expiresAt: number;
  value: EventParkingSignal | null;
};

const TICKETMASTER_EVENTS_URL = 'https://app.ticketmaster.com/discovery/v2/events.json';
const POSITIVE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 60 * 60 * 1000;
const eventLookupCache = new Map<string, CacheEntry>();
const eventLookupInFlight = new Map<string, Promise<EventParkingSignal | null>>();

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readRadiusMiles(): number {
  return readPositiveNumber(process.env.EVENT_LOOKUP_RADIUS_MILES, 0.5);
}

function readWindowHours(): number {
  return readPositiveNumber(process.env.EVENT_LOOKUP_TIME_WINDOW_HOURS, 4);
}

function roundCoordinate(value: number): string {
  return value.toFixed(3);
}

function parseLocalTripDateTime(date?: string | null, time?: string | null): Date | null {
  if (!date || !time) return null;
  const match = `${date}T${time}`.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return null;

  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || '0'),
    0,
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatLocalDate(value: Date): string {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function formatLocalTime(value: Date): string {
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
}

function validDateTime(date?: string | null, time?: string | null): boolean {
  return parseLocalTripDateTime(date, time) !== null;
}

export function resolveEventLookupTripDateTime(input: {
  parkingCheckInDate?: string | null;
  parkingCheckInTime?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  date?: string | null;
  time?: string | null;
  now?: Date;
}): {
  date: string | null;
  time: string | null;
  source: EventLookupTripDateTimeSource;
} {
  if (validDateTime(input.parkingCheckInDate, input.parkingCheckInTime)) {
    return {
      date: input.parkingCheckInDate || null,
      time: input.parkingCheckInTime || null,
      source: 'parking-window',
    };
  }

  if (validDateTime(input.arrivalDate, input.arrivalTime)) {
    return {
      date: input.arrivalDate || null,
      time: input.arrivalTime || null,
      source: 'arrival',
    };
  }

  if (validDateTime(input.date, input.time)) {
    return {
      date: input.date || null,
      time: input.time || null,
      source: 'trip-time',
    };
  }

  const now = input.now && !Number.isNaN(input.now.getTime()) ? input.now : new Date();
  return {
    date: formatLocalDate(now),
    time: formatLocalTime(now),
    source: 'now-fallback',
  };
}

function toTicketmasterDateTime(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildTimeWindow(target: Date, windowHours: number): { start: Date; end: Date } {
  const windowMs = windowHours * 60 * 60 * 1000;
  return {
    start: new Date(target.getTime() - windowMs),
    end: new Date(target.getTime() + windowMs),
  };
}

function buildCacheKey(input: {
  destinationLat: number;
  destinationLng: number;
  date: string;
  time: string;
  radiusMiles: number;
  windowHours: number;
}): string {
  return [
    roundCoordinate(input.destinationLat),
    roundCoordinate(input.destinationLng),
    input.date,
    input.time,
    input.radiusMiles,
    input.windowHours,
  ].join('|');
}

function pruneCache(now = Date.now()): void {
  for (const [key, entry] of eventLookupCache) {
    if (entry.expiresAt <= now) eventLookupCache.delete(key);
  }

  while (eventLookupCache.size > 250) {
    const oldestKey = eventLookupCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    eventLookupCache.delete(oldestKey);
  }
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameSimilarityScore(destinationName: string | null | undefined, venueName: string | null | undefined): number {
  const destination = normalizeName(destinationName);
  const venue = normalizeName(venueName);
  if (!destination || !venue) return 0;
  if (destination === venue) return 5;
  if (destination.includes(venue) || venue.includes(destination)) return 4;

  const destinationTokens = new Set(destination.split(' ').filter((token) => token.length > 2));
  const venueTokens = venue.split(' ').filter((token) => token.length > 2);
  const overlap = venueTokens.filter((token) => destinationTokens.has(token)).length;

  return overlap >= 2 ? 3 : overlap === 1 ? 1 : 0;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function distanceMilesBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const earthRadiusMiles = 3958.8;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function eventLocalDateTime(event: TicketmasterEvent): Date | null {
  const localDate = event.dates?.start?.localDate;
  const localTime = event.dates?.start?.localTime || '00:00:00';
  if (!localDate) return null;

  const parsed = parseLocalTripDateTime(localDate, localTime.slice(0, 5));
  if (parsed) return parsed;

  const dateTime = event.dates?.start?.dateTime;
  if (!dateTime) return null;
  const fallback = new Date(dateTime);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function formatEventStartLocal(event: TicketmasterEvent): string | undefined {
  const localDate = event.dates?.start?.localDate;
  const localTime = event.dates?.start?.localTime;
  if (!localDate) return undefined;

  const parsed = parseLocalTripDateTime(localDate, (localTime || '00:00').slice(0, 5));
  if (!parsed) return localTime ? `${localDate} ${localTime.slice(0, 5)}` : localDate;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: localTime ? 'numeric' : undefined,
    minute: localTime ? '2-digit' : undefined,
  }).format(parsed);
}

function scoreTicketmasterEvent(input: {
  event: TicketmasterEvent;
  destinationName?: string | null;
  destinationLat: number;
  destinationLng: number;
  radiusMiles: number;
  targetTime: Date;
  windowHours: number;
}): { score: number; distanceMiles: number | null; venueName: string | undefined } {
  const venue = input.event._embedded?.venues?.[0];
  const venueName = venue?.name;
  const venueLat = toNumber(venue?.location?.latitude);
  const venueLng = toNumber(venue?.location?.longitude);
  const eventDistance = toNumber(input.event.distance);
  const computedDistance =
    venueLat !== null && venueLng !== null
      ? distanceMilesBetween(
          { lat: input.destinationLat, lng: input.destinationLng },
          { lat: venueLat, lng: venueLng },
        )
      : null;
  const distanceMiles = eventDistance ?? computedDistance;
  const start = eventLocalDateTime(input.event);
  const startDeltaHours = start
    ? Math.abs(start.getTime() - input.targetTime.getTime()) / (60 * 60 * 1000)
    : null;

  let score = nameSimilarityScore(input.destinationName, venueName);
  if (distanceMiles !== null && distanceMiles <= input.radiusMiles) score += 4;
  if (distanceMiles !== null && distanceMiles <= input.radiusMiles * 2) score += 1;
  if (startDeltaHours !== null && startDeltaHours <= input.windowHours) score += 3;

  return { score, distanceMiles, venueName };
}

function warningCopyForEvent(eventName: string, venueName?: string, startLocal?: string): string {
  const where = venueName ? ` at ${venueName}` : '';
  const when = startLocal ? ` starts around ${startLocal}` : ' is scheduled near your trip time';

  return `${eventName}${where}${when}. Street and meter parking may be restricted, full, or tow-enforced. Official/prepaid lots, transit, or rideshare may be safer.`;
}

function normalizeTicketmasterResponse(input: {
  response: TicketmasterResponse;
  destinationName?: string | null;
  destinationLat: number;
  destinationLng: number;
  radiusMiles: number;
  targetTime: Date;
  windowHours: number;
}): EventParkingSignal | null {
  const events = input.response._embedded?.events?.slice(0, 5) ?? [];
  if (events.length === 0) return null;

  const scored = events
    .map((event) => ({
      event,
      ...scoreTicketmasterEvent({ ...input, event }),
    }))
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best?.event.name) return null;

  const eventStartLocal = formatEventStartLocal(best.event);
  const confidence: EventParkingSignal['confidence'] =
    best.score >= 8 ? 'high' : best.score >= 5 ? 'medium' : 'low';

  return {
    source: 'ticketmaster',
    status: 'confirmed-event',
    eventName: best.event.name,
    venueName: best.venueName,
    eventStartLocal,
    eventUrl: best.event.url,
    distanceMiles:
      best.distanceMiles !== null ? Math.round(best.distanceMiles * 100) / 100 : undefined,
    confidence,
    warningCopy: warningCopyForEvent(best.event.name, best.venueName, eventStartLocal),
  };
}

async function fetchTicketmasterEvents(input: {
  apiKey: string;
  destinationName?: string | null;
  destinationLat: number;
  destinationLng: number;
  radiusMiles: number;
  targetTime: Date;
  windowHours: number;
}): Promise<EventParkingSignal | null> {
  const window = buildTimeWindow(input.targetTime, input.windowHours);
  const url = new URL(TICKETMASTER_EVENTS_URL);

  url.searchParams.set('apikey', input.apiKey);
  url.searchParams.set('latlong', `${input.destinationLat},${input.destinationLng}`);
  url.searchParams.set('radius', String(input.radiusMiles));
  url.searchParams.set('unit', 'miles');
  url.searchParams.set('size', '5');
  url.searchParams.set('sort', 'date,asc');
  url.searchParams.set('startDateTime', toTicketmasterDateTime(window.start));
  url.searchParams.set('endDateTime', toTicketmasterDateTime(window.end));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const body = (await response.json()) as TicketmasterResponse;
    return normalizeTicketmasterResponse({
      response: body,
      destinationName: input.destinationName,
      destinationLat: input.destinationLat,
      destinationLng: input.destinationLng,
      radiusMiles: input.radiusMiles,
      targetTime: input.targetTime,
      windowHours: input.windowHours,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupTicketmasterEventsNearTrip(
  input: LookupInput,
): Promise<EventParkingSignal | null> {
  if (process.env.ENABLE_EVENT_LOOKUP !== 'true') return null;

  const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
  if (!apiKey) return null;

  const destinationLat = toNumber(input.destinationLat);
  const destinationLng = toNumber(input.destinationLng);
  if (destinationLat === null || destinationLng === null) return null;

  const resolvedDateTime = resolveEventLookupTripDateTime(input);
  const targetTime = parseLocalTripDateTime(resolvedDateTime.date, resolvedDateTime.time);
  if (!targetTime) return null;

  const radiusMiles = readRadiusMiles();
  const windowHours = readWindowHours();
  const cacheKey = buildCacheKey({
    destinationLat,
    destinationLng,
    date: resolvedDateTime.date || '',
    time: resolvedDateTime.time || '',
    radiusMiles,
    windowHours,
  });
  const now = Date.now();

  pruneCache(now);
  const cached = eventLookupCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;

  const existing = eventLookupInFlight.get(cacheKey);
  if (existing) return existing;

  const promise = fetchTicketmasterEvents({
    apiKey,
    destinationName: input.destinationName,
    destinationLat,
    destinationLng,
    radiusMiles,
    targetTime,
    windowHours,
  })
    .then((signal) => {
      eventLookupCache.set(cacheKey, {
        expiresAt: Date.now() + (signal ? POSITIVE_CACHE_TTL_MS : EMPTY_CACHE_TTL_MS),
        value: signal,
      });
      pruneCache();
      return signal;
    })
    .catch(() => null)
    .finally(() => {
      eventLookupInFlight.delete(cacheKey);
    });

  eventLookupInFlight.set(cacheKey, promise);
  return promise;
}

export function resetTicketmasterEventCacheForTests(): void {
  eventLookupCache.clear();
  eventLookupInFlight.clear();
}
