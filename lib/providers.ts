import {
  DestinationKind,
  ParkingDiscoveryMetadata,
  ParkingOption,
  RideshareOption,
  TransitJourney,
  TrafficEstimate,
  FlightInfo,
  LocationInfo,
  TsaEstimate,
  SecurityOption,
  TripData,
  DriveRoutePreferences,
} from './types';
import {
  computeDriveRouteOptions,
} from './routes/computeDriveRouteOptions';
import type { DriveRouteRanking } from './routes/driveRouteProfiles';
import { mockTrafficEstimates, mockFlightInfo, mockLocationInfo } from '../data/mockData';
import { AIRPORTS_CATALOG, getAirportById } from './airports/catalog';
import { RoutesApiElement, RoutesApiResponse } from '../lib/parking/provider';
import { getAirportTsaEstimate } from './airports/tsa/provider';
import { DEFAULT_ROUTE_UNAVAILABLE_REASON } from './parking/routeStatus';
import {
  attachTrafficRouteMetadata,
  type QuickGoRouteStatus,
} from './trip/quickGo';
import { debugLog } from './utils/debug';
import { buildRideshareEstimateOptions } from './rideshare/estimate';
import { resolveTransitFare } from './transit/transitFareResolver';
import {
  applyParkingOriginDriveMinutes,
  estimateDriveMinutesFromStraightLineMiles,
  estimateParkingDriveMinutesFallback,
  haversineMiles,
  logMissingParkingDriveDiagnostic,
} from './parking/routeMinutes';
import {
  getParkingRouteCoordinates,
  logParkingCoordinateDiagnostic,
} from './parking/parkingCoordinates';
import {
  logParkingRouteCoordinateAudit,
  logParkingRouteToLot,
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

function resolveRouteLatLng(value?: RouteLatLng | null): RouteLatLng | null {
  if (
    typeof value?.lat === 'number' &&
    Number.isFinite(value.lat) &&
    typeof value.lng === 'number' &&
    Number.isFinite(value.lng)
  ) {
    return value;
  }

  return null;
}

function routeLatLngKey(value: RouteLatLng): string {
  return `${value.lat},${value.lng}`;
}

export const PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE = 'parking_origin_to_lot' as const;

function isParkingOriginToLotPurpose(routePurpose?: string | null): boolean {
  return (
    routePurpose === PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE ||
    routePurpose === 'origin_to_parking'
  );
}

export function isUntrustedParkingRouteEstimate(estimate: TrafficEstimate): boolean {
  if (estimate.routeUnavailable === true) return true;
  if (estimate.sourceName === 'Estimated route model') return true;
  if (estimate.sourceName === 'Estimated from coordinates') return true;
  return false;
}

function routeUnavailableReasonForContext(routeContext?: RouteRequestContext): string {
  if (isParkingOriginToLotPurpose(routeContext?.routePurpose)) {
    return DEFAULT_ROUTE_UNAVAILABLE_REASON;
  }

  return routeContext?.airportCode
    ? 'Route unavailable from this origin to the airport area.'
    : 'Route unavailable from this origin to this destination.';
}

function coordinateFallbackTrafficEstimate(
  route: string,
  originLatLng?: RouteLatLng | null,
  destinationLatLng?: RouteLatLng | null,
): TrafficEstimate | null {
  const originCoords = resolveRouteLatLng(originLatLng);
  const destinationCoords = resolveRouteLatLng(destinationLatLng);

  if (!originCoords || !destinationCoords) return null;

  const samePlace = originCoords.lat === destinationCoords.lat && originCoords.lng === destinationCoords.lng;
  const straightLineMiles = samePlace
    ? 0
    : haversineMiles(
        originCoords.lat,
        originCoords.lng,
        destinationCoords.lat,
        destinationCoords.lng,
      );
  const duration = samePlace
    ? 0
    : estimateDriveMinutesFromStraightLineMiles(straightLineMiles);

  return {
    route,
    duration,
    distanceMeters: samePlace ? 0 : Math.max(1, Math.round(straightLineMiles * 1609.34)),
    congestion: 'medium',
    trustStatus: 'estimated',
    routeUnavailable: false,
    sourceName: 'Estimated from coordinates',
    lastUpdated: new Date().toISOString(),
    assumptions: ['Estimated from straight-line distance; open directions to confirm.'],
  };
}

function resolveParkingTransferMeta(
  option: ParkingOption,
  context?: ParkingOptionsRequestContext,
): {
  parkingBufferMinutes: number;
  transferToTerminalMinutes?: number;
  transferType?: ParkingOption['transferType'];
} {
  const isCityDestination = context?.destinationKind != null && context.destinationKind !== 'airport';
  if (isCityDestination) {
    return {
      parkingBufferMinutes: option.type === 'park-and-ride' ? 10 : 8,
      transferType: option.type === 'park-and-ride' ? 'transit' : option.transferType ?? 'walk',
    };
  }

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
  destinationName?: string;
  airportCode?: string;
  destinationCoordinates?: RouteLatLng | null;
  destinationLat?: number;
  destinationLng?: number;
  routeDepartureTime?: string;
  targetTerminalArrivalTime?: string;
};

type ParkingOptionsResult = {
  options: ParkingOption[];
  metadata?: ParkingDiscoveryMetadata;
};

type RouteLatLng = { lat: number; lng: number };

type RouteRequestContext = {
  airportCode?: string | null;
  lotId?: string | null;
  routePurpose?: 'main_to_destination' | 'parking_origin_to_lot' | 'origin_to_parking';
  tripType?: string | null;
  tripMode?: string | null;
  originLatLng?: RouteLatLng | null;
  targetTerminalArrivalTime?: string;
};

type DriveRouteOptionsContext = {
  originLatLng?: RouteLatLng | null;
  destinationLatLng?: RouteLatLng | null;
  /** Feature flag override; when omitted falls back to the env flag. */
  featureEnabled?: boolean;
};

export interface TrafficProvider {
  getTrafficEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    destinationLatLng?: RouteLatLng | null,
    routeContext?: RouteRequestContext,
  ): Promise<TrafficEstimate>;
  /**
   * Optional toll/HOV/express drive route comparison (Phase 1). Returns null
   * when not enabled/chosen so no extra route calls are made. Optional so
   * lightweight mock providers need not implement it.
   */
  getDriveRouteOptions?(
    origin: string,
    destination: string,
    dateTime: string,
    prefs: DriveRoutePreferences | null | undefined,
    context?: DriveRouteOptionsContext,
  ): Promise<DriveRouteRanking | null>;
}

