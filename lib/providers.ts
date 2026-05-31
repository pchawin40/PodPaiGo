import {
  DestinationKind,
  ParkingOption,
  RideshareOption,
  TransitJourney,
  TrafficEstimate,
  FlightInfo,
  LocationInfo,
  TsaEstimate,
  SecurityOption,
} from './types';
import { mockTrafficEstimates, mockFlightInfo, mockLocationInfo } from '../data/mockData';
import { AIRPORTS_CATALOG, getAirportById } from './airports/catalog';
import { RoutesApiElement, RoutesApiResponse } from '../lib/parking/provider';
import { getAirportTsaEstimate } from './airports/tsa/provider';
import { DEFAULT_ROUTE_UNAVAILABLE_REASON } from './parking/routeStatus';
import { buildRideshareEstimateOptions } from './rideshare/estimate';



// Startup log for server-side API key presence (do not log the key itself)
// try {
//   const _present = !!process.env.GOOGLE_MAPS_SERVER_API_KEY;
//   console.log('Google Maps server key detected:', _present ? 'yes' : 'no');
// } catch (e) {
//   // ignore
// }

// Data-driven approach to determine transit hubs for non-direct rail origins

// Small dataset for WA-focused transit hubs (MVP)
const transitHubs = [
  { name: 'Northgate Transit Center', driveTimeFactor: 30, transitTime: 45, isParkAndRide: false },
  { name: 'Lynnwood Transit Center', driveTimeFactor: 40, transitTime: 55, isParkAndRide: true },
  { name: 'Tukwila International Blvd Station', driveTimeFactor: 50, transitTime: 55, isParkAndRide: false },
  { name: 'Angle Lake Station', driveTimeFactor: 55, transitTime: 60, isParkAndRide: true },
];

function parseGoogleDurationToMinutes(value: unknown): number | null {
  if (typeof value === 'string') {
    const match = value.match(/^(\d+(?:\.\d+)?)s$/);
    if (match) {
      return Math.ceil(Number(match[1]) / 60);
    }
  }

  if (typeof value === 'number') {
    return Math.ceil(value / 60);
  }

  if (
    value &&
    typeof value === 'object' &&
    'value' in value &&
    typeof (value as { value?: unknown }).value === 'number'
  ) {
    return Math.ceil((value as { value: number }).value / 60);
  }

  return null;
}

function resolveAirportDestinationForRouting(destinationKey: string): string {
  const lower = destinationKey.toLowerCase();

  if (lower.includes('jfk') || lower.includes('john f. kennedy')) {
    return 'John F. Kennedy International Airport (JFK), Queens, NY 11430';
  }

  if (lower.includes('lax') || lower.includes('los angeles international')) {
    return 'Los Angeles International Airport (LAX), 1 World Way, Los Angeles, CA 90045';
  }

  if (
    lower.includes('central terminal') ||
    lower.includes('north satellite') ||
    lower.includes('south satellite') ||
    lower.includes('terminal') ||
    lower.includes('satellite') ||
    lower.includes('sea-tac') ||
    lower.includes('seatac') ||
    lower.includes('seattle-tacoma')
  ) {
    return 'Seattle-Tacoma International Airport (SEA), 17801 International Blvd, SeaTac, WA 98158';
  }

  return destinationKey;
}

function resolveAirportFromDestination(destination: string, airportCode?: string) {
  const explicitAirport = airportCode ? getAirportById(airportCode.toUpperCase()) : null;
  if (explicitAirport) return explicitAirport;

  const raw = String(destination || '').trim();
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  // Direct airport code, like "SEA" or "BLI"
  const direct = getAirportById(upper);
  if (direct) return direct;

  // Airport code inside destination string, like "Bellingham International Airport (BLI)"
  const codeMatch = upper.match(/\(([A-Z]{3})\)/);
  if (codeMatch) {
    const byCodeInParentheses = getAirportById(codeMatch[1]);
    if (byCodeInParentheses) return byCodeInParentheses;
  }

  // Dynamic catalog match by label, destination name, routing address, or rideshare name.
  const matched = AIRPORTS_CATALOG.find((airport) => {
    const values = [
      airport.id,
      airport.label,
      airport.destinationName,
      airport.routingAddress,
      airport.rideshareDestinationName,
    ];

    return values.some((value) => {
      const airportText = String(value || '').toLowerCase();
      return airportText && (lower.includes(airportText) || airportText.includes(lower));
    });
  });

  return matched || null;
}

function normalizeTrafficRoute(origin: string, destination: string): string {
  const normalizedOrigin = origin.toLowerCase();
  const normalizedDestination = destination.toLowerCase();

  if (normalizedDestination.includes('terminal') || normalizedDestination.includes('satellite') || normalizedDestination.includes('sea-tac') || normalizedDestination.includes('airport')) {
    return 'home-airport';
  }

  if (normalizedOrigin.includes('terminal') || normalizedOrigin.includes('satellite') || normalizedOrigin.includes('sea-tac') || normalizedOrigin.includes('airport')) {
    return 'airport-home';
  }

  return `${origin}-${destination}`;
}

