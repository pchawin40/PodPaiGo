import { ParkingOption, RideshareOption, TransitOption, TransitJourney, TransitSegment, TrafficEstimate, FlightInfo, LocationInfo, TsaEstimate } from './types';
import { mockParkingOptions, mockRideshareOptions, mockTransitOptions, tsaEstimates, mockTrafficEstimates, mockFlightInfo, mockLocationInfo } from '../data/mockData';
import { seaTacAirport } from './airports';

// Data-driven approach to determine transit hubs for non-direct rail origins

// Small dataset for WA-focused transit hubs (MVP)
const transitHubs = [
  { name: 'Northgate Transit Center', lat: 47.7081, lng: -122.3273, driveTimeFactor: 30, transitTime: 45, isParkAndRide: false },
  { name: 'Lynnwood Transit Center', lat: 47.8256, lng: -122.3166, driveTimeFactor: 40, transitTime: 55, isParkAndRide: true },
  { name: 'Tukwila International Blvd Station', lat: 47.4736, lng: -122.2600, driveTimeFactor: 50, transitTime: 55, isParkAndRide: false },
  { name: 'Angle Lake Station', lat: 47.4226, lng: -122.2979, driveTimeFactor: 55, transitTime: 60, isParkAndRide: true },
];

// Updated journey calculation function
function calculateTransitJourneys(origin: string, destination: string): TransitJourney[] {
  const originLower = origin.toLowerCase();

  function estimateDriveTimeToHub(hub: { driveTimeFactor: number }): number {
    if (originLower.includes('monroe') || originLower.includes('98272')) {
      return hub.driveTimeFactor;
    }
    return hub.driveTimeFactor + 10;
  }

  function estimateWaitMinutes(): number {
    return 5;
  }

  function estimateTransferPenalty(): number {
    return 10;
  }

  return transitHubs.map((hub) => {
    const driveTime = Math.ceil(estimateDriveTimeToHub(hub));
    const waitTime = estimateWaitMinutes();
    const transferPenalty = estimateTransferPenalty();
    const transitTime = hub.transitTime;
    const totalDuration = driveTime + waitTime + transferPenalty + transitTime;
    const isViable = totalDuration <= 120 && driveTime <= 60;

    return {
      id: `drive-transit-${hub.name.toLowerCase().replace(/ /g, '-')}`,
      name: `Drive to ${hub.name} + Light Rail to SeaTac`,
      price: 3.25,
      duration: totalDuration,
      frequency: 10,
      totalDuration,
      totalCost: 3.25,
      segments: [
        { mode: 'drive', name: `Drive to ${hub.name}`, duration: driveTime, distance: driveTime, cost: 0 },
        { mode: 'walk', name: 'Walk to platform', duration: 5, cost: 0 },
        { mode: 'light-rail', name: 'Light Rail to SeaTac', duration: transitTime, cost: 3.25, frequency: 10 }
      ],
      transfers: 1,
      availability: isViable ? 85 : 30,
      trustStatus: isViable ? 'verified-source' : 'fallback',
      assumptions: [
        'Based on nearest viable transit hub in Washington state',
        `Drive to ${hub.name} and take light rail to SeaTac`,
        isViable ? 'Viable door-to-door transit option' : 'Longer door-to-door transit, may be less realistic'
      ],
      sourceName: 'Mock transit planner',
      sourceLink: 'https://www.mocktransit.com',
      mapLink: `https://maps.google.com/?q=${encodeURIComponent(hub.name + ' Seattle')}`,
      lastUpdated: new Date().toISOString(),
    };
  });
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
  getParkingOptions(destination: string): Promise<ParkingOption[]>;
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
  getRideshareOptions(origin: string, destination: string): Promise<RideshareOption[]>;
  getTransitOptions(origin: string, destination: string): Promise<TransitJourney[]>;
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

  constructor() {
    const trafficProviderType = process.env.TRAFFIC_PROVIDER || 'live';
    this.trafficProvider = trafficProviderType === 'live' ? new LiveTrafficProvider() : new MockTrafficProvider();
  }

  async getTrafficEstimate(origin: string, destination: string, dateTime: string): Promise<TrafficEstimate> {
    return this.trafficProvider.getTrafficEstimate(origin, destination, dateTime);
  }

  async getParkingOptions(destination: string): Promise<ParkingOption[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // TODO: Replace with a live parking inventory API.
    return mockParkingOptions.map(option => ({
      ...option,
      sourceName: 'Seattle-Tacoma International Airport',
      sourceLink: 'https://www.portseattle.org/sea-tac',
      lastUpdated: new Date().toISOString(),
      assumptions: [...option.assumptions, `Pricing based on destination: ${destination}`],
    }));
  }

  async getRideshareOptions(origin: string, destination: string): Promise<RideshareOption[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // TODO: Replace with a live rideshare provider integration.
    return mockRideshareOptions.map(option => ({
      ...option,
      sourceName: 'Mock rideshare aggregator',
      sourceLink: 'https://www.mockrideshare.com',
      lastUpdated: new Date().toISOString(),
      assumptions: [...option.assumptions, `Route from ${origin} to ${destination}`],
    }));
  }

  async getTransitOptions(origin: string, destination: string): Promise<TransitJourney[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    // Calculate realistic transit journeys based on origin
    const journeys = calculateTransitJourneys(origin, destination);
    
    return journeys.map(journey => ({
      ...journey,
      sourceName: 'Mock transit planner',
      sourceLink: 'https://www.mocktransit.com',
      lastUpdated: new Date().toISOString(),
      assumptions: [...journey.assumptions, `Route from ${origin} to ${destination}`],
    }));
  }

  async getFlightInfo(terminal: string, dateTime: string): Promise<FlightInfo> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // TODO: Replace with a live flight data integration.
    return mockFlightInfo[terminal] || { terminal, status: 'On time', gate: 'A1', scheduledTime: dateTime };
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
