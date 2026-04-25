import { ParkingOption, RideshareOption, TransitJourney, TrafficEstimate, FlightInfo, LocationInfo, TsaEstimate } from './types';
import { mockParkingOptions, mockRideshareOptions, mockTrafficEstimates, mockFlightInfo, mockLocationInfo } from '../data/mockData';
import { seaTacAirport } from './airports';
import { getAirportById } from './airports/catalog';


// Startup log for server-side API key presence (do not log the key itself)
try {
  const _present = !!process.env.GOOGLE_MAPS_SERVER_API_KEY;
  console.log('Google Maps server key detected:', _present ? 'yes' : 'no');
} catch (e) {
  // ignore
}

// Data-driven approach to determine transit hubs for non-direct rail origins

// Small dataset for WA-focused transit hubs (MVP)
const transitHubs = [
  { name: 'Northgate Transit Center', driveTimeFactor: 30, transitTime: 45, isParkAndRide: false },
  { name: 'Lynnwood Transit Center', driveTimeFactor: 40, transitTime: 55, isParkAndRide: true },
  { name: 'Tukwila International Blvd Station', driveTimeFactor: 50, transitTime: 55, isParkAndRide: false },
  { name: 'Angle Lake Station', driveTimeFactor: 55, transitTime: 60, isParkAndRide: true },
];

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

export interface TrafficProvider {
  getTrafficEstimate(origin: string, destination: string, dateTime: string): Promise<TrafficEstimate>;
}

export interface ParkingProvider {
  getParkingOptions(origin: string, destination: string, dateTime: string): Promise<ParkingOption[]>;
}

export interface FlightProvider {
  getFlightInfo(destination: string, dateTime: string): Promise<FlightInfo>;
}

export interface TsaProvider {
  getTsaEstimate(destination: string): Promise<TsaEstimate>;
}

export interface AirportInfoProvider {
  getAirportInfo(destination: string): Promise<LocationInfo>;
}

export interface DataProvider extends TrafficProvider, ParkingProvider, FlightProvider, TsaProvider, AirportInfoProvider {
  getRideshareOptions(origin: string, destination: string, dateTime: string): Promise<RideshareOption[]>;
  getTransitOptions(origin: string, destination: string, dateTime: string): Promise<TransitJourney[]>;
  getParkingOptions(origin: string, destination: string, dateTime: string): Promise<ParkingOption[]>;
}