function extractRouteStateHint(value: string): string | null {
  const text = ` ${value.toUpperCase()} `;

  const states = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
    'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
  ];

  for (const state of states) {
    const pattern = new RegExp(`\\b${state}\\b`);
    if (pattern.test(text)) return state;
  }

  const lower = value.toLowerCase();

  if (lower.includes('washington')) return 'WA';
  if (lower.includes('hawaii') || lower.includes('honolulu') || lower.includes('oahu')) return 'HI';
  if (lower.includes('california')) return 'CA';
  if (lower.includes('new york')) return 'NY';
  if (lower.includes('oregon')) return 'OR';
  if (lower.includes('idaho')) return 'ID';

  return null;
}

function isClearlyNonDrivableRoute(origin: string, destination: string): boolean {
  const originState = extractRouteStateHint(origin);
  const destinationState = extractRouteStateHint(destination);

  return Boolean(
    originState &&
    destinationState &&
    originState !== destinationState &&
    (originState === 'HI' || destinationState === 'HI')
  );
}

function unavailableTrafficEstimate(
  route: string,
  sourceName: string,
  reason: string
): TrafficEstimate {
  return {
    route,
    duration: 0,
    congestion: 'high',
    trustStatus: 'fallback',
    routeUnavailable: true,
    routeUnavailableReason: reason,
    sourceName,
    lastUpdated: new Date().toISOString(),
    assumptions: [reason],
  };
}

function resolveParkingTransferMeta(option: ParkingOption): {
  parkingBufferMinutes: number;
  transferToTerminalMinutes: number;
  transferType: 'walk' | 'shuttle' | 'airport-garage';
} {
  const id = (option.id || '').toLowerCase();
  const name = (option.name || '').toLowerCase();

  const isReserved = id === 'sea-reserved' || name.includes('reserved');
  if (isReserved) {
    return { parkingBufferMinutes: 5, transferToTerminalMinutes: 3, transferType: 'walk' };
  }

  const isGeneral = id === 'sea-general' || name.includes('general');
  if (isGeneral) {
    return { parkingBufferMinutes: 8, transferToTerminalMinutes: 5, transferType: 'walk' };
  }

  const isWally = id.includes('wally') || name.includes('wally');
  if (isWally) {
    return { parkingBufferMinutes: 10, transferToTerminalMinutes: 12, transferType: 'shuttle' };
  }

  const isMaster = id.includes('master') || name.includes('master');
  if (isMaster) {
    return { parkingBufferMinutes: 10, transferToTerminalMinutes: 12, transferType: 'shuttle' };
  }

  if (option.type === 'off-airport') {
    return { parkingBufferMinutes: 10, transferToTerminalMinutes: 12, transferType: 'shuttle' };
  }

  // Default for official/other: short buffer + walk/garage to terminal.
  return { parkingBufferMinutes: 8, transferToTerminalMinutes: 5, transferType: 'walk' };
}

type ParkingOptionsRequestContext = {
  destinationKind?: DestinationKind;
  airportCode?: string;
  destinationLat?: number;
  destinationLng?: number;
};

export interface TrafficProvider {
  getTrafficEstimate(origin: string, destination: string, dateTime: string): Promise<TrafficEstimate>;
}

export interface ParkingProvider {
  getParkingOptions(
    origin: string,
    destination: string,
    dateTime: string,
    parkingDurationMinutes?: number,
    context?: ParkingOptionsRequestContext
  ): Promise<ParkingOption[]>;
}

export interface FlightProvider {
  getFlightInfo(destination: string, dateTime: string): Promise<FlightInfo>;
}

export interface TsaProvider {
  getTsaEstimate(
    destination: string,
    securityOption?: SecurityOption,
    plannedAirportArrivalAt?: string
  ): Promise<TsaEstimate>;
}

export interface AirportInfoProvider {
  getAirportInfo(destination: string): Promise<LocationInfo>;
}

export interface DataProvider extends TrafficProvider, ParkingProvider, FlightProvider, TsaProvider, AirportInfoProvider {
  getRideshareOptions(origin: string, destination: string, dateTime: string): Promise<RideshareOption[]>;
  getTransitOptions(origin: string, destination: string, dateTime: string): Promise<TransitJourney[]>;
  getParkingOptions(
    origin: string,
    destination: string,
    dateTime: string,
    parkingDurationMinutes?: number,
    context?: ParkingOptionsRequestContext
  ): Promise<ParkingOption[]>;
}

export class MockTrafficProvider implements TrafficProvider {
  async getTrafficEstimate(origin: string, destination: string, dateTime: string): Promise<TrafficEstimate> {
    const route = normalizeTrafficRoute(origin, destination);
    if (isClearlyNonDrivableRoute(origin, destination)) {
      return unavailableTrafficEstimate(
        route,
        'Route validation',
        'Route unavailable from this origin to the airport area.'
      );
    }

    // Mock traffic data
    return mockTrafficEstimates[route] || {
      route,
      duration: 25,
      congestion: 'medium',
      trustStatus: 'estimated',
      sourceName: 'Mock traffic model',
      lastUpdated: new Date().toISOString(),
      assumptions: ['Fallback estimate', 'Based on typical traffic patterns'],
    };
  }
}

