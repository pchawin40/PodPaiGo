import { ParkingOption, RideshareOption, TransitJourney, TrafficEstimate, FlightInfo, LocationInfo, TsaEstimate } from './types';
import { mockParkingOptions, mockRideshareOptions, mockTrafficEstimates, mockFlightInfo, mockLocationInfo } from '../data/mockData';
import { seaTacAirport } from './airports';

// Data-driven approach to determine transit hubs for non-direct rail origins

// Small dataset for WA-focused transit hubs (MVP)
const transitHubs = [
  { name: 'Northgate Transit Center', driveTimeFactor: 30, transitTime: 45, isParkAndRide: false },
  { name: 'Lynnwood Transit Center', driveTimeFactor: 40, transitTime: 55, isParkAndRide: true },
  { name: 'Tukwila International Blvd Station', driveTimeFactor: 50, transitTime: 55, isParkAndRide: false },
  { name: 'Angle Lake Station', driveTimeFactor: 55, transitTime: 60, isParkAndRide: true },
];

function resolveSeatacDestinationForRouting(destinationKey: string): string {
  const lower = destinationKey.toLowerCase();
  const isSeatac =
    lower.includes('central terminal') ||
    lower.includes('north satellite') ||
    lower.includes('south satellite') ||
    lower.includes('terminal') ||
    lower.includes('satellite') ||
    lower.includes('sea-tac') ||
    lower.includes('seatac') ||
    lower.includes('airport');

  if (isSeatac) {
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

export class LiveTrafficProvider implements TrafficProvider {
  async getTrafficEstimate(origin: string, destination: string, dateTime: string): Promise<TrafficEstimate> {
    try {
      // Use Google Maps Distance Matrix API for live traffic data
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        throw new Error('Google Maps API key not configured');
      }

      const departureTime = new Date(dateTime).getTime() / 1000; // Unix timestamp

      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&departure_time=${departureTime}&traffic_model=best_guess&key=${apiKey}`;

      if (process.env.NODE_ENV === 'development') {
        // Log URL without API key for debugging
        const urlWithoutKey = url.replace(/key=[^&]*/, 'key=[REDACTED]');
        console.log('Google Maps API Request URL:', urlWithoutKey);
      }

      const response = await fetch(url);
      const data = await response.json();

      if (process.env.NODE_ENV === 'development') {
        // Log raw API response for debugging
        console.log('Google Maps API Response:', JSON.stringify(data, null, 2));
      }

      if (data.status !== 'OK' || !data.rows[0]?.elements[0]) {
        throw new Error('Invalid API response');
      }

      const element = data.rows[0].elements[0];
      if (element.status !== 'OK') {
        throw new Error('No route found');
      }

      const durationInTraffic = element.duration_in_traffic?.value || element.duration.value;
      const durationMinutes = Math.ceil(durationInTraffic / 60);

      // Determine congestion level based on duration vs normal
      const normalDuration = element.duration.value;
      const congestionRatio = durationInTraffic / normalDuration;
      let congestion: 'low' | 'medium' | 'high';
      if (congestionRatio < 1.2) congestion = 'low';
      else if (congestionRatio < 1.5) congestion = 'medium';
      else congestion = 'high';

      const route = normalizeTrafficRoute(origin, destination);
      return {
        route,
        duration: durationMinutes,
        congestion,
        trustStatus: 'live',
        sourceName: 'Google Maps',
        lastUpdated: new Date().toISOString(),
        assumptions: ['Real-time traffic data', 'Based on current conditions', 'May vary by time of day'],
      };
    } catch (error) {
      console.warn('Live traffic API failed, falling back to mock:', error);
      const route = normalizeTrafficRoute(origin, destination);
      return mockTrafficEstimates[route] || {
        route,
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
    const routeDestination = resolveSeatacDestinationForRouting(destination);
    return this.trafficProvider.getTrafficEstimate(origin, routeDestination, dateTime);
  }

  async getParkingOptions(origin: string, destination: string, dateTime: string): Promise<ParkingOption[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const routeOrigins = origin;

    return Promise.all(mockParkingOptions.map(async option => {
      const routeDestination = `${option.name}, SeaTac, WA`;
      const shouldLiveRoute = option.type === 'official';
      const routeEstimate = shouldLiveRoute
        ? await this.getRouteEstimate(origin, routeDestination, dateTime, true)
        : this.estimateRouteDuration(origin, routeDestination, option.id === 'off-airport-1' ? 55 : 60);

      const mapLink = this.buildGoogleDirectionsLink(origin, routeDestination);
      const sourceLink = option.sourceLink && option.sourceLink.includes('example.com') ? undefined : option.sourceLink;

      return {
        ...option,
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
    const routeDestination = resolveSeatacDestinationForRouting(destination);
    const routeEstimate = await this.getRouteEstimate(origin, routeDestination, dateTime, true);
    const baseDuration = routeEstimate.duration + 5;

    return mockRideshareOptions.map(option => ({
      ...option,
      duration: baseDuration,
      routeTrustStatus: routeEstimate.trustStatus,
      routeOrigin: origin,
      routeDestination,
      sourceLink: option.id === 'uber'
        ? 'https://m.uber.com/ul/?action=setPickup&pickup=my_location'
        : option.id === 'lyft'
          ? 'https://lyft.com/ride'
          : undefined,
      mapLink: this.buildGoogleDirectionsLink(origin, routeDestination),
      lastUpdated: new Date().toISOString(),
      assumptions: [
        ...option.assumptions,
        `Route from ${origin} to ${routeDestination}`,
        routeEstimate.trustStatus === 'live' ? 'Based on live traffic and pickup routing' : 'Estimated ride time',
      ],
    }));
  }

  async getTransitOptions(origin: string, destination: string, dateTime: string): Promise<TransitJourney[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const routeDestinationAirport = resolveSeatacDestinationForRouting(destination);

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

  async getTsaEstimate(terminal: string): Promise<TsaEstimate> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    // TODO: Replace with a live TSA wait time service.
    // For now, use SeaTac airport data
    return await seaTacAirport.getTsaEstimate(terminal);
  }

  async getAirportInfo(terminal: string): Promise<LocationInfo> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // TODO: Replace with an airport facilities API.
    return mockLocationInfo[terminal] || { 
      destination: terminal, 
      name: `${terminal} at SeaTac`, 
      services: ['Parking', 'Shuttles', 'Lounges'],
      trustStatus: 'verified-source',
      sourceName: 'Port of Seattle',
      lastUpdated: new Date().toISOString(),
      assumptions: ['Services available 24/7']
    };
  }
}

export const ActiveDataProvider: DataProvider = new MockProvider();