export class MockTrafficProvider implements TrafficProvider {
  async getTrafficEstimate(origin: string, destination: string, dateTime: string): Promise<TrafficEstimate> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const route = normalizeTrafficRoute(origin, destination);
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
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function hashCacheKey(input: string): string {
  // Non-cryptographic hash for log correlation without leaking address strings.
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function logGoogleRoutesCache(event: 'HIT' | 'MISS' | 'IN-FLIGHT', cacheKey: string, routeLabel: string) {
  console.log(`[GoogleRoutesCache] ${event}`, { id: hashCacheKey(cacheKey), route: routeLabel });
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
    const cacheKey = `${origin.trim()}|${destination.trim()}|${resolvedDateTime.trim()}`;
    const routeKey = normalizeTrafficRoute(origin, destination);
    const routeLabel = routeKey === 'home-airport' || routeKey === 'airport-home' ? routeKey : 'custom';

    try {
      if (!this.serverKey) {
        throw new Error('Google Maps server API key not configured');
      }

      const now = Date.now();
      const cached = ROUTE_CACHE.get(cacheKey);
      if (cached && now - cached.ts < CACHE_TTL_MS) {
        logGoogleRoutesCache('HIT', cacheKey, routeLabel);
        return cached.estimate;
      }
      if (cached) {
        ROUTE_CACHE.delete(cacheKey);
      }

      const existingInFlight = ROUTE_INFLIGHT.get(cacheKey);
      if (existingInFlight) {
        logGoogleRoutesCache('IN-FLIGHT', cacheKey, routeLabel);
        return await existingInFlight;
      }

      logGoogleRoutesCache('MISS', cacheKey, routeLabel);

      const inflightPromise = (async () => {
        // Geocode origin and destination where possible
        const [originLatLng, destLatLng] = await Promise.all([
          this.geocodeLatLng(origin),
          this.geocodeLatLng(destination),
        ]);

        // Prepare computeRouteMatrix request body
        const departureTimeSeconds = Math.max(0, Math.floor(new Date(resolvedDateTime).getTime() / 1000));

        const body: any = {
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
          origins: [],
          destinations: [],
          // regionCode helps routing in ambiguous areas
          regionCode: 'US',
          departureTime: { seconds: departureTimeSeconds },
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
        if (process.env.NODE_ENV === 'development') {
          console.log('Google Routes API HTTP status:', res.status);
          console.log('Google Routes API response snippet:', text ? text.slice(0, 500) : '[empty]');
        }

        if (!text) {
          throw new Error('Empty response from Routes API');
        }

        let data: any = null;
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
        let element: any = null;

        if (Array.isArray(data) && data.length > 0) {
          // dataset is array of elements
          element = data[0];
        } else {
          const rows = data?.rows ?? data?.matrix?.rows ?? null;
          if (!rows || !rows[0] || !rows[0].elements || !rows[0].elements[0]) {
            throw new Error(`Invalid Routes API response: ${data?.error?.message || 'no rows'}`);
          }
          element = rows[0].elements[0];
        }

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
        else if (element?.duration && typeof element.duration.value === 'number') hasDuration = true;
        else if (element?.staticDuration) hasDuration = true;

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
        } else if (element.duration && typeof element.duration.value === 'number') {
          durationMs = element.duration.value * 1000;
        } else if (typeof element.staticDuration === 'string') {
          const m = element.staticDuration.match(/^(\d+)s$/);
          if (m) durationMs = parseInt(m[1], 10) * 1000;
        } else if (element.staticDuration && typeof element.staticDuration === 'number') {
          durationMs = element.staticDuration;
        }

        if (durationMs == null) {
          throw new Error('No duration available from Routes API');
        }

        const durationMinutes = Math.ceil(durationMs / 60000);

        // Heuristic congestion: compare traffic-aware duration vs staticDuration if available
        let congestion: 'low' | 'medium' | 'high' = 'medium';
        let staticMs: number | null = null;
        if (typeof element.staticDuration === 'string') {
          const m = element.staticDuration.match(/^(\d+)s$/);
          if (m) staticMs = parseInt(m[1], 10) * 1000;
        } else if (typeof element.staticDuration === 'number') {
          staticMs = element.staticDuration;
        } else if (element.duration && typeof element.duration.value === 'number' && typeof element.durationMillis === 'number') {
          staticMs = element.duration.value * 1000;
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
          staticDuration: staticMs ? Math.ceil(staticMs / 60000) : undefined,
          congestion,
          trustStatus: 'live',
          sourceName: 'Google Routes API',
          lastUpdated: new Date().toISOString(),
          assumptions: ['Real-time traffic data from Google Routes API', 'May vary by time of day'],
        };

        // store in cache
        try {
          ROUTE_CACHE.set(cacheKey, { ts: Date.now(), estimate });
        } catch (e) {
          // ignore
        }

        if (process.env.NODE_ENV === 'development') console.log('Routes API: success (live) HTTP status OK');
        return estimate;
      })();

      ROUTE_INFLIGHT.set(cacheKey, inflightPromise);
      try {
        return await inflightPromise;
      } finally {
        ROUTE_INFLIGHT.delete(cacheKey);
      }
    } catch (error: any) {
      // Log safe status message if available
      const safeMsg = error?.message || (error?.error?.message) || String(error);
      console.warn('Live traffic API failed, falling back to mock:', safeMsg);

      return mockTrafficEstimates[routeKey] || {
        route: routeKey,
        duration: 25,
        congestion: 'medium',
        trustStatus: 'estimated',
        sourceName: 'Historical averages',
        lastUpdated: new Date().toISOString(),
        assumptions: ['Fallback data', 'Based on typical conditions'],
      };
    }
  }
}

export class MockProvider implements DataProvider {
  private trafficProvider: TrafficProvider;
  private routeCache = new Map<string, TrafficEstimate>();

  constructor() {
    const trafficProviderType = process.env.TRAFFIC_PROVIDER || 'live';
    this.trafficProvider = trafficProviderType === 'live' ? new LiveTrafficProvider() : new MockTrafficProvider();
  }

  private buildGoogleDirectionsLink(origin: string, destination: string): string {
    return `https://www.google.com/maps/dir/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}`;
  }

