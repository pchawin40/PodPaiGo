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
  TripData,
} from './types';
import { mockTrafficEstimates, mockFlightInfo, mockLocationInfo } from '../data/mockData';
import { AIRPORTS_CATALOG, getAirportById } from './airports/catalog';
import { RoutesApiElement, RoutesApiResponse } from '../lib/parking/provider';
import { getAirportTsaEstimate } from './airports/tsa/provider';
import { DEFAULT_ROUTE_UNAVAILABLE_REASON } from './parking/routeStatus';
import { buildRideshareEstimateOptions } from './rideshare/estimate';
import {
  applyParkingOriginDriveMinutes,
  estimateParkingDriveMinutesFallback,
  logMissingParkingDriveDiagnostic,
} from './parking/routeMinutes';
import {
  getParkingRouteCoordinates,
  logParkingCoordinateDiagnostic,
} from './parking/parkingCoordinates';
import {
  logParkingRouteCoordinateAudit,
  parkingRouteAuditFromOption,
} from './parking/parkingRouteAuditLog';
import {
  applyCanonicalCoordinatesToOption,
  resolveCanonicalParkingCoordinates,
} from './parking/resolveCanonicalCoordinates';
import {
  buildRouteEstimateCacheKey,
  shortRequestKey,
} from './apiUsage/routeCacheKey';
import { getLiveRouteCacheTtlMs } from './apiUsage/config';
import {
  canMakeLiveApiCall,
  emitProviderCall,
  isProviderKillSwitchEnabled,
  recordApiUsage,
} from './apiUsage/guard';
import {
  cacheGeocode,
  dedupeGeocodeRequest,
  getCachedGeocode,
} from './apiUsage/geocodeCache';
import {
  getCachedRouteQuoteSnapshot,
  routeSnapshotToTrafficEstimate,
  saveRouteQuoteSnapshot,
  snapshotToEstimate,
} from './db/routeQuoteSnapshots';
import { resolveParkingLotDestination } from './parking/routeDisplay';
import { googleMapsDirectionsLink } from './maps';
import { getGoogleMapsServerApiKey } from './env/googleMapsServerKey';



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
  routeDepartureTime?: string;
  targetTerminalArrivalTime?: string;
};

export interface TrafficProvider {
  getTrafficEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    destinationLatLng?: { lat: number; lng: number } | null,
    routeContext?: {
      airportCode?: string | null;
      lotId?: string | null;
      routePurpose?: 'main_to_destination' | 'origin_to_parking';
      targetTerminalArrivalTime?: string;
    },
  ): Promise<TrafficEstimate>;
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
  getRideshareOptions(
    origin: string,
    destination: string,
    dateTime: string,
    tripData?: TripData,
  ): Promise<RideshareOption[]>;
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
  async getTrafficEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    _destinationLatLng?: { lat: number; lng: number } | null,
    _routeContext?: { airportCode?: string | null; lotId?: string | null },
  ): Promise<TrafficEstimate> {
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
const DEFAULT_INITIAL_LIVE_PARKING_ROUTE_LIMIT = 3;

function getRouteCacheTtlMs(): number {
  return getLiveRouteCacheTtlMs();
}

function initialLiveParkingRouteLimit(): number {
  const configured = Number(process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT);
  if (Number.isFinite(configured) && configured >= 0) return Math.floor(configured);

  return DEFAULT_INITIAL_LIVE_PARKING_ROUTE_LIMIT;
}

function getCachedRouteEstimate(cacheKey: string): TrafficEstimate | null {
  const cached = ROUTE_CACHE.get(cacheKey);

  if (!cached) return null;

  if (Date.now() - cached.ts >= getRouteCacheTtlMs()) {
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
    id: shortRequestKey(cacheKey),
    route: routeLabel,
  });
}

export class LiveTrafficProvider implements TrafficProvider {
  private serverKey = getGoogleMapsServerApiKey();