export interface ParkingProvider {
  getParkingOptions(
    origin: string,
    destination: string,
    dateTime: string,
    parkingDurationMinutes?: number,
    context?: ParkingOptionsRequestContext
  ): Promise<ParkingOption[]>;
  getParkingOptionsWithMetadata?(
    origin: string,
    destination: string,
    dateTime: string,
    parkingDurationMinutes?: number,
    context?: ParkingOptionsRequestContext
  ): Promise<ParkingOptionsResult>;
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
  getParkingOptionsWithMetadata?(
    origin: string,
    destination: string,
    dateTime: string,
    parkingDurationMinutes?: number,
    context?: ParkingOptionsRequestContext
  ): Promise<ParkingOptionsResult>;
  /**
   * Optional address → coordinates resolver (budget-guarded + cached). Used to
   * resolve trip origin/destination coordinates before route timing so live and
   * straight-line fallback timing both have coordinates. Optional so lightweight
   * mock providers (tests) need not implement it.
   */
  geocodeAddress?(address: string): Promise<{ lat: number; lng: number } | null>;
}

export class MockTrafficProvider implements TrafficProvider {
  async getTrafficEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    _destinationLatLng?: RouteLatLng | null,
    routeContext?: RouteRequestContext,
  ): Promise<TrafficEstimate> {
    const route = normalizeTrafficRoute(origin, destination);
    if (isClearlyNonDrivableRoute(origin, destination)) {
      return unavailableTrafficEstimate(
        route,
        'Route validation',
        routeUnavailableReasonForContext(routeContext),
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

function readPositiveTimeoutMs(name: string, fallback: number): number {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

function getParkingOptionsReturnBudgetMs(): number {
  const overall = readPositiveTimeoutMs('PARKING_FETCH_TIMEOUT_MS', 5000);
  const reserve = readPositiveTimeoutMs('PARKING_FETCH_RETURN_RESERVE_MS', 700);

  return Math.max(1000, overall - reserve);
}

function remainingParkingOptionsBudgetMs(startedAt: number): number {
  return Math.max(0, getParkingOptionsReturnBudgetMs() - (Date.now() - startedAt));
}

async function withParkingStepFallback<T>(
  label: string,
  startedAt: number,
  run: () => Promise<T>,
  fallback: T,
  maxStepMs: number,
): Promise<{ value: T; timedOut: boolean }> {
  const timeoutMs = Math.min(maxStepMs, remainingParkingOptionsBudgetMs(startedAt));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    debugLog('parking_enrichment_skipped', { label, reason: 'budget_exhausted' });
    return { value: fallback, timedOut: true };
  }

  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  return new Promise((resolve) => {
    let promise: Promise<T>;
    try {
      promise = run();
    } catch (error) {
      debugLog('parking_enrichment_failed', {
        label,
        message: error instanceof Error ? error.message : String(error),
      });
      resolve({ value: fallback, timedOut: false });
      return;
    }

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      debugLog('parking_enrichment_timeout', { label, timeoutMs });
      resolve({ value: fallback, timedOut: true });
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve({ value, timedOut: false });
      },
      (error) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        debugLog('parking_enrichment_failed', {
          label,
          message: error instanceof Error ? error.message : String(error),
        });
        resolve({ value: fallback, timedOut: false });
      },
    );
  });
}

function withDeferredParkingDetails(
  options: ParkingOption[],
  reason: string,
): ParkingOption[] {
  const note = 'Some live parking details are still refreshing. Open provider or directions to confirm.';

  return options.map((option) => ({
    ...option,
    assumptions: [
      ...(option.assumptions || []),
      ...(option.assumptions?.includes(note) ? [] : [note]),
    ],
    parkingRouteDebug: {
      ...(option.parkingRouteDebug || {}),
      deferredReason: reason,
    },
  }));
}

function getGoogleRouteTimeoutMs(): number {
  return readPositiveTimeoutMs('GOOGLE_ROUTE_TIMEOUT_MS', 4000);
}

function getMapboxRouteTimeoutMs(): number {
  return readPositiveTimeoutMs('MAPBOX_ROUTE_TIMEOUT_MS', 5000);
}

function hasMapboxAccessToken(): boolean {
  return Boolean(process.env.MAPBOX_ACCESS_TOKEN?.trim());
}

function isDisplayedQuickGoMainRoute(routeContext?: RouteRequestContext): boolean {
  return (
    routeContext?.routePurpose === 'main_to_destination' &&
    routeContext?.tripMode === 'quick-go'
  );
}

function isMainDestinationRoute(routeContext?: RouteRequestContext): boolean {
  return routeContext?.routePurpose === 'main_to_destination';
}