// Simple in-memory cache for route estimates
const ROUTE_CACHE = new Map<string, { ts: number; estimate: TrafficEstimate }>();
const ROUTE_INFLIGHT = new Map<string, Promise<TrafficEstimate>>();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const DEFAULT_INITIAL_LIVE_PARKING_ROUTE_LIMIT = 6;

function normalizeRouteCachePart(value: string): string {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase();

  if (
    raw.toUpperCase() === 'SEA' ||
    lower.includes('seattle-tacoma international airport') ||
    lower.includes('seatac airport') ||
    lower.includes('sea-tac airport') ||
    lower.includes('17801 international blvd')
  ) {
    return 'sea airport';
  }

  return lower
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function initialLiveParkingRouteLimit(): number {
  const configured = Number(process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT);
  if (Number.isFinite(configured) && configured >= 0) return Math.floor(configured);

  return DEFAULT_INITIAL_LIVE_PARKING_ROUTE_LIMIT;
}

function buildRouteEstimateCacheKey(args: {
  origin: string;
  destination: string;
  dateTime: string;
  mode?: string;
}): string {
  return [
    args.mode || 'DRIVE',
    normalizeRouteCachePart(args.origin),
    normalizeRouteCachePart(args.destination),
    String(args.dateTime || '').trim(),
  ].join('|');
}

function hashCacheKey(input: string): string {
  // Non-cryptographic hash for log correlation without leaking address strings.
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function getCachedRouteEstimate(cacheKey: string): TrafficEstimate | null {
  const cached = ROUTE_CACHE.get(cacheKey);

  if (!cached) return null;

  if (Date.now() - cached.ts >= CACHE_TTL_MS) {
    ROUTE_CACHE.delete(cacheKey);
    return null;
  }

  return cached.estimate;
}

function cacheRouteEstimate(cacheKey: string, estimate: TrafficEstimate): TrafficEstimate {
  ROUTE_CACHE.set(cacheKey, { ts: Date.now(), estimate });
  return estimate;
}

function logRoutesApiCache(
  message: 'Routes API cache hit' | 'Routes API in-flight hit' | 'Routes API fetch',
  cacheKey: string,
  routeLabel: string
) {
  if (process.env.NODE_ENV !== 'development') return;

  console.log(message, {
    id: hashCacheKey(cacheKey),
    route: routeLabel,
  });
}

export class LiveTrafficProvider implements TrafficProvider {
  private serverKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

  private async geocodeLatLng(address: string): Promise<{ lat: number, lng: number } | null> {
    try {
      if (!this.serverKey) return null;
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.serverKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        return { lat: loc.lat, lng: loc.lng };
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  async getTrafficEstimate(origin: string, destination: string, dateTime: string): Promise<TrafficEstimate> {
    // dateTime can be undefined at runtime (e.g., tests). Default to "now" to keep routing functional.
    const resolvedDateTime = (dateTime ?? new Date().toISOString());
    const cacheKey = buildRouteEstimateCacheKey({
      origin,
      destination,
      dateTime: resolvedDateTime,
      mode: 'DRIVE',
    });
    const routeKey = normalizeTrafficRoute(origin, destination);
    const routeLabel = routeKey === 'home-airport' || routeKey === 'airport-home' ? routeKey : 'custom';

    try {
      if (isClearlyNonDrivableRoute(origin, destination)) {
        return unavailableTrafficEstimate(
          routeKey,
          'Route validation',
          'Route unavailable from this origin to the airport area.'
        );
      }

      if (!this.serverKey) {
        throw new Error('Google Maps server API key not configured');
      }

      const cached = getCachedRouteEstimate(cacheKey);
      if (cached) {
        logRoutesApiCache('Routes API cache hit', cacheKey, routeLabel);
        return cached;
      }

      const existingInFlight = ROUTE_INFLIGHT.get(cacheKey);
      if (existingInFlight) {
        logRoutesApiCache('Routes API in-flight hit', cacheKey, routeLabel);
        return await existingInFlight;
      }

      const inflightPromise = (async () => {
        // Geocode origin and destination where possible
        const [originLatLng, destLatLng] = await Promise.all([
          this.geocodeLatLng(origin),
          this.geocodeLatLng(destination),
        ]);

        // Prepare computeRouteMatrix request body
        const departureTimeSeconds = Math.max(0, Math.floor(new Date(resolvedDateTime).getTime() / 1000));

        const body: {
          travelMode: string;
          routingPreference: string;
          origins: unknown[];
          destinations: unknown[];
          regionCode: string;
          departureTime: string;
        } = {
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          origins: [],
          destinations: [],
          // regionCode helps routing in ambiguous areas
          regionCode: 'US',
          departureTime: new Date(resolvedDateTime).toISOString(),
        };

        if (originLatLng) {
          body.origins.push({ waypoint: { location: { latLng: { latitude: originLatLng.lat, longitude: originLatLng.lng } } } });
        } else {
          // fallback to textual origin
          body.origins.push({ waypoint: { address: origin } });
        }

        if (destLatLng) {
          body.destinations.push({ waypoint: { location: { latLng: { latitude: destLatLng.lat, longitude: destLatLng.lng } } } });
        } else {
          body.destinations.push({ waypoint: { address: destination } });
        }

        const url = `https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.serverKey!,
          'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,staticDuration,distanceMeters,status,condition',
        };

        logRoutesApiCache('Routes API fetch', cacheKey, routeLabel);

        // Perform the network call
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        // Log which key type we're using for this request (server/browser/none)
        const keyType = this.serverKey ? 'server' : (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'browser' : 'none');
        if (process.env.NODE_ENV === 'development') {
          console.log('Google Routes matrix request using key type:', keyType);
        }

        // Read as text first because the computeRouteMatrix can stream / ndjson
        const text = await res.text();

        // Safe debug logging (no key)
        // if (process.env.NODE_ENV === 'development') {
        //   console.log('Google Routes API HTTP status:', res.status);
        //   console.log('Google Routes API response snippet:', text ? text.slice(0, 500) : '[empty]');
        // }

        if (!text) {
          throw new Error('Empty response from Routes API');
        }

        let data: RoutesApiResponse | RoutesApiElement[] | null = null;
        try {
          data = JSON.parse(text);
        } catch (e) {
          // Try to parse newline-delimited JSON: take the last parsable line
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            try {
              const parsed = JSON.parse(line);
              // prefer an object with rows or matrix
              if (parsed && (parsed.rows || parsed.matrix || Array.isArray(parsed))) {
                data = parsed;
                break;
              }
              if (!data) data = parsed;
            } catch (_) {
              // continue
            }
          }
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('Parsed Routes API data (shallow):', data ? (Array.isArray(data) ? 'array' : (data.rows || data.matrix ? 'has rows/matrix' : typeof data)) : 'null');
        }

        // Support multiple response shapes: array, object.rows, object.matrix.rows
        let element: RoutesApiElement | null = null;

        if (Array.isArray(data) && data.length > 0) {
          // dataset is array of elements
          element = data[0];
        } else {
          const responseData = data as RoutesApiResponse;
          const rows = responseData.rows ?? responseData.matrix?.rows ?? null;

          if (!rows) {
            throw new Error(`Invalid Routes API response: ${responseData.error?.message || 'no rows'}`);
          }

          element = rows[0]?.elements?.[0] ?? null;
        }

        if (!element) {
          throw new Error('Invalid Routes API response: no route element');
        }

        const durationValue: number | undefined =
          typeof element.duration === 'object' && element.duration !== null
            ? element.duration.value
            : undefined;

        // Acceptance logic: treat success when HTTP 200, condition === 'ROUTE_EXISTS', duration present,
        // and status is empty object / missing / or string 'OK'. Treat failure only when explicit errors or condition mismatch.
        const condition = element?.condition;
        const statusField = element?.status;
        const statusIsEmptyObject = statusField && typeof statusField === 'object' && Object.keys(statusField).length === 0;
        const statusIsOkString = typeof statusField === 'string' && statusField.toUpperCase() === 'OK';
        const statusAcceptable = statusField === undefined || statusField === null || statusIsEmptyObject || statusIsOkString;

        // check for duration presence in various formats
        let hasDuration = false;
        if (typeof element?.durationMillis === 'number') hasDuration = true;
        else if (element?.duration && typeof element.duration === 'string' && /^\d+s$/.test(element.duration)) hasDuration = true;
        else if (element?.duration && typeof durationValue === 'number') hasDuration = true;
        else if (element?.staticDuration) hasDuration = true;

        if (res.status === 200 && condition && condition !== 'ROUTE_EXISTS') {
          return cacheRouteEstimate(
            cacheKey,
            unavailableTrafficEstimate(
              routeKey,
              'Google Routes API',
              'Google Routes could not calculate a driving route for this origin and destination.'
            )
          );
        }

        if (!(res.status === 200 && condition === 'ROUTE_EXISTS' && hasDuration && statusAcceptable)) {
          throw new Error(`Routes API element indicates failure: condition=${String(condition)}, status=${statusIsEmptyObject ? '[empty object]' : String(statusField)}, durationPresent=${hasDuration}`);
        }

        // duration may be in different forms. Handle strings like "2259s" or durationMillis or duration.value
        let durationMs: number | null = null;

        if (typeof element.durationMillis === 'number') {
          durationMs = element.durationMillis;
        } else if (typeof element.duration === 'string') {
          const m = element.duration.match(/^(\d+)s$/);
          if (m) durationMs = parseInt(m[1], 10) * 1000;
        } else if (element.duration && typeof durationValue === 'number') {
          durationMs = durationValue * 1000;
        } else if (typeof element.staticDuration === 'string') {
          const m = element.staticDuration.match(/^(\d+)s$/);
          if (m) durationMs = parseInt(m[1], 10) * 1000;
        } else if (element.staticDuration && typeof element.staticDuration === 'number') {
          durationMs = element.staticDuration;
        }

        if (durationMs == null) {
          throw new Error('No duration available from Routes API');
        }

        const durationMinutes =
          parseGoogleDurationToMinutes(element.duration) ??
          parseGoogleDurationToMinutes(element.staticDuration);

        if (durationMinutes == null) {
          throw new Error(
            `No usable duration from Routes API. duration=${JSON.stringify(
              element.duration
            )}, staticDuration=${JSON.stringify(element.staticDuration)}`
          );
        }

        const staticDurationMinutes =
          parseGoogleDurationToMinutes(element.staticDuration) ?? undefined;

        // Heuristic congestion: compare traffic-aware duration vs staticDuration if available
        let congestion: 'low' | 'medium' | 'high' = 'medium';

        if (staticDurationMinutes && durationMinutes) {
          const ratio = durationMinutes / staticDurationMinutes;
          if (ratio < 1.2) congestion = 'low';
          else if (ratio < 1.5) congestion = 'medium';
          else congestion = 'high';
        }

        let staticMs: number | null = null;
        if (typeof element.staticDuration === 'string') {
          const m = element.staticDuration.match(/^(\d+)s$/);
          if (m) staticMs = parseInt(m[1], 10) * 1000;
        } else if (typeof element.staticDuration === 'number') {
          staticMs = element.staticDuration;
        } else if (element.duration && typeof durationValue === 'number' && typeof element.durationMillis === 'number') {
          staticMs = durationValue * 1000;
        }

        if (staticMs && durationMs) {
          const ratio = durationMs / (staticMs || durationMs);
          if (ratio < 1.2) congestion = 'low';
          else if (ratio < 1.5) congestion = 'medium';
          else congestion = 'high';
        }

        const estimate: TrafficEstimate = {
          route: routeKey,
          duration: durationMinutes,
          staticDuration: staticDurationMinutes,
          distanceMeters:
            typeof element.distanceMeters === 'number'
              ? element.distanceMeters
              : undefined,
          congestion,
          trustStatus: 'live',
          sourceName: 'Google Routes API',
          lastUpdated: new Date().toISOString(),
          assumptions: ['Real-time traffic data from Google Routes API', 'May vary by time of day'],
        };

        if (process.env.NODE_ENV === 'development') console.log('Routes API: success (live) HTTP status OK');
        return cacheRouteEstimate(cacheKey, estimate);
      })();

      ROUTE_INFLIGHT.set(cacheKey, inflightPromise);
      try {
        return await inflightPromise;
      } finally {
        ROUTE_INFLIGHT.delete(cacheKey);
      }
    } catch (error: unknown) {
      // Log safe status message if available
      const safeMsg =
        error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV === 'development' && process.env.DEBUG_LOGS === 'true') {
        console.error('Live traffic API failed, falling back to mock:', safeMsg);
      }

      const fallback = unavailableTrafficEstimate(
        routeKey,
        'Google Routes API',
        'Route unavailable from this origin to the airport area.'
      );
      return cacheRouteEstimate(cacheKey, fallback);
    }
  }
}

function buildParkingDateRange(dateTime: string, parkingDurationMinutes?: number): {
  checkInDate?: string;
  checkOutDate?: string;
} {
  const start = new Date(dateTime);
  if (isNaN(start.getTime())) return {};

  const duration = parkingDurationMinutes ?? 24 * 60;
  const end = new Date(start.getTime() + duration * 60_000);

  const toYYYYMMDD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    checkInDate: toYYYYMMDD(start),
    checkOutDate: toYYYYMMDD(end),
  };
}

export class MockProvider implements DataProvider {
  private trafficProvider: TrafficProvider;
  private routeCache = new Map<string, TrafficEstimate>();
  private routeInFlight = new Map<string, Promise<TrafficEstimate>>();

  constructor() {
    const trafficProviderType =
      process.env.NODE_ENV === 'test'
        ? 'mock'
        : process.env.TRAFFIC_PROVIDER === 'mock'
          ? 'mock'
          : 'live';

    this.trafficProvider =
      trafficProviderType === 'live'
        ? new LiveTrafficProvider()
        : new MockTrafficProvider();
  }

  private buildGoogleDirectionsLink(origin: string, destination: string): string {
    return `https://www.google.com/maps/dir/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}`;
  }

  private buildGoogleMapsSearchLink(query: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  private estimateRouteDuration(origin: string, destination: string, fallbackMinutes: number): TrafficEstimate {
    return {
      route: `${origin}->${destination}`,
      duration: fallbackMinutes,
      congestion: 'medium',
      trustStatus: 'estimated',
      sourceName: 'Estimated route model',
      lastUpdated: new Date().toISOString(),
      assumptions: [`Estimated origin-aware travel time for ${origin} to ${destination}`],
    };
  }

  private estimateHubDriveTime(origin: string, hub: { driveTimeFactor: number }): number {
    void origin;

    return hub.driveTimeFactor + 5;
  }

  private async getRouteEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    allowLive: boolean
  ): Promise<TrafficEstimate> {
    const cacheKey = buildRouteEstimateCacheKey({
      origin,
      destination,
      dateTime,
      mode: allowLive ? 'DRIVE_LIVE' : 'DRIVE_ESTIMATED',
    });

    if (this.routeCache.has(cacheKey)) {
      if (allowLive) {
        logRoutesApiCache('Routes API cache hit', cacheKey, 'provider-route');
      }
      return this.routeCache.get(cacheKey)!;
    }

    const inFlight = this.routeInFlight.get(cacheKey);
    if (inFlight) {
      if (allowLive) {
        logRoutesApiCache('Routes API in-flight hit', cacheKey, 'provider-route');
      }
      return inFlight;
    }

    const promise = (async () => {
      let estimate: TrafficEstimate;

      if (isClearlyNonDrivableRoute(origin, destination)) {
        estimate = unavailableTrafficEstimate(
          normalizeTrafficRoute(origin, destination),
          'Route validation',
          'Route unavailable from this origin to the airport area.'
        );
      } else if (allowLive) {
        estimate = await this.trafficProvider.getTrafficEstimate(
          origin,
          destination,
          dateTime
        );
      } else {
        estimate = this.estimateRouteDuration(origin, destination, 35);
      }

      this.routeCache.set(cacheKey, estimate);
      return estimate;
    })();

    this.routeInFlight.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.routeInFlight.delete(cacheKey);
    }
  }

  async getTrafficEstimate(origin: string, destination: string, dateTime: string): Promise<TrafficEstimate> {
    const routeDestination = resolveAirportDestinationForRouting(destination);
    return this.trafficProvider.getTrafficEstimate(origin, routeDestination, dateTime);
  }

  async getParkingOptions(
    origin: string,
    destination: string,
    dateTime: string,
    parkingDurationMinutes?: number,
    context?: ParkingOptionsRequestContext
  ): Promise<ParkingOption[]> {
    const routeOrigins = origin;

    const destinationKind = context?.destinationKind ?? 'airport';
    const isAirportDestination = destinationKind === 'airport';

    const authoritativeCode = context?.airportCode?.toUpperCase();
    const airport = isAirportDestination
      ? (authoritativeCode
          ? getAirportById(authoritativeCode)
          : resolveAirportFromDestination(destination, authoritativeCode))
      : null;

    const airportCode = authoritativeCode || airport?.id || 'SEA';
    const airportCoordinates =
      airport?.geoLocation ??
      (typeof context?.destinationLat === 'number' && typeof context?.destinationLng === 'number'
        ? { lat: context.destinationLat, lng: context.destinationLng }
        : undefined);

    const parkingDates = buildParkingDateRange(dateTime, parkingDurationMinutes);

    const liveParkingOptions = await import('./providers/parkingAggregator')
      .then(({ getLiveParkingOptions, getDestinationParkingOptions }) =>
        isAirportDestination
          ? getLiveParkingOptions({
            airportCode,
            airportCoordinates,
            destination,
            checkInDate: parkingDates.checkInDate,
            checkOutDate: parkingDates.checkOutDate,
          })
          : getDestinationParkingOptions({
            origin,
            destination,
            dateTime,
            parkingDurationMinutes,
          })
      )
      .catch((error) => {
        console.warn('Live parking options unavailable; returning empty parking list', error);
        return [];
      });

    const parkingSource = liveParkingOptions;

    const routeDestination = isAirportDestination
      ? resolveAirportDestinationForRouting(destination)
      : destination;
    const destinationRouteEstimate = await this.getRouteEstimate(
      origin,
      routeDestination,
      dateTime,
      true
    );

    // Do not hide parking lots just because the home → airport route failed.
    // Parking discovery can still be useful; individual lot routes can be checked separately.
    const destinationDriveUnavailable = Boolean(destinationRouteEstimate.routeUnavailable);

    const routeDestinationFor = (option: ParkingOption): string =>
      option.routeDestination ||
      option.address ||
      option.name ||
      routeDestination;

    const parkingRouteEntries = parkingSource.map((option) => {
      const routeDestination = routeDestinationFor(option);

      return {
        option,
        routeDestination,
        routeCacheKey: buildRouteEstimateCacheKey({
          origin,
          destination: routeDestination,
          dateTime,
          mode: 'DRIVE_LIVE',
        }),
        liveRouteCacheKey: buildRouteEstimateCacheKey({
          origin,
          destination: routeDestination,
          dateTime,
          mode: 'DRIVE',
        }),
      };
    });

    const liveRouteLimit = initialLiveParkingRouteLimit();
    const uniqueRouteKeys = new Set(parkingRouteEntries.map((entry) => entry.routeCacheKey));
    const liveRouteKeys = new Set(
      parkingRouteEntries
        .slice(0, liveRouteLimit)
        .map((entry) => entry.routeCacheKey)
    );

    let selectedCachedRoutes = 0;
    let selectedInFlightRoutes = 0;
    liveRouteKeys.forEach((routeCacheKey) => {
      const entry = parkingRouteEntries.find((item) => item.routeCacheKey === routeCacheKey);
      if (!entry) return;

      if (this.routeCache.has(routeCacheKey) || getCachedRouteEstimate(entry.liveRouteCacheKey)) {
        selectedCachedRoutes += 1;
      } else if (this.routeInFlight.has(routeCacheKey) || ROUTE_INFLIGHT.has(entry.liveRouteCacheKey)) {
        selectedInFlightRoutes += 1;
      }
    });

    // if (process.env.NODE_ENV === 'development') {
    //   console.log('[Parking route enrichment]', {
    //     totalParkingOptions: parkingSource.length,
    //     uniqueRouteDestinations: uniqueRouteKeys.size,
    //     liveRouteLimit,
    //     routesActuallyFetched: Math.max(0, liveRouteKeys.size - selectedCachedRoutes - selectedInFlightRoutes),
    //     routesSkippedCached: selectedCachedRoutes + selectedInFlightRoutes,
    //     routesDeferred: Math.max(0, uniqueRouteKeys.size - liveRouteKeys.size),
    //   });
    // }

    const parkingRouteEstimates = new Map<string, Promise<TrafficEstimate>>();
    const getParkingRouteEstimate = (entry: typeof parkingRouteEntries[number]): Promise<TrafficEstimate> => {
      const existing = parkingRouteEstimates.get(entry.routeCacheKey);

      if (existing) {
        logRoutesApiCache('Routes API in-flight hit', entry.routeCacheKey, 'parking-route');
        return existing;
      }

      const promise = this.getRouteEstimate(origin, entry.routeDestination, dateTime, true);
      parkingRouteEstimates.set(entry.routeCacheKey, promise);

      return promise;
    };

    const enriched = await Promise.all(
      parkingRouteEntries.map(async (entry) => {
        const { option, routeDestination } = entry;

        const routeEstimate = liveRouteKeys.has(entry.routeCacheKey)
          ? await getParkingRouteEstimate(entry)
          : null;

        const meta = resolveParkingTransferMeta(option);
        const parkingBufferMinutes =
          option.parkingBufferMinutes ?? meta.parkingBufferMinutes;
        const transferToTerminalMinutes =
          option.transferToTerminalMinutes ?? meta.transferToTerminalMinutes;
        const transferType = option.transferType ?? meta.transferType;

        const mapLink = this.buildGoogleDirectionsLink(origin, routeDestination);
        const sourceLink =
          option.sourceLink && option.sourceLink.includes('example.com')
            ? undefined
            : option.sourceLink;
        const commonRouteFields = {
          parkingBufferMinutes,
          transferToTerminalMinutes,
          transferType,
          routeOrigin: routeOrigins,
          routeDestination,
          sourceLink,
          mapLink,
          lastUpdated: new Date().toISOString(),
        };

        if (!routeEstimate) {
          const optionWithDuration = option as ParkingOption & { duration?: number };

          return {
            ...option,
            ...commonRouteFields,
            duration: optionWithDuration.duration ?? option.distance,
            routeTrustStatus: option.routeTrustStatus ?? option.trustStatus,
            routeUnavailable: false,
            routeUnavailableReason: option.routeUnavailableReason,
            assumptions: [
              ...option.assumptions,
              'Live route calculation deferred for parking options outside the initially visible set.',
            ],
          };
        }

        const liveDriveMinutes =
          !routeEstimate.routeUnavailable && typeof routeEstimate.duration === 'number'
            ? routeEstimate.duration
            : null;

        // if (process.env.NODE_ENV === 'development') {
        //   console.log('[Parking route debug]', {
        //     name: option.name,
        //     address: option.address,
        //     routeDestination,
        //     routeDuration: routeEstimate.duration,
        //     routeTrustStatus: routeEstimate.trustStatus,
        //     routeUnavailable: routeEstimate.routeUnavailable,
        //     originalOptionDistance: option.distance,
        //   });
        // }

        const routeFailed = routeEstimate.routeUnavailable === true || liveDriveMinutes == null;

        return {
          ...option,
          ...commonRouteFields,

          // Use live route when available. If live route fails, keep provider option visible.
          distance: liveDriveMinutes ?? option.distance ?? 0,
          duration: liveDriveMinutes ?? option.distance ?? 0,

          routeTrustStatus: routeFailed
            ? option.routeTrustStatus ?? option.trustStatus
            : routeEstimate.trustStatus,

          routeUnavailableReason: routeFailed
            ? routeEstimate.routeUnavailableReason || DEFAULT_ROUTE_UNAVAILABLE_REASON
            : undefined,

          availability: option.availability,

          assumptions: [
            ...option.assumptions,
            routeFailed
              ? 'Live route check failed for this parking lot; showing provider option with estimated/deferred route timing.'
              : `Route from ${origin} to ${routeDestination}`,
            routeFailed
              ? routeEstimate.routeUnavailableReason || 'Open map directions to confirm drive time.'
              : routeEstimate.trustStatus === 'live'
                ? `Based on live routing: ${liveDriveMinutes} min drive`
                : `Estimated route time: ${liveDriveMinutes} min drive`,
          ],
        };
      })
    );

    return enriched;
  }

  async getRideshareOptions(origin: string, destination: string, dateTime: string): Promise<RideshareOption[]> {
    const routeDestination = resolveAirportDestinationForRouting(destination);
    const routeEstimate = await this.getRouteEstimate(origin, routeDestination, dateTime, true);

    if (routeEstimate.routeUnavailable) {
      return [];
    }

    const directionsUrl = this.buildGoogleDirectionsLink(origin, routeDestination);
    const taxiQuery = origin?.trim() ? `Taxi near ${origin}` : 'Taxi near airport';
    const uberUrl = `https://m.uber.com/ul/?${new URLSearchParams({
      action: 'setPickup',
      pickup: 'my_location',
      'dropoff[formatted_address]': routeDestination,
    }).toString()}`;

    const rideshareOptions = buildRideshareEstimateOptions({
      origin,
      destination: routeDestination,
      routeEstimate,
      directionsUrl,
      uberUrl,
      lyftUrl: 'https://lyft.com/ride',
      taxiSearchUrl: this.buildGoogleMapsSearchLink(taxiQuery),
    });

    // if (process.env.NODE_ENV === 'development' && process.env.DEBUG_LOGS === 'true') {
    //   console.log('[Rideshare estimates]', {
    //     routeTrustStatus: routeEstimate.trustStatus,
    //     duration: routeEstimate.duration,
    //     distanceMeters: routeEstimate.distanceMeters,
    //     optionCount: rideshareOptions.length,
    //   });
    // }

    return rideshareOptions;
  }

  async getTransitOptions(origin: string, destination: string, dateTime: string): Promise<TransitJourney[]> {
    const routeDestinationAirport = resolveAirportDestinationForRouting(destination);

    const hubRoutes = transitHubs.map(hub => {
      const routeDestinationHub = `${hub.name}, Seattle, WA`;
      const driveTime = this.estimateHubDriveTime(origin, hub);
      const waitTime = 5;
      const transferPenalty = 10;
      const totalDuration = driveTime + waitTime + transferPenalty + hub.transitTime;
      const isViable = totalDuration <= 120 && driveTime <= 60;
      return {
        hub,
        routeDestinationHub,
        driveTime,
        waitTime,
        transferPenalty,
        totalDuration,
        isViable,
      };
    });

    const bestHubRoute = hubRoutes.reduce((best, current) => current.totalDuration < best.totalDuration ? current : best, hubRoutes[0]);
    const bestHubEstimate = await this.getRouteEstimate(origin, bestHubRoute.routeDestinationHub, dateTime, true);
    // We currently model transit as “drive to a hub + rail to SeaTac”, so we don't route to the airport here.
    void routeDestinationAirport;

    return hubRoutes.map(route => {
      const isBestHub = route.hub.name === bestHubRoute.hub.name;
      const driveTime = isBestHub ? Math.max(route.driveTime, bestHubEstimate.duration) : route.driveTime;
      const routeTrustStatus = isBestHub ? bestHubEstimate.trustStatus : 'estimated';
      const totalDuration = driveTime + route.waitTime + route.transferPenalty + route.hub.transitTime;
      const isViable = totalDuration <= 120 && driveTime <= 60;
      const routeDestinationHub = route.routeDestinationHub;

      return {
        id: `drive-transit-${route.hub.name.toLowerCase().replace(/ /g, '-')}`,
        name: `Drive to ${route.hub.name} + Light Rail to SeaTac`,
        price: 3.00,
        duration: totalDuration,
        frequency: 10,
        totalDuration,
        totalCost: 3.25,
        segments: [
          { mode: 'drive', name: `Drive to ${route.hub.name}`, duration: driveTime, distance: driveTime, cost: 0 },
          { mode: 'walk', name: 'Walk to platform', duration: 5, cost: 0 },
          { mode: 'light-rail', name: 'Light Rail to SeaTac', duration: route.hub.transitTime, cost: 3.25, frequency: 10 }
        ],
        transfers: 1,
        availability: isViable ? 85 : 30,
        trustStatus: isViable ? 'verified-source' : 'estimated',
        routeTrustStatus,
        routeOrigin: origin,
        routeDestination: routeDestinationHub,
        assumptions: [
          'Based on nearest viable transit hub in Washington state',
          `Drive to ${route.hub.name} and take light rail to SeaTac`,
          routeTrustStatus === 'live' ? 'Live route for drive-to-hub segment' : 'Estimated drive-to-hub time',
        ],
        sourceName: 'Sound Transit',
        sourceLink: 'https://www.soundtransit.org',
        mapLink: this.buildGoogleDirectionsLink(origin, routeDestinationHub),
        lastUpdated: new Date().toISOString(),
      };
    });
  }

  async getFlightInfo(destination: string, dateTime: string): Promise<FlightInfo> {
    // TODO: Replace with a live flight data integration.
    const hit = mockFlightInfo[destination];
    if (hit) return hit;

    return {
      destination,
      status: 'On time',
      gate: 'TBD',
      scheduledTime: dateTime,
      trustStatus: 'fallback',
      sourceName: 'Mock flight provider',
      lastUpdated: new Date().toISOString(),
      assumptions: ['No flight data for this destination key'],
    };
  }

  async getTsaEstimate(
    destination: string,
    securityOption: SecurityOption = 'standard',
    plannedAirportArrivalAt?: string
  ): Promise<TsaEstimate> {
    const airport = resolveAirportFromDestination(destination);
    const code = airport?.id || 'SEA';

    return await getAirportTsaEstimate({
      airportCode: code,
      destination,
      securityOption,
      plannedAirportArrivalAt,
    });
  }

  async getAirportInfo(terminal: string): Promise<LocationInfo> {
    // TODO: Replace with an airport facilities API.
    return mockLocationInfo[terminal] || {
      destination: terminal,
      name: `${terminal} Airport`,
      services: ['Parking', 'Shuttles', 'Lounges'],
      trustStatus: 'verified-source',
      sourceName: 'Port of Seattle',
      lastUpdated: new Date().toISOString(),
      assumptions: ['Services available 24/7']
    };
  }
}

export const ActiveDataProvider: DataProvider = new MockProvider();