  async geocodeAddress(address: string): Promise<{ lat: number, lng: number } | null> {
    const requestKey = shortRequestKey(address);
    const cached = getCachedGeocode(address);
    if (cached) {
      emitProviderCall({
        provider: 'geocoding',
        requestKey,
        cacheHit: true,
      });
      return cached;
    }

    if (isProviderKillSwitchEnabled('geocoding')) {
      emitProviderCall({
        provider: 'geocoding',
        requestKey,
        blockedByKillSwitch: true,
      });
      return null;
    }

    const budget = await canMakeLiveApiCall('geocoding');
    if (!budget.allowed) {
      emitProviderCall({
        provider: 'geocoding',
        requestKey,
        blockedByBudget: budget.reason !== 'kill_switch',
        blockedByKillSwitch: budget.reason === 'kill_switch',
        note: budget.reason,
      });
      return null;
    }

    return dedupeGeocodeRequest(address, async () => {
      try {
        if (!this.serverKey) return null;
        await recordApiUsage('geocoding');
        emitProviderCall({
          provider: 'geocoding',
          requestKey,
          liveCall: true,
          estimatedCost: 0.005,
        });

        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${this.serverKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const loc = data.results[0].geometry.location;
          const coords = { lat: loc.lat, lng: loc.lng };
          cacheGeocode(address, coords);
          return coords;
        }
        return null;
      } catch {
        return null;
      }
    });
  }