function routeDebugPayload(args: {
  routeKey: string;
  cacheKey: string;
  originLatLng?: RouteLatLng | null;
  destinationLatLng?: RouteLatLng | null;
  routeContext?: RouteRequestContext;
  estimate?: TrafficEstimate | null;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const originCoords = resolveRouteLatLng(args.originLatLng);
  const destinationCoords = resolveRouteLatLng(args.destinationLatLng);
  const estimate = args.estimate;

  return {
    route: args.routeKey,
    cacheKey: shortRequestKey(args.cacheKey),
    originCoordsPresent: Boolean(originCoords),
    destinationCoordsPresent: Boolean(destinationCoords),
    mapboxTokenPresent: hasMapboxAccessToken(),
    sourceName: estimate?.sourceName ?? null,
    trustStatus: estimate?.trustStatus ?? null,
    routeUnavailable: estimate?.routeUnavailable ?? null,
    duration: estimate?.duration ?? null,
    displayedInQuickGo: isDisplayedQuickGoMainRoute(args.routeContext),
    routePurpose: args.routeContext?.routePurpose ?? null,
    tripType: args.routeContext?.tripType ?? null,
    tripMode: args.routeContext?.tripMode ?? null,
    ...args.extra,
  };
}

/**
 * A cached estimate is only worth serving if it represents a real route result
 * (live Google Routes or a route snapshot). Cached straight-line/coordinate or
 * "unavailable" fallbacks must NOT be served on later requests, otherwise a single
 * transient failure (e.g. a momentary route-budget trip during testing) gets cached
 * and permanently shadows live timing until TTL expiry. Returning null for those
 * forces a live retry on the next request (still gated by budget/kill-switch, so no
 * extra Google calls happen while a real outage persists).
 */
export function isServeableCachedRouteEstimate(estimate: TrafficEstimate): boolean {
  if (estimate.routeUnavailable === true) return false;
  if (estimate.sourceName === 'Estimated from coordinates') return false;
  if (estimate.sourceName === 'Estimated route model') return false;
  return true;
}

function getCachedRouteEstimate(cacheKey: string): TrafficEstimate | null {
  const cached = ROUTE_CACHE.get(cacheKey);

  if (!cached) return null;

  if (Date.now() - cached.ts >= getRouteCacheTtlMs()) {
    ROUTE_CACHE.delete(cacheKey);
    return null;
  }

  if (!isServeableCachedRouteEstimate(cached.estimate)) {
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

  /**
   * Toll/HOV/express drive route comparison (Phase 1). Returns null without any
   * network call when the feature is disabled and the user did not choose a
   * toll/HOV option. Never makes the toll route Best Overall when the user
   * chose avoidTolls; never guarantees HOV/express eligibility.
   */
  async getDriveRouteOptions(
    origin: string,
    destination: string,
    dateTime: string,
    prefs: DriveRoutePreferences | null | undefined,
    context?: DriveRouteOptionsContext,
  ): Promise<DriveRouteRanking | null> {
    // Cheap gate first: avoid geocoding / network when not enabled or chosen.
    const { shouldComputeDriveRouteOptions } = await import(
      './routes/driveRouteProfiles'
    );
    if (
      !shouldComputeDriveRouteOptions({
        prefs,
        featureEnabled: context?.featureEnabled,
      })
    ) {
      return null;
    }

    if (!this.serverKey) return null;

    const [originLatLng, destinationLatLng] = await Promise.all([
      context?.originLatLng
        ? Promise.resolve(context.originLatLng)
        : this.geocodeAddress(origin),
      context?.destinationLatLng
        ? Promise.resolve(context.destinationLatLng)
        : this.geocodeAddress(destination),
    ]);

    return computeDriveRouteOptions({
      origin: originLatLng ?? origin,
      destination: destinationLatLng ?? destination,
      departureTime: dateTime,
      prefs,
      apiKey: this.serverKey,
      featureEnabled: context?.featureEnabled,
    });
  }

  /**
   * Backup route timing via Mapbox Directions (driving-traffic). Used ONLY for the
   * main route when Google Routes is unavailable. Server-side token only; never
   * exposed to the client. Returns null (skips) when the token or coordinates are
   * missing, or on any error/timeout/no-route. The user-facing "Open directions"
   * link continues to use Google Maps elsewhere.
   */
  private async mapboxRouteEstimate(
    args: {
      routeKey: string;
      cacheKey: string;
      originLatLng?: RouteLatLng | null;
      destinationLatLng?: RouteLatLng | null;
      routeContext?: RouteRequestContext;
    },
  ): Promise<TrafficEstimate | null> {
    const token = process.env.MAPBOX_ACCESS_TOKEN?.trim();
    const originCoords = resolveRouteLatLng(args.originLatLng);
    const destinationCoords = resolveRouteLatLng(args.destinationLatLng);
    const logMapboxEvent = (
      event: string,
      extra: Record<string, unknown>,
      estimate?: TrafficEstimate | null,
    ) => {
      debugLog(event, routeDebugPayload({
        routeKey: args.routeKey,
        cacheKey: args.cacheKey,
        originLatLng: args.originLatLng,
        destinationLatLng: args.destinationLatLng,
        routeContext: args.routeContext,
        estimate,
        extra,
      }));
    };

    if (!token) {
      logMapboxEvent('mapbox_route_skipped', { reason: 'missing_token' });
      debugLog('route_timing_mapbox_failed', { route: args.routeKey, reason: 'missing_token' });
      return null;
    }
    if (!originCoords || !destinationCoords) {
      logMapboxEvent('mapbox_route_skipped', { reason: 'missing_coordinates' });
      debugLog('route_timing_mapbox_failed', { route: args.routeKey, reason: 'missing_coordinates' });
      return null;
    }

    logMapboxEvent('mapbox_route_attempt', { timeoutMs: getMapboxRouteTimeoutMs() });
    debugLog('route_timing_mapbox_start', { route: args.routeKey });

    const coords = `${originCoords.lng},${originCoords.lat};${destinationCoords.lng},${destinationCoords.lat}`;
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}` +
      `?access_token=${encodeURIComponent(token)}&overview=false&annotations=duration,distance`;

    const timeoutMs = getMapboxRouteTimeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        logMapboxEvent('mapbox_route_failed', { reason: `http_${res.status}` });
        debugLog('route_timing_mapbox_failed', { route: args.routeKey, reason: `http_${res.status}` });
        return null;
      }

      const data = (await res.json()) as {
        routes?: Array<{ duration?: number; distance?: number }>;
        code?: string;
      };
      const route = Array.isArray(data?.routes) ? data.routes[0] : null;

      if (!route || typeof route.duration !== 'number' || !Number.isFinite(route.duration)) {
        logMapboxEvent('mapbox_route_failed', { reason: data?.code || 'no_route' });
        debugLog('route_timing_mapbox_failed', { route: args.routeKey, reason: data?.code || 'no_route' });
        return null;
      }

      const durationMinutes = Math.max(1, Math.round(route.duration / 60));
      const distanceMeters =
        typeof route.distance === 'number' && Number.isFinite(route.distance)
          ? Math.round(route.distance)
          : undefined;

      const estimate: TrafficEstimate = {
        route: args.routeKey,
        duration: durationMinutes,
        distanceMeters,
        congestion: 'medium',
        trustStatus: 'live',
        routeUnavailable: false,
        sourceName: 'Mapbox Directions',
        lastUpdated: new Date().toISOString(),
        assumptions: ['Backup route timing from Mapbox Directions (Google Routes unavailable).'],
      };

      logMapboxEvent('mapbox_route_success', { durationMinutes }, estimate);
      debugLog('route_timing_mapbox_success', { route: args.routeKey, durationMinutes });

      return estimate;
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'error';
      logMapboxEvent('mapbox_route_failed', { reason });
      debugLog('route_timing_mapbox_failed', {
        route: args.routeKey,
        reason,
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Final Quick Go backup chain after Google Routes is unavailable: Mapbox
   * Directions -> straight-line coordinate fallback -> unavailable. This returns
   * one final estimate only; Google failure is never surfaced to the UI as a
   * completed unavailable route while backup providers can still run.
   */
  private async resolveQuickGoRouteFinal(args: {
    routeKey: string;
    cacheKey: string;
    originLatLng?: RouteLatLng | null;
    destinationLatLng?: RouteLatLng | null;
    unavailableReason: string;
    routeContext?: RouteRequestContext;
    onRouteStatus?: (status: QuickGoRouteStatus) => void;
    requestKey?: string;
    chainStartedAt?: number;
  }): Promise<TrafficEstimate> {
    const allowMapbox = true;
    const chainStartedAt = args.chainStartedAt ?? Date.now();

    args.onRouteStatus?.('google_failed_trying_mapbox');
    if (isDisplayedQuickGoMainRoute(args.routeContext)) {
      debugLog('quickgo_route_chain_google_failed', {
        requestKey: args.requestKey,
        route: args.routeKey,
        originCoordsPresent: Boolean(resolveRouteLatLng(args.originLatLng)),
        destinationCoordsPresent: Boolean(resolveRouteLatLng(args.destinationLatLng)),
        elapsedMs: Date.now() - chainStartedAt,
      });
    }

    if (allowMapbox) {
      args.onRouteStatus?.('mapbox_loading');
      if (isDisplayedQuickGoMainRoute(args.routeContext)) {
        debugLog('quickgo_route_chain_mapbox_start', {
          requestKey: args.requestKey,
          route: args.routeKey,
          elapsedMs: Date.now() - chainStartedAt,
        });
      }
      const mapbox = await this.mapboxRouteEstimate({
        routeKey: args.routeKey,
        cacheKey: args.cacheKey,
        originLatLng: args.originLatLng,
        destinationLatLng: args.destinationLatLng,
        routeContext: args.routeContext,
      });
      if (mapbox) {
        if (isDisplayedQuickGoMainRoute(args.routeContext)) {
          debugLog('quickgo_route_chain_mapbox_success', {
            requestKey: args.requestKey,
            route: args.routeKey,
            provider: 'mapbox',
            status: 'ready',
            duration: mapbox.duration,
            elapsedMs: Date.now() - chainStartedAt,
          });
        }
        debugLog('route_timing_final', { source: 'mapbox', duration: mapbox.duration });
        return cacheRouteEstimate(args.cacheKey, mapbox);
      }
    } else {
      debugLog('mapbox_route_skipped', routeDebugPayload({
        routeKey: args.routeKey,
        cacheKey: args.cacheKey,
        originLatLng: args.originLatLng,
        destinationLatLng: args.destinationLatLng,
        routeContext: args.routeContext,
        extra: { reason: 'not_main_route' },
      }));
    }

    args.onRouteStatus?.('fallback_loading');
    if (isDisplayedQuickGoMainRoute(args.routeContext)) {
      debugLog('quickgo_route_chain_fallback_start', {
        requestKey: args.requestKey,
        route: args.routeKey,
        elapsedMs: Date.now() - chainStartedAt,
      });
    }
    const coordinateFallback = coordinateFallbackTrafficEstimate(
      args.routeKey,
      args.originLatLng,
      args.destinationLatLng,
    );
    if (coordinateFallback) {
      debugLog('coordinate_fallback_used', routeDebugPayload({
        routeKey: args.routeKey,
        cacheKey: args.cacheKey,
        originLatLng: args.originLatLng,
        destinationLatLng: args.destinationLatLng,
        routeContext: args.routeContext,
        estimate: coordinateFallback,
      }));
      debugLog('route_timing_coordinate_fallback_used', {
        route: args.routeKey,
        duration: coordinateFallback.duration,
      });
      debugLog('route_timing_final', { source: 'coordinate_fallback', duration: coordinateFallback.duration });
      if (isDisplayedQuickGoMainRoute(args.routeContext)) {
        debugLog('quickgo_route_chain_final', {
          requestKey: args.requestKey,
          route: args.routeKey,
          provider: 'coordinate_fallback',
          status: 'ready',
          duration: coordinateFallback.duration,
          elapsedMs: Date.now() - chainStartedAt,
        });
      }
      return cacheRouteEstimate(args.cacheKey, coordinateFallback);
    }

    debugLog('route_timing_final', { source: 'unavailable' });
    const unavailable = unavailableTrafficEstimate(args.routeKey, 'Google Routes API', args.unavailableReason);
    if (isDisplayedQuickGoMainRoute(args.routeContext)) {
      debugLog('quickgo_route_chain_final', {
        requestKey: args.requestKey,
        route: args.routeKey,
        provider: 'unavailable',
        status: 'unavailable',
        duration: unavailable.duration,
        elapsedMs: Date.now() - chainStartedAt,
      });
    }
    return cacheRouteEstimate(args.cacheKey, unavailable);
  }

  async getTrafficEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    destinationLatLng?: RouteLatLng | null,
    routeContext?: RouteRequestContext,
  ): Promise<TrafficEstimate> {
    // dateTime can be undefined at runtime (e.g., tests). Default to "now" to keep routing functional.
    const resolvedDateTime = (dateTime ?? new Date().toISOString());
    const providedOriginLatLng = resolveRouteLatLng(routeContext?.originLatLng);
    const providedDestinationLatLng = resolveRouteLatLng(destinationLatLng);
    let resolvedOriginLatLngForFallback = providedOriginLatLng;
    let resolvedDestinationLatLngForFallback = providedDestinationLatLng;
    const originKey = providedOriginLatLng ? routeLatLngKey(providedOriginLatLng) : origin;
    const destinationKey = providedDestinationLatLng
      ? routeLatLngKey(providedDestinationLatLng)
      : destination;
    const cacheKey = buildRouteEstimateCacheKey({
      origin: originKey,
      destination: destinationKey,
      dateTime: resolvedDateTime,
      mode: 'DRIVE',
      routePurpose: routeContext?.routePurpose,
      tripType: routeContext?.tripType,
      airportCode: routeContext?.airportCode,
      lotId: routeContext?.lotId,
    });
    const routeKey = normalizeTrafficRoute(origin, destination);
    const routeLabel = routeKey === 'home-airport' || routeKey === 'airport-home' ? routeKey : 'custom';
    const requestKey = shortRequestKey(cacheKey);
    const routeStartedAt = Date.now();
    let routeStatus: QuickGoRouteStatus = 'idle';
    const setRouteStatus = (next: QuickGoRouteStatus, extra: Record<string, unknown> = {}) => {
      if (next === routeStatus) return;
      const previous = routeStatus;
      routeStatus = next;
      if (isMainDestinationRoute(routeContext)) {
        debugLog('quickgo_route_status_change', {
          from: previous,
          to: next,
          route: routeKey,
          origin: originKey,
          destination: destinationKey,
          ...extra,
        });
      }
    };
    const logRouteEvent = (
      event: string,
      extra: Record<string, unknown> = {},
      estimate?: TrafficEstimate | null,
      originLatLng: RouteLatLng | null | undefined = resolvedOriginLatLngForFallback,
      destinationRouteLatLng: RouteLatLng | null | undefined = resolvedDestinationLatLngForFallback,
    ) => {
      debugLog(event, routeDebugPayload({
        routeKey,
        cacheKey,
        originLatLng,
        destinationLatLng: destinationRouteLatLng,
        routeContext,
        estimate,
        extra,
      }));
    };
    const finishRouteEstimate = (
      estimate: TrafficEstimate,
      stage: string,
      originLatLng: RouteLatLng | null | undefined = resolvedOriginLatLngForFallback,
      destinationRouteLatLng: RouteLatLng | null | undefined = resolvedDestinationLatLngForFallback,
    ): TrafficEstimate => {
      const enriched = attachTrafficRouteMetadata(estimate);
      setRouteStatus(enriched.routeStatus ?? (enriched.routeUnavailable ? 'unavailable' : 'ready'));
      if (isMainDestinationRoute(routeContext)) {
        logRouteEvent(
          'route_final',
          {
            stage,
            elapsedMs: Date.now() - routeStartedAt,
            source: enriched.routeSource,
            routeStatus: enriched.routeStatus,
            reason: enriched.routeUnavailableReason ?? null,
          },
          enriched,
          originLatLng,
          destinationRouteLatLng,
        );
      }
      if (isDisplayedQuickGoMainRoute(routeContext)) {
        logRouteEvent('quickgo_main_route_final', { stage }, enriched, originLatLng, destinationRouteLatLng);
        debugLog('quickgo_route_chain_final', {
          requestKey,
          route: routeKey,
          origin: originKey,
          destination: destinationKey,
          provider: enriched.routeSource ?? enriched.sourceName,
          status: enriched.routeStatus,
          duration: enriched.duration,
          elapsedMs: Date.now() - routeStartedAt,
        });
      }
      return enriched;
    };

    setRouteStatus(
      providedOriginLatLng && providedDestinationLatLng
        ? 'google_loading'
        : 'resolving_coordinates',
    );
    const backupChainContext = {
      requestKey,
      chainStartedAt: routeStartedAt,
    };

    if (isDisplayedQuickGoMainRoute(routeContext)) {
      debugLog('quickgo_route_chain_start', {
        requestKey,
        route: routeKey,
        origin: originKey,
        destination: destinationKey,
        originCoordsPresent: Boolean(providedOriginLatLng),
        destinationCoordsPresent: Boolean(providedDestinationLatLng),
      });
      logRouteEvent('quickgo_main_route_start', {
        requestKey,
        routeLabel,
      });
      logRouteEvent('quickgo_main_route_inputs', {
        requestKey,
        originTextPresent: Boolean(origin?.trim()),
        destinationTextPresent: Boolean(destination?.trim()),
      });
    }
    logRouteEvent('google_route_attempt', {
      requestKey,
      routeLabel,
      googleKeyPresent: Boolean(this.serverKey),
      timeoutMs: getGoogleRouteTimeoutMs(),
    });

    debugLog('route_timing_google_start', {
      route: routeKey,
      routePurpose: routeContext?.routePurpose,
      hasOriginCoords: Boolean(providedOriginLatLng),
      hasDestinationCoords: Boolean(providedDestinationLatLng),
    });
    if (isDisplayedQuickGoMainRoute(routeContext)) {
      debugLog('quickgo_route_chain_google_start', {
        requestKey,
        route: routeKey,
        origin: originKey,
        destination: destinationKey,
        elapsedMs: Date.now() - routeStartedAt,
      });
    }

    try {
      if (!providedOriginLatLng && isClearlyNonDrivableRoute(origin, destination)) {
        logRouteEvent('google_route_failed_or_unavailable', { reason: 'non_drivable_route' });
        return finishRouteEstimate(unavailableTrafficEstimate(
          routeKey,
          'Route validation',
          routeUnavailableReasonForContext(routeContext),
        ), 'route_validation');
      }

      if (isProviderKillSwitchEnabled('google_routes')) {
        logRouteEvent('google_route_failed_or_unavailable', { reason: 'kill_switch' });
        const snapshotEstimate = await routeSnapshotToTrafficEstimate({
          origin: originKey,
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
          return finishRouteEstimate(
            cacheRouteEstimate(cacheKey, snapshotEstimate),
            'snapshot_kill_switch',
          );
        }

        emitProviderCall({
          provider: 'google_routes',
          requestKey,
          blockedByKillSwitch: true,
        });
        return finishRouteEstimate(
          await this.resolveQuickGoRouteFinal({
            routeKey,
            cacheKey,
            originLatLng: providedOriginLatLng,
            destinationLatLng: providedDestinationLatLng,
            unavailableReason: 'Live routing disabled; using cached or estimated timing only.',
            routeContext,
            onRouteStatus: setRouteStatus,
            ...backupChainContext,
          }),
          'backup_after_kill_switch',
        );
      }

      if (!this.serverKey) {
        logRouteEvent('google_route_failed_or_unavailable', { reason: 'missing_google_key' });
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
        return finishRouteEstimate(cached, 'cache_hit');
      }

      const snapshotEstimate = await routeSnapshotToTrafficEstimate({
        origin: originKey,
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
        return finishRouteEstimate(
          cacheRouteEstimate(cacheKey, snapshotEstimate),
          'snapshot_hit',
        );
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
        return finishRouteEstimate(await existingInFlight, 'in_flight_hit');
      }

      const inflightPromise = (async () => {
        const budget = await canMakeLiveApiCall('google_routes');
        if (!budget.allowed) {
          logRouteEvent('google_route_failed_or_unavailable', {
            reason: budget.reason,
            blockedBy: budget.reason === 'kill_switch' ? 'kill_switch' : 'budget',
          });
          emitProviderCall({
            provider: 'google_routes',
            requestKey,
            blockedByBudget: budget.reason !== 'kill_switch',
            blockedByKillSwitch: budget.reason === 'kill_switch',
            note: budget.reason,
          });
          debugLog('route_timing_live_blocked', {
            route: routeKey,
            reason: budget.reason,
            blockedBy: budget.reason === 'kill_switch' ? 'kill_switch' : 'budget',
            hasOriginCoords: Boolean(providedOriginLatLng),
            hasDestinationCoords: Boolean(providedDestinationLatLng),
          });

          const staleSnapshot = await getCachedRouteQuoteSnapshot({
            origin: originKey,
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

          return await this.resolveQuickGoRouteFinal({
            routeKey,
            cacheKey,
            originLatLng: providedOriginLatLng,
            destinationLatLng: providedDestinationLatLng,
            unavailableReason: 'Route budget exceeded; open map directions to confirm drive time.',
            routeContext,
            onRouteStatus: setRouteStatus,
            ...backupChainContext,
          });
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
          providedOriginLatLng
            ? Promise.resolve(providedOriginLatLng)
            : this.geocodeAddress(origin),
          providedDestinationLatLng
            ? Promise.resolve(providedDestinationLatLng)
            : this.geocodeAddress(destination),
        ]);
        resolvedOriginLatLngForFallback = originLatLng;
        resolvedDestinationLatLngForFallback = destLatLng;

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

        // Perform the network call with a bounded Google window so the Mapbox
        // backup can still run before the engine-level traffic timeout.
        const googleTimeoutMs = getGoogleRouteTimeoutMs();
        const googleController = new AbortController();
        const googleTimer = setTimeout(() => googleController.abort(), googleTimeoutMs);
        let res: Response;
        try {
          res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: googleController.signal,
          });
        } finally {
          clearTimeout(googleTimer);
        }

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
          logRouteEvent(
            'google_route_failed_or_unavailable',
            {
              reason: 'route_condition_unavailable',
              condition,
              status: statusIsEmptyObject ? '[empty object]' : String(statusField),
            },
            null,
            originLatLng,
            destLatLng,
          );
          return await this.resolveQuickGoRouteFinal({
            routeKey,
            cacheKey,
            originLatLng,
            destinationLatLng: destLatLng,
            unavailableReason:
              'Google Routes could not calculate a driving route for this origin and destination.',
            routeContext,
            onRouteStatus: setRouteStatus,
            ...backupChainContext,
          });
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

        logRouteEvent(
          'google_route_success',
          {
            durationMinutes,
            usedCoordinates: Boolean(originLatLng && destLatLng),
          },
          estimate,
          originLatLng,
          destLatLng,
        );
        debugLog('route_timing_live_success', {
          route: routeKey,
          durationMinutes,
          usedCoordinates: Boolean(originLatLng && destLatLng),
        });
        debugLog('route_timing_google_success', { route: routeKey, durationMinutes });
        debugLog('route_timing_final', { source: 'google', duration: durationMinutes });

        void saveRouteQuoteSnapshot({
          provider: 'google_routes',
          origin: originKey,
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
        return finishRouteEstimate(await inflightPromise, 'provider_result');
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

      logRouteEvent('google_route_failed_or_unavailable', {
        reason: safeMsg,
      });
      debugLog('route_timing_google_failed', {
        route: routeKey,
        reason: safeMsg,
      });

      return finishRouteEstimate(
        await this.resolveQuickGoRouteFinal({
          routeKey,
          cacheKey,
          originLatLng: resolvedOriginLatLngForFallback,
          destinationLatLng: resolvedDestinationLatLngForFallback,
          unavailableReason: routeUnavailableReasonForContext(routeContext),
          routeContext,
          onRouteStatus: setRouteStatus,
          ...backupChainContext,
        }),
        'backup_after_google_failure',
      );
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

  /** Public address → coordinates resolver (cached + budget-guarded via LiveTrafficProvider). */
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    return this.geocodeLatLng(address);
  }

  private async getRouteEstimate(
    origin: string,
    destination: string,
    dateTime: string,
    allowLive: boolean,
    destinationLatLng?: RouteLatLng | null,
    routeContext?: RouteRequestContext,
  ): Promise<TrafficEstimate> {
    const routeOriginLatLng = resolveRouteLatLng(routeContext?.originLatLng);
    const destinationKey = destinationLatLng
      ? routeLatLngKey(destinationLatLng)
      : destination;
    const cacheKey = buildRouteEstimateCacheKey({
      origin: routeOriginLatLng ? routeLatLngKey(routeOriginLatLng) : origin,
      destination: destinationKey,
      dateTime,
      mode: allowLive ? 'DRIVE_LIVE' : 'DRIVE_ESTIMATED',
      routePurpose: routeContext?.routePurpose,
      tripType: routeContext?.tripType,
      airportCode: routeContext?.airportCode,
      lotId: routeContext?.lotId,
    });

    const cachedEstimate = this.routeCache.get(cacheKey);
    if (cachedEstimate && isServeableCachedRouteEstimate(cachedEstimate)) {
      if (allowLive) {
        logRoutesApiCache('Routes API cache hit', cacheKey, 'provider-route');
      }
      return cachedEstimate;
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
          routeUnavailableReasonForContext(routeContext),
        );
      } else if (allowLive) {
        estimate = await this.trafficProvider.getTrafficEstimate(
          origin,
          destination,
          dateTime,
          destinationLatLng,
          routeContext,
        );
      } else if (isParkingOriginToLotPurpose(routeContext?.routePurpose)) {
        const coordEstimate = coordinateFallbackTrafficEstimate(
          normalizeTrafficRoute(origin, destination),
          routeOriginLatLng,
          destinationLatLng,
        );
        estimate = coordEstimate ?? unavailableTrafficEstimate(
          normalizeTrafficRoute(origin, destination),
          'Route validation',
          routeUnavailableReasonForContext(routeContext),
        );
      } else {
        estimate = this.estimateRouteDuration(origin, destination, 35);
      }

      if (isServeableCachedRouteEstimate(estimate)) {
        this.routeCache.set(cacheKey, estimate);
      }
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
    destinationLatLng?: RouteLatLng | null,
    routeContext?: RouteRequestContext,
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
    const result = await this.getParkingOptionsWithMetadata(
      origin,
      destination,
      dateTime,
      parkingDurationMinutes,
      context,
    );
    return result.options;
  }

  async getParkingOptionsWithMetadata(
    origin: string,
    destination: string,
    dateTime: string,
    parkingDurationMinutes?: number,
    context?: ParkingOptionsRequestContext
  ): Promise<ParkingOptionsResult> {
    const parkingOptionsStartedAt = Date.now();
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

    const contextDestinationCoords =
      typeof context?.destinationLat === 'number' &&
      typeof context?.destinationLng === 'number'
        ? { lat: context.destinationLat, lng: context.destinationLng }
        : null;
    const destinationCoords =
      resolveRouteLatLng(context?.destinationCoordinates) ??
      contextDestinationCoords ??
      (!isAirportDestination ? await this.geocodeLatLng(destination) : undefined);

    const {
      getLiveParkingOptions,
      getDestinationParkingOptions,
      getDestinationParkingOptionsWithMetadata,
    } = await import('./providers/parkingAggregator');
    let parkingDiscoveryMetadata: ParkingDiscoveryMetadata | undefined;
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
      : getDestinationParkingOptionsWithMetadata
        ? await getDestinationParkingOptionsWithMetadata({
            origin,
            destination,
            destinationName: context?.destinationName,
            destinationKind,
            dateTime,
            parkingDurationMinutes,
            destinationLat: destinationCoords?.lat ?? context?.destinationLat,
            destinationLng: destinationCoords?.lng ?? context?.destinationLng,
            checkInDate: parkingDates.checkInDate,
            checkOutDate: parkingDates.checkOutDate,
            checkInAt: parkingDates.checkInAt,
            checkOutAt: parkingDates.checkOutAt,
          }).then((result) => {
            parkingDiscoveryMetadata = result.metadata;
            return result.options;
          })
        : await getDestinationParkingOptions({
            origin,
            destination,
            destinationName: context?.destinationName,
            destinationKind,
            dateTime,
            parkingDurationMinutes,
            destinationLat: destinationCoords?.lat ?? context?.destinationLat,
            destinationLng: destinationCoords?.lng ?? context?.destinationLng,
            checkInDate: parkingDates.checkInDate,
            checkOutDate: parkingDates.checkOutDate,
            checkInAt: parkingDates.checkInAt,
            checkOutAt: parkingDates.checkOutAt,
          });

    if (liveParkingOptions.length === 0) {
      return { options: [], metadata: parkingDiscoveryMetadata };
    }
    if (remainingParkingOptionsBudgetMs(parkingOptionsStartedAt) <= 0) {
      return {
        options: withDeferredParkingDetails(liveParkingOptions, 'base_provider_results_near_timeout'),
        metadata: parkingDiscoveryMetadata,
      };
    }

    const { value: parkingSource, timedOut: canonicalTimedOut } = await withParkingStepFallback(
      'canonical_parking_coordinates',
      parkingOptionsStartedAt,
      () => Promise.all(
        liveParkingOptions.map(async (option) => {
          const canonicalUpdate = await resolveCanonicalParkingCoordinates({
            option,
            airportCode: isAirportDestination ? airportCode : null,
            destinationContext: isAirportDestination ? undefined : destination,
            geocodeAddress: (address) => this.geocodeLatLng(address),
          });

          return applyCanonicalCoordinatesToOption(option, canonicalUpdate);
        }),
      ),
      liveParkingOptions,
      readPositiveTimeoutMs('PARKING_CANONICAL_ENRICH_TIMEOUT_MS', 900),
    );

    if (canonicalTimedOut && remainingParkingOptionsBudgetMs(parkingOptionsStartedAt) <= 0) {
      return {
        options: withDeferredParkingDetails(parkingSource, 'canonical_coordinates_timeout'),
        metadata: parkingDiscoveryMetadata,
      };
    }

    const routeDestination = isAirportDestination
      ? resolveAirportDestinationForRouting(destination)
      : destination;
    const routeDepartureTime = context?.routeDepartureTime || dateTime;
    const routeDestinationCoords = isAirportDestination ? null : destinationCoords ?? null;
    const { value: destinationRouteEstimate } = await withParkingStepFallback<TrafficEstimate | null>(
      'parking_destination_route',
      parkingOptionsStartedAt,
      () => this.getRouteEstimate(
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
      ),
      null,
      readPositiveTimeoutMs('PARKING_DESTINATION_ROUTE_TIMEOUT_MS', 1200),
    );

    const { value: originCoords } = await withParkingStepFallback<RouteLatLng | null>(
      'parking_origin_geocode',
      parkingOptionsStartedAt,
      () => this.geocodeLatLng(origin),
      null,
      readPositiveTimeoutMs('PARKING_ORIGIN_GEOCODE_TIMEOUT_MS', 700),
    );

    // Do not hide parking lots just because the home → airport route failed.
    // Parking discovery can still be useful; individual lot routes can be checked separately.
    const destinationDriveUnavailable = Boolean(destinationRouteEstimate?.routeUnavailable);

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

    const originRouteKey = originCoords
      ? routeLatLngKey(originCoords)
      : origin;

    const parkingRouteEntries = parkingSource.map((option) => {
      const lotDestination = resolveParkingLotDestination(option, routeDestination);
      let routeDestinationForLot = lotDestination.destination || routeDestinationFor(option);
      const routeCoords = getParkingRouteCoordinates(option);
      const destinationLatLng =
        typeof routeCoords.lat === 'number' && typeof routeCoords.lng === 'number'
          ? { lat: routeCoords.lat, lng: routeCoords.lng }
          : null;

      const airportNormalizedDestination = routeDestination.trim().toLowerCase();
      const lotNormalizedDestination = routeDestinationForLot.trim().toLowerCase();
      const routesToAirport =
        lotNormalizedDestination === airportNormalizedDestination ||
        lotNormalizedDestination.includes('seattle-tacoma international airport');

      if (routesToAirport && destinationLatLng) {
        routeDestinationForLot = routeLatLngKey(destinationLatLng);
      }

      const routeDestinationKey = destinationLatLng
        ? routeLatLngKey(destinationLatLng)
        : routeDestinationForLot;
      const sharedCacheArgs = {
        origin: originRouteKey,
        destination: routeDestinationKey,
        dateTime: routeDepartureTime,
        routePurpose: PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE,
        lotId: option.id,
        airportCode: isAirportDestination ? airportCode : null,
      };

      return {
        option,
        lotDestination,
        routeDestination: routeDestinationForLot,
        destinationLatLng,
        routesToAirport,
        routeCacheKey: buildRouteEstimateCacheKey({
          ...sharedCacheArgs,
          mode: 'DRIVE_LIVE',
        }),
        liveRouteCacheKey: buildRouteEstimateCacheKey({
          ...sharedCacheArgs,
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
          routePurpose: PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE,
          originLatLng: originCoords,
          targetTerminalArrivalTime: context?.targetTerminalArrivalTime,
        },
      );
      parkingRouteEstimates.set(parkingEstimateKey, promise);

      return promise;
    };

    const routeEnrichmentFallback = withDeferredParkingDetails(
      parkingSource,
      'parking_route_enrichment_timeout',
    );
    const { value: enriched } = await withParkingStepFallback(
      'parking_route_enrichment',
      parkingOptionsStartedAt,
      () => Promise.all(
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

        const meta = resolveParkingTransferMeta(option, context);
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

        const logRouteToLot = (args: {
          source: 'google_live' | 'google_cached' | 'mapbox' | 'fallback' | 'unavailable' | 'deferred_haversine';
          durationMinutes: number | null;
          routeEstimate?: TrafficEstimate | null;
          cached?: boolean;
        }) => {
          logParkingRouteToLot({
            lotName: option.name,
            lotAddress: option.address || option.normalizedAddress || routeDestination,
            lotCoordinates: routeTargetCoords,
            originText: origin,
            originCoordinates: originCoords,
            routePurpose: PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE,
            cacheKey: entry.routeCacheKey,
            liveRouteCacheKey: entry.liveRouteCacheKey,
            source: args.source,
            durationMinutes: args.durationMinutes,
            distanceMeters: args.routeEstimate?.distanceMeters ?? null,
            departureTime: routeDepartureTime,
            trafficAware: args.routeEstimate?.sourceName === 'Google Routes API' ||
              args.routeEstimate?.sourceName === 'Mapbox Directions',
            routeToLot: !entry.routesToAirport,
            routeToAirport: entry.routesToAirport,
            cached: args.cached === true,
            cacheKeyComponents: {
              origin: originRouteKey,
              destination: entry.destinationLatLng
                ? routeLatLngKey(entry.destinationLatLng)
                : routeDestination,
              lotId: String(option.id || ''),
              mode: shouldUseLiveRoute ? 'DRIVE_LIVE' : 'DRIVE_ESTIMATED',
            },
          });
        };

        if (!shouldUseLiveRoute) {
          const fallbackDriveMinutes = await resolveFallbackDriveMinutes();

          logRouteToLot({
            source: 'deferred_haversine',
            durationMinutes: fallbackDriveMinutes > 0 ? fallbackDriveMinutes : null,
          });

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
            'haversine-estimated',
            routeTarget,
          );

          return deferredOption;
        }

        const routeWasCached =
          this.routeCache.has(entry.routeCacheKey) ||
          Boolean(getCachedRouteEstimate(entry.liveRouteCacheKey));
        const routeEstimate = await getParkingRouteEstimate(entry, true);

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
          !isUntrustedParkingRouteEstimate(routeEstimate) &&
          typeof routeEstimate.duration === 'number'
            ? routeEstimate.duration
            : null;

        const routeFailed =
          isUntrustedParkingRouteEstimate(routeEstimate) || liveDriveMinutes == null;
        const fallbackDriveMinutes = routeFailed ? await resolveFallbackDriveMinutes() : 0;
        const driveMinutes = routeFailed
          ? fallbackDriveMinutes
          : liveDriveMinutes!;
        const routeWasLive = routeEstimate.trustStatus === 'live';

        logRouteToLot({
          source: routeFailed
            ? 'fallback'
            : routeEstimate.sourceName === 'Mapbox Directions'
              ? 'mapbox'
              : routeWasCached
                ? 'google_cached'
                : 'google_live',
          durationMinutes: driveMinutes > 0 ? driveMinutes : null,
          routeEstimate,
          cached: routeWasCached,
        });

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
        }),
      ),
      routeEnrichmentFallback,
      readPositiveTimeoutMs('PARKING_ROUTE_ENRICH_TIMEOUT_MS', 1600),
    );

    return { options: enriched, metadata: parkingDiscoveryMetadata };
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

      const fareResolution = resolveTransitFare({ destination, origin });
      const oneWayFare = fareResolution.oneWayDollars ?? 0;

      return [
        {
          id: 'regional-transit-to-destination',
          name: 'Transit route to destination',
          price: oneWayFare,
          duration: estimatedTransitMinutes,
          frequency: 15,
          totalDuration: estimatedTransitMinutes,
          totalCost: oneWayFare,
          segments: [
            {
              mode: 'bus',
              name: 'Open transit directions for exact route',
              duration: estimatedTransitMinutes,
              cost: oneWayFare,
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
            fareResolution.matchKind === 'unknown'
              ? 'Open transit directions to confirm route and local fare.'
              : `${fareResolution.fareLabel}. Open transit directions for exact route.`,
            routeEstimate.routeUnavailable
              ? 'Drive time unavailable; open transit directions to confirm route.'
              : 'Transit time estimated from entered origin and destination.',
          ],
          sourceName:
            fareResolution.matchKind === 'unknown'
              ? 'Google Maps transit directions'
              : fareResolution.agencyName || fareResolution.sourceLabel,
          sourceLink: fareResolution.sourceUrl || this.buildGoogleTransitDirectionsLink(origin, destination),
          mapLink: this.buildGoogleTransitDirectionsLink(origin, destination),
          lastUpdated: new Date().toISOString(),
          transitFareResolution: fareResolution,
          priceNote:
            fareResolution.matchKind === 'unknown'
              ? 'Fare varies by agency'
              : fareResolution.fareLabel,
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