  private buildGoogleMapsSearchLink(query: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  private estimateRouteDuration(origin: string, destination: string, fallbackMinutes: number): TrafficEstimate {
    const originLower = origin.toLowerCase();
    let duration = fallbackMinutes;

    if (originLower.includes('monroe') || originLower.includes('98272')) {
      duration = Math.max(fallbackMinutes, 50);
    } else if (originLower.includes('seattle') || originLower.includes('98101')) {
      duration = Math.min(fallbackMinutes, 25);
    }

    return {
      route: `${origin}->${destination}`,
      duration,
      congestion: 'medium',
      trustStatus: 'estimated',
      sourceName: 'Estimated route model',
      lastUpdated: new Date().toISOString(),
      assumptions: [`Estimated origin-aware travel time for ${origin} to ${destination}`],
    };
  }

  private estimateHubDriveTime(origin: string, hub: { driveTimeFactor: number }): number {
    const originLower = origin.toLowerCase();
    if (originLower.includes('monroe') || originLower.includes('98272')) {
      return hub.driveTimeFactor;
    }
    if (originLower.includes('seattle') || originLower.includes('98101')) {
      return Math.max(15, hub.driveTimeFactor - 10);
    }
    return hub.driveTimeFactor + 5;
  }

  private async getRouteEstimate(origin: string, destination: string, dateTime: string, allowLive: boolean): Promise<TrafficEstimate> {
    const cacheKey = `${origin}|${destination}|${dateTime}|${allowLive}`;
    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    let estimate: TrafficEstimate;
    if (allowLive && this.trafficProvider instanceof LiveTrafficProvider) {
      estimate = await this.trafficProvider.getTrafficEstimate(origin, destination, dateTime);
    } else {
      estimate = this.estimateRouteDuration(origin, destination, 35);
    }

    this.routeCache.set(cacheKey, estimate);
    return estimate;
  }

  async getTrafficEstimate(origin: string, destination: string, dateTime: string): Promise<TrafficEstimate> {
    const routeDestination = resolveAirportDestinationForRouting(destination);
    return this.trafficProvider.getTrafficEstimate(origin, routeDestination, dateTime);
  }

  async getParkingOptions(origin: string, destination: string, dateTime: string): Promise<ParkingOption[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const routeOrigins = origin;

    const airport = getAirportById(destination) || getAirportById(destination.slice(0, 3));
    const airportCode = airport?.id || 'SEA';

    const parkingSource =
      airportCode === 'SEA'
        ? mockParkingOptions
        : [
          {
            id: 'generic-parking',
            name: `${airportCode} Airport Parking`,
            type: 'official' as const,
            price: 25,
            distance: 10,
            availability: 80,
            parkingBufferMinutes: 10,
            transferToTerminalMinutes: 5,
            transferType: 'walk' as const,
            assumptions: ['Generic fallback airport parking'],
          },
        ];

    return Promise.all(parkingSource.map(async option => {
      const routeDestination = resolveAirportDestinationForRouting(destination);
      const shouldLiveRoute = option.type === 'official';
      const routeEstimate = shouldLiveRoute
        ? await this.getRouteEstimate(origin, routeDestination, dateTime, true)
        : this.estimateRouteDuration(origin, routeDestination, option.id === 'off-airport-1' ? 55 : 60);

      const meta = resolveParkingTransferMeta(option);
      const parkingBufferMinutes = option.parkingBufferMinutes ?? meta.parkingBufferMinutes;
      const transferToTerminalMinutes = option.transferToTerminalMinutes ?? meta.transferToTerminalMinutes;
      const transferType = option.transferType ?? meta.transferType;

      const mapLink = this.buildGoogleDirectionsLink(origin, routeDestination);
      const sourceLink = option.sourceLink && option.sourceLink.includes('example.com') ? undefined : option.sourceLink;

      return {
        ...option,
        parkingBufferMinutes,
        transferToTerminalMinutes,
        transferType,
        distance: routeEstimate.duration,
        routeTrustStatus: routeEstimate.trustStatus,
        routeOrigin: routeOrigins,
        routeDestination,
        sourceLink,
        mapLink,
        lastUpdated: new Date().toISOString(),
        assumptions: [
          ...option.assumptions,
          `Route from ${origin} to ${routeDestination}`,
          routeEstimate.trustStatus === 'live' ? 'Based on live routing' : 'Estimated route time for origin-aware travel',
        ],
      };
    }));
  }

  async getRideshareOptions(origin: string, destination: string, dateTime: string): Promise<RideshareOption[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const routeDestination = resolveAirportDestinationForRouting(destination);
    const routeEstimate = await this.getRouteEstimate(origin, routeDestination, dateTime, true);
    const baseDuration = routeEstimate.duration + 5;

    return mockRideshareOptions.map(option => {
      const taxiQuery = origin?.trim() ? `Taxi near ${origin}` : 'Taxi SeaTac';

      return {
        ...option,
        duration: baseDuration,
        routeTrustStatus: routeEstimate.trustStatus,
        routeOrigin: origin,
        routeDestination,
        sourceLink: option.id === 'uber'
          ? 'https://m.uber.com/ul/?action=setPickup&pickup=my_location'
          : option.id === 'lyft'
            ? 'https://lyft.com/ride'
            : option.id === 'taxi'
              ? this.buildGoogleMapsSearchLink(taxiQuery)
              : undefined,
        mapLink: this.buildGoogleDirectionsLink(origin, routeDestination),
        lastUpdated: new Date().toISOString(),
        assumptions: [
          ...option.assumptions,
          `Route from ${origin} to ${routeDestination}`,
          routeEstimate.trustStatus === 'live' ? 'Based on live traffic and pickup routing' : 'Estimated ride time',
        ],
      };
    });
  }

  async getTransitOptions(origin: string, destination: string, dateTime: string): Promise<TransitJourney[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
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
        price: 3.25,
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
    await new Promise((resolve) => setTimeout(resolve, 100));
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

  async getTsaEstimate(destination: string): Promise<TsaEstimate> {
    const airport = getAirportById(destination) || getAirportById(destination.slice(0, 3));
    const code = airport?.id || 'SEA';

    if (code === 'SEA') {
      return seaTacAirport.getTsaEstimate(destination);
    }

    return {
      destination: code,
      waitTime: 20,
      status: 'estimated',
      trustStatus: 'estimated',
      sourceName: `${code} Generic TSA`,
      lastUpdated: new Date().toISOString(),
      assumptions: ['Fallback TSA estimate'],
    };
  }

  async getAirportInfo(terminal: string): Promise<LocationInfo> {
    await new Promise((resolve) => setTimeout(resolve, 100));
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