  async getTrafficEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    destinationLatLng?: { lat: number; lng: number } | null,
    routeContext?: {
      airportCode?: string | null;
      lotId?: string | null;
      routePurpose?: 'main_to_destination' | 'origin_to_parking';
      targetTerminalArrivalTime?: string;
    },
  ): Promise<TrafficEstimate> {
    // dateTime can be undefined at runtime (e.g., tests). Default to "now" to keep routing functional.
    const resolvedDateTime = (dateTime ?? new Date().toISOString());
    const destinationKey = destinationLatLng
      ? `${destinationLatLng.lat},${destinationLatLng.lng}`
      : destination;
    const cacheKey = buildRouteEstimateCacheKey({
      origin,
      destination: destinationKey,
      dateTime: resolvedDateTime,
      mode: 'DRIVE',
      airportCode: routeContext?.airportCode,
      lotId: routeContext?.lotId,
    });
    const routeKey = normalizeTrafficRoute(origin, destination);
    const routeLabel = routeKey === 'home-airport' || routeKey === 'airport-home' ? routeKey : 'custom';
    const requestKey = shortRequestKey(cacheKey);

    try {
      if (isClearlyNonDrivableRoute(origin, destination)) {
        return unavailableTrafficEstimate(
          routeKey,
          'Route validation',
          'Route unavailable from this origin to the airport area.'
        );
      }

      if (isProviderKillSwitchEnabled('google_routes')) {
        const snapshotEstimate = await routeSnapshotToTrafficEstimate({
          origin,
          destination: destinationKey,
          dateTime: resolvedDateTime,
          airportCode: routeContext?.airportCode,
          lotId: routeContext?.lotId,
          routeLabel: routeKey,
        });
        if (snapshotEstimate) {
          emitProviderCall({
            provider: 'google_routes',
            requestKey,
            snapshotHit: true,
            blockedByKillSwitch: true,
          });
          return cacheRouteEstimate(cacheKey, snapshotEstimate);
        }

        emitProviderCall({
          provider: 'google_routes',
          requestKey,
          blockedByKillSwitch: true,
        });
        return unavailableTrafficEstimate(
          routeKey,
          'Google Routes API',
          'Live routing disabled; using cached or estimated timing only.',
        );
      }

      if (!this.serverKey) {
        throw new Error('Google Maps server API key not configured');
      }

      const cached = getCachedRouteEstimate(cacheKey);
      if (cached) {
        emitProviderCall({
          provider: 'google_routes',
          requestKey,
          cacheHit: true,
        });
        logRoutesApiCache('Routes API cache hit', cacheKey, routeLabel);
        return cached;
      }

      const snapshotEstimate = await routeSnapshotToTrafficEstimate({
        origin,
        destination: destinationKey,
        dateTime: resolvedDateTime,
        airportCode: routeContext?.airportCode,
        lotId: routeContext?.lotId,
        routeLabel: routeKey,
      });
      if (snapshotEstimate) {
        emitProviderCall({
          provider: 'google_routes',
          requestKey,
          snapshotHit: true,
        });
        logRoutesApiCache('Routes API cache hit', cacheKey, routeLabel);
        return cacheRouteEstimate(cacheKey, snapshotEstimate);
      }

      const existingInFlight = ROUTE_INFLIGHT.get(cacheKey);
      if (existingInFlight) {
        emitProviderCall({
          provider: 'google_routes',
          requestKey,
          cacheHit: true,
          note: 'in-flight',
        });
        logRoutesApiCache('Routes API in-flight hit', cacheKey, routeLabel);
        return await existingInFlight;
      }

      const inflightPromise = (async () => {
        const budget = await canMakeLiveApiCall('google_routes');
        if (!budget.allowed) {
          emitProviderCall({
            provider: 'google_routes',
            requestKey,
            blockedByBudget: budget.reason !== 'kill_switch',
            blockedByKillSwitch: budget.reason === 'kill_switch',
            note: budget.reason,
          });

          const staleSnapshot = await getCachedRouteQuoteSnapshot({
            origin,
            destination: destinationKey,
            dateTime: resolvedDateTime,
            airportCode: routeContext?.airportCode,
            lotId: routeContext?.lotId,
            allowStale: true,
          });

          if (staleSnapshot) {
            emitProviderCall({
              provider: 'google_routes',
              requestKey,
              snapshotHit: true,
              note: 'stale-fallback',
            });
            return cacheRouteEstimate(cacheKey, snapshotToEstimate(staleSnapshot, routeKey));
          }

          return cacheRouteEstimate(
            cacheKey,
            unavailableTrafficEstimate(
              routeKey,
              'Google Routes API',
              'Route budget exceeded; open map directions to confirm drive time.',
            ),
          );
        }

        await recordApiUsage('google_routes');
        emitProviderCall({
          provider: 'google_routes',
          requestKey,
          liveCall: true,
          estimatedCost: 0.01,
        });

        // Geocode origin and destination where possible
        const [originLatLng, destLatLng] = await Promise.all([
          this.geocodeAddress(origin),
          destinationLatLng
            ? Promise.resolve(destinationLatLng)
            : this.geocodeAddress(destination),
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

        void saveRouteQuoteSnapshot({
          provider: 'google_routes',
          origin,
          destination: destinationKey,
          dateTime: resolvedDateTime,
          airportCode: routeContext?.airportCode,
          lotId: routeContext?.lotId,
          travelMinutes: durationMinutes,
          distanceMiles:
            typeof element.distanceMeters === 'number'
              ? element.distanceMeters / 1609.34
              : null,
          rawResponse: element,
        }).catch(() => undefined);

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
  checkInAt?: string;
  checkOutAt?: string;
} {
  const parseLocalWallClock = (value: string): Date => {
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
    );

    if (!match) return new Date(value);

    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0),
      0,
    );
  };

  const start = parseLocalWallClock(dateTime);
  if (isNaN(start.getTime())) return {};

  const duration = parkingDurationMinutes ?? 24 * 60;
  const end = new Date(start.getTime() + duration * 60_000);

  const toYYYYMMDD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const toParkWhizDateTime = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${hours}:${mins}`;
  };

  return {
    checkInDate: toYYYYMMDD(start),
    checkOutDate: toYYYYMMDD(end),
    checkInAt: toParkWhizDateTime(start),
    checkOutAt: toParkWhizDateTime(end),
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

  private buildGoogleTransitDirectionsLink(origin: string, destination: string): string {
    return `https://www.google.com/maps/dir/?${new URLSearchParams({
      api: '1',
      origin,
      destination,
      travelmode: 'transit',
    }).toString()}`;
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

  private async geocodeLatLng(address: string): Promise<{ lat: number; lng: number } | null> {
    if (this.trafficProvider instanceof LiveTrafficProvider) {
      return this.trafficProvider.geocodeAddress(address);
    }

    return null;
  }

  private async getRouteEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    allowLive: boolean,
    destinationLatLng?: { lat: number; lng: number } | null,
    routeContext?: {
      airportCode?: string | null;
      lotId?: string | null;
      routePurpose?: 'main_to_destination' | 'origin_to_parking';
      targetTerminalArrivalTime?: string;
    },
  ): Promise<TrafficEstimate> {
    const destinationKey = destinationLatLng
      ? `${destinationLatLng.lat},${destinationLatLng.lng}`
      : destination;
    const cacheKey = buildRouteEstimateCacheKey({
      origin,
      destination: destinationKey,
      dateTime,
      mode: allowLive ? 'DRIVE_LIVE' : 'DRIVE_ESTIMATED',
      airportCode: routeContext?.airportCode,
      lotId: routeContext?.lotId,
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
          dateTime,
          destinationLatLng,
          routeContext,
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

  async getTrafficEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    destinationLatLng?: { lat: number; lng: number } | null,
    routeContext?: {
      airportCode?: string | null;
      lotId?: string | null;
      routePurpose?: 'main_to_destination' | 'origin_to_parking';
      targetTerminalArrivalTime?: string;
    },
  ): Promise<TrafficEstimate> {
    const routeDestination = resolveAirportDestinationForRouting(destination);
    return this.trafficProvider.getTrafficEstimate(
      origin,
      routeDestination,
      dateTime,
      destinationLatLng,
      routeContext,
    );
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

    const authoritativeCode = isAirportDestination ? context?.airportCode?.toUpperCase() : undefined;
    const airport = isAirportDestination
      ? (authoritativeCode
          ? getAirportById(authoritativeCode)
          : resolveAirportFromDestination(destination, authoritativeCode))
      : null;

    const airportCode = isAirportDestination ? authoritativeCode || airport?.id || 'SEA' : null;
    const airportCoordinates =
      airport?.geoLocation ??
      (isAirportDestination &&
        typeof context?.destinationLat === 'number' &&
        typeof context?.destinationLng === 'number'
          ? { lat: context.destinationLat, lng: context.destinationLng }
          : undefined);

    const parkingDates = buildParkingDateRange(dateTime, parkingDurationMinutes);

    const destinationCoords =
      typeof context?.destinationLat === 'number' &&
      typeof context?.destinationLng === 'number'
        ? { lat: context.destinationLat, lng: context.destinationLng }
        : !isAirportDestination
          ? await this.geocodeLatLng(destination)
          : undefined;

    const { getLiveParkingOptions, getDestinationParkingOptions } = await import('./providers/parkingAggregator');
    const liveParkingOptions = isAirportDestination
      ? await getLiveParkingOptions({
        airportCode: airportCode!,
        airportCoordinates,
        destination,
        checkInDate: parkingDates.checkInDate,
        checkOutDate: parkingDates.checkOutDate,
        checkInAt: parkingDates.checkInAt,
        checkOutAt: parkingDates.checkOutAt,
      })
      : await getDestinationParkingOptions({
        origin,
        destination,
        dateTime,
        parkingDurationMinutes,
        destinationLat: destinationCoords?.lat ?? context?.destinationLat,
        destinationLng: destinationCoords?.lng ?? context?.destinationLng,
        checkInDate: parkingDates.checkInDate,
        checkOutDate: parkingDates.checkOutDate,
        checkInAt: parkingDates.checkInAt,
        checkOutAt: parkingDates.checkOutAt,
      });

    const parkingSource = await Promise.all(
      liveParkingOptions.map(async (option) => {
        const canonicalUpdate = await resolveCanonicalParkingCoordinates({
          option,
          airportCode: isAirportDestination ? airportCode : null,
          destinationContext: isAirportDestination ? undefined : destination,
          geocodeAddress: (address) => this.geocodeLatLng(address),
        });

        return applyCanonicalCoordinatesToOption(option, canonicalUpdate);
      }),
    );

    const routeDestination = isAirportDestination
      ? resolveAirportDestinationForRouting(destination)
      : destination;
    const routeDepartureTime = context?.routeDepartureTime || dateTime;
    const routeDestinationCoords = isAirportDestination ? null : destinationCoords ?? null;
    const destinationRouteEstimate = await this.getRouteEstimate(
      origin,
      routeDestination,
      routeDepartureTime,
      true,
      routeDestinationCoords,
      {
        airportCode: isAirportDestination ? airportCode : null,
        routePurpose: 'main_to_destination',
        targetTerminalArrivalTime: context?.targetTerminalArrivalTime,
      },
    );

    const originCoords = await this.geocodeLatLng(origin);

    // Do not hide parking lots just because the home → airport route failed.
    // Parking discovery can still be useful; individual lot routes can be checked separately.
    const destinationDriveUnavailable = Boolean(destinationRouteEstimate.routeUnavailable);

    const routeDestinationFor = (option: ParkingOption): string => {
      const resolved = resolveParkingLotDestination(option, routeDestination);
      if (resolved.destination) {
        return resolved.destination;
      }

      return (
        option.routeDestination ||
        option.address ||
        option.name ||
        routeDestination
      );
    };

    const parkingRouteEntries = parkingSource.map((option) => {
      const lotDestination = resolveParkingLotDestination(option, routeDestination);
      const routeDestinationForLot = lotDestination.destination || routeDestinationFor(option);
      const routeCoords = getParkingRouteCoordinates(option);
      const destinationLatLng =
        typeof routeCoords.lat === 'number' && typeof routeCoords.lng === 'number'
          ? { lat: routeCoords.lat, lng: routeCoords.lng }
          : null;
      const routeDestinationKey = destinationLatLng
        ? `${destinationLatLng.lat},${destinationLatLng.lng}`
        : routeDestinationForLot;

      return {
        option,
        lotDestination,
        routeDestination: routeDestinationForLot,
        destinationLatLng,
        routeCacheKey: buildRouteEstimateCacheKey({
          origin,
          destination: routeDestinationKey,
          dateTime: routeDepartureTime,
          mode: 'DRIVE_LIVE',
        }),
        liveRouteCacheKey: buildRouteEstimateCacheKey({
          origin,
          destination: routeDestinationKey,
          dateTime: routeDepartureTime,
          mode: 'DRIVE',
        }),
      };
    });

    const liveRouteLimit = initialLiveParkingRouteLimit();
    const liveRouteKeys = new Set<string>();

    if (liveRouteLimit > 0) {
      for (const entry of parkingRouteEntries) {
        liveRouteKeys.add(entry.routeCacheKey);
        if (liveRouteKeys.size >= liveRouteLimit) break;
      }
    }

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
    //     uniqueRouteDestinations: new Set(parkingRouteEntries.map((entry) => entry.routeCacheKey)).size,
    //     liveRouteLimit,
    //     routesActuallyFetched: Math.max(0, liveRouteKeys.size - selectedCachedRoutes - selectedInFlightRoutes),
    //     routesSkippedCached: selectedCachedRoutes + selectedInFlightRoutes,
    //     routesDeferred: Math.max(0, new Set(parkingRouteEntries.map((entry) => entry.routeCacheKey)).size - liveRouteKeys.size),
    //   });
    // }

    const parkingRouteEstimates = new Map<string, Promise<TrafficEstimate>>();
    const getParkingRouteEstimate = (
      entry: typeof parkingRouteEntries[number],
      allowLiveRoute: boolean,
    ): Promise<TrafficEstimate> => {
      const parkingEstimateKey = `${entry.routeCacheKey}|${allowLiveRoute ? 'live' : 'estimated'}`;
      const existing = parkingRouteEstimates.get(parkingEstimateKey);

      if (existing) {
        if (allowLiveRoute) {
          logRoutesApiCache('Routes API in-flight hit', entry.routeCacheKey, 'parking-route');
        }
        return existing;
      }

      const promise = this.getRouteEstimate(
        origin,
        entry.routeDestination,
        routeDepartureTime,
        allowLiveRoute,
        typeof entry.destinationLatLng?.lat === 'number' &&
          typeof entry.destinationLatLng?.lng === 'number'
          ? entry.destinationLatLng
          : null,
        {
          airportCode: isAirportDestination ? airportCode : null,
          lotId: entry.option.id || entry.option.name,
          routePurpose: 'origin_to_parking',
          targetTerminalArrivalTime: context?.targetTerminalArrivalTime,
        },
      );
      parkingRouteEstimates.set(parkingEstimateKey, promise);

      return promise;
    };

    const enriched = await Promise.all(
      parkingRouteEntries.map(async (entry) => {
        const { option, routeDestination, lotDestination } = entry;
        const shouldUseLiveRoute = liveRouteKeys.has(entry.routeCacheKey);

        logParkingRouteCoordinateAudit(
          parkingRouteAuditFromOption(
            option,
            entry,
            routeDepartureTime,
            shouldUseLiveRoute,
          ),
        );

        const routeEstimate = await getParkingRouteEstimate(entry, shouldUseLiveRoute);

        const meta = resolveParkingTransferMeta(option);
        const parkingBufferMinutes =
          option.parkingBufferMinutes ?? meta.parkingBufferMinutes;
        const transferToTerminalMinutes =
          option.transferToTerminalMinutes ?? meta.transferToTerminalMinutes;
        const transferType = option.transferType ?? meta.transferType;

        const mapLink =
          origin && routeDestination
            ? googleMapsDirectionsLink(origin, routeDestination, 'driving', {
                destinationPlaceId: lotDestination.googlePlaceId,
              })
            : this.buildGoogleDirectionsLink(origin, routeDestination);
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
          ...(originCoords
            ? { originLat: originCoords.lat, originLng: originCoords.lng }
            : {}),
        };

        const resolveFallbackDriveMinutes = async (): Promise<number> => {
          let minutes = estimateParkingDriveMinutesFallback({
            originLat: originCoords?.lat,
            originLng: originCoords?.lng,
            option,
          });

          if (minutes > 0 || !originCoords) {
            return minutes;
          }

          const lotCoords =
            typeof option.lat === 'number' &&
            Number.isFinite(option.lat) &&
            typeof option.lng === 'number' &&
            Number.isFinite(option.lng)
              ? { lat: option.lat, lng: option.lng }
              : await this.geocodeLatLng(routeDestination);

          if (!lotCoords) {
            return 0;
          }

          minutes = estimateParkingDriveMinutesFallback({
            originLat: originCoords.lat,
            originLng: originCoords.lng,
            option: { ...option, lat: lotCoords.lat, lng: lotCoords.lng },
          });

          return minutes;
        };

        const routeTargetCoords = entry.destinationLatLng;
        const canonicalRouteCoords = getParkingRouteCoordinates(option);
        const usedCanonicalCoords = Boolean(
          option.coordinateSource === 'google_place' &&
            routeTargetCoords &&
            typeof canonicalRouteCoords.lat === 'number' &&
            typeof canonicalRouteCoords.lng === 'number' &&
            Math.abs(routeTargetCoords.lat - canonicalRouteCoords.lat) <= 0.001 &&
            Math.abs(routeTargetCoords.lng - canonicalRouteCoords.lng) <= 0.001,
        );
        const routeTarget = routeTargetCoords
          ? {
              lat: routeTargetCoords.lat,
              lng: routeTargetCoords.lng,
              usedCanonicalCoords,
            }
          : undefined;
        const parkingRouteDebug = {
          routesApiDestination: routeTargetCoords
            ? `${routeTargetCoords.lat},${routeTargetCoords.lng}`
            : routeDestination,
          googleMapsUrlDestination: lotDestination.destination || routeDestination,
        };

        if (!routeEstimate) {
          const fallbackDriveMinutes = await resolveFallbackDriveMinutes();

          const deferredOption = applyParkingOriginDriveMinutes(
            {
              ...option,
              ...commonRouteFields,
              parkingRouteDebug,
              routeTrustStatus: option.routeTrustStatus ?? option.trustStatus,
              routeUnavailable: false,
              routeUnavailableReason: option.routeUnavailableReason,
              assumptions: [
                ...option.assumptions,
                fallbackDriveMinutes > 0
                  ? `Estimated ${fallbackDriveMinutes} min drive from origin based on straight-line distance.`
                  : 'Live route calculation deferred for parking options outside the initially visible set.',
              ],
            },
            fallbackDriveMinutes,
            fallbackDriveMinutes > 0 ? 'haversine-estimated' : 'google-routes',
            routeTarget,
          );

          if (fallbackDriveMinutes <= 0) {
            logMissingParkingDriveDiagnostic({
              lotName: option.name,
              origin,
              hasOriginCoords: Boolean(originCoords),
              hasLotCoords: Boolean(option.lat && option.lng),
              routeDestination,
              googleRoutesCalled: false,
            });
          }

          return deferredOption;
        }

        const liveDriveMinutes =
          !routeEstimate.routeUnavailable && typeof routeEstimate.duration === 'number'
            ? routeEstimate.duration
            : null;

        const routeFailed = routeEstimate.routeUnavailable === true || liveDriveMinutes == null;
        const fallbackDriveMinutes = routeFailed ? await resolveFallbackDriveMinutes() : 0;
        const driveMinutes = routeFailed
          ? fallbackDriveMinutes
          : liveDriveMinutes!;
        const routeWasLive = shouldUseLiveRoute && routeEstimate.trustStatus === 'live';

        const enrichedOption = applyParkingOriginDriveMinutes(
          {
            ...option,
            ...commonRouteFields,
            parkingRouteDebug,
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
                ? fallbackDriveMinutes > 0
                  ? `Live route check failed; using estimated ${fallbackDriveMinutes} min drive from origin to lot.`
                  : 'Live route check failed for this parking lot; showing provider option with estimated/deferred route timing.'
                : `Route from ${origin} to ${routeDestination}`,
              routeFailed
                ? routeEstimate.routeUnavailableReason || 'Open map directions to confirm drive time.'
                : routeWasLive
                  ? `Based on live routing: ${driveMinutes} min drive`
                  : shouldUseLiveRoute
                    ? `Estimated route time: ${driveMinutes} min drive`
                    : `Live route calculation deferred for parking options outside the initially visible set; estimated ${driveMinutes} min drive.`,
            ],
          },
          driveMinutes,
          routeFailed
            ? fallbackDriveMinutes > 0
              ? 'haversine-estimated'
              : 'google-routes'
            : routeWasLive
              ? 'google-routes'
              : 'haversine-estimated',
          routeTarget,
        );

        if (driveMinutes <= 0) {
          logMissingParkingDriveDiagnostic({
            lotName: option.name,
            origin,
            hasOriginCoords: Boolean(originCoords),
            hasLotCoords: Boolean(getParkingRouteCoordinates(option).lat && getParkingRouteCoordinates(option).lng),
            routeDestination,
            routeFailed,
            googleRoutesCalled: shouldUseLiveRoute,
          });
        } else if (process.env.NODE_ENV === 'development') {
          logParkingCoordinateDiagnostic({
            lotName: option.name,
            providerLat: option.providerLat,
            providerLng: option.providerLng,
            googleLat: canonicalRouteCoords.lat,
            googleLng: canonicalRouteCoords.lng,
            coordinateSource: option.coordinateSource,
            routeMinutes: driveMinutes,
            mapsDestination: parkingRouteDebug.googleMapsUrlDestination,
          });
        }

        return enrichedOption;
      })
    );

    return enriched;
  }

  async getRideshareOptions(
    origin: string,
    destination: string,
    dateTime: string,
    tripData?: TripData,
  ): Promise<RideshareOption[]> {
    const routeDestination = resolveAirportDestinationForRouting(destination);
    const routeEstimate = await this.getRouteEstimate(origin, routeDestination, dateTime, true);
    const airport = resolveAirportFromDestination(destination);

    const directionsUrl = this.buildGoogleDirectionsLink(origin, routeDestination);
    const taxiQuery = origin?.trim() ? `Taxi near ${origin}` : 'Taxi near airport';
    const uberUrl = `https://m.uber.com/ul/?${new URLSearchParams({
      action: 'setPickup',
      pickup: 'my_location',
      'dropoff[formatted_address]': routeDestination,
    }).toString()}`;

    return buildRideshareEstimateOptions({
      origin,
      destination: routeDestination,
      routeEstimate,
      directionsUrl,
      uberUrl,
      lyftUrl: 'https://lyft.com/ride',
      taxiSearchUrl: this.buildGoogleMapsSearchLink(taxiQuery),
      departureDateTime: dateTime,
      airportCode: airport?.id,
      tripData,
    });
  }

  async getTransitOptions(origin: string, destination: string, dateTime: string): Promise<TransitJourney[]> {
    const routeDestinationAirport = resolveAirportDestinationForRouting(destination);
    const isAirportTransitDestination =
      routeDestinationAirport !== destination ||
      /airport|terminal|sea-tac|seatac|jfk|lax/i.test(destination);

    if (!isAirportTransitDestination) {
      const routeEstimate = await this.getRouteEstimate(origin, destination, dateTime, false);
      const estimatedTransitMinutes =
        routeEstimate.routeUnavailable || !Number.isFinite(routeEstimate.duration)
          ? 55
          : Math.max(20, Math.round(routeEstimate.duration * 1.45 + 12));

      return [
        {
          id: 'regional-transit-to-destination',
          name: 'Transit route to destination',
          price: 3.25,
          duration: estimatedTransitMinutes,
          frequency: 15,
          totalDuration: estimatedTransitMinutes,
          totalCost: 3.25,
          segments: [
            {
              mode: 'bus',
              name: 'Open transit directions for exact route',
              duration: estimatedTransitMinutes,
              cost: 3.25,
              frequency: 15,
            },
          ],
          transfers: 1,
          availability: routeEstimate.routeUnavailable ? 50 : 70,
          trustStatus: 'estimated',
          routeTrustStatus: routeEstimate.routeUnavailable ? 'fallback' : routeEstimate.trustStatus,
          routeOrigin: origin,
          routeDestination: destination,
          assumptions: [
            'Regional transit fare estimate based on origin and destination.',
            routeEstimate.routeUnavailable
              ? 'Drive time unavailable; open transit directions to confirm route.'
              : 'Transit time estimated from entered origin and destination.',
          ],
          sourceName: 'Google Maps transit directions',
          sourceLink: this.buildGoogleTransitDirectionsLink(origin, destination),
          mapLink: this.buildGoogleTransitDirectionsLink(origin, destination),
          lastUpdated: new Date().toISOString(),
        },
      ];
    }

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
