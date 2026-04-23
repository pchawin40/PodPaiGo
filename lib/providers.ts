import { ParkingOption, RideshareOption, TransitOption, TrafficEstimate, FlightInfo, LocationInfo, TsaEstimate } from './types';
import { mockParkingOptions, mockRideshareOptions, mockTransitOptions, tsaEstimates, mockTrafficEstimates, mockFlightInfo, mockLocationInfo } from '../data/mockData';
import { seaTacAirport } from './airports';

export interface TrafficProvider {
  getTrafficEstimate(route: string, dateTime: string): Promise<TrafficEstimate>;
}

export interface ParkingProvider {
  getParkingOptions(): Promise<ParkingOption[]>;
}

export interface FlightProvider {
  getFlightInfo(terminal: string, dateTime: string): Promise<FlightInfo>;
}

export interface TsaProvider {
  getTsaEstimate(terminal: string): Promise<TsaEstimate>;
}

export interface AirportInfoProvider {
  getAirportInfo(terminal: string): Promise<LocationInfo>;
}

export interface DataProvider extends TrafficProvider, ParkingProvider, FlightProvider, TsaProvider, AirportInfoProvider {
  getRideshareOptions(): Promise<RideshareOption[]>;
  getTransitOptions(): Promise<TransitOption[]>;
}

export class MockTrafficProvider implements TrafficProvider {
  async getTrafficEstimate(route: string, dateTime: string): Promise<TrafficEstimate> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Mock traffic data
    return mockTrafficEstimates[route] || { route, duration: 25, congestion: 'medium' };
  }
}

export class LiveTrafficProvider implements TrafficProvider {
  async getTrafficEstimate(route: string, dateTime: string): Promise<TrafficEstimate> {
    try {
      // Use Google Maps Distance Matrix API for live traffic data
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        throw new Error('Google Maps API key not configured');
      }

      // Parse route - assume format like "home-airport" or "airport-home"
      const [origin, destination] = route === 'home-airport'
        ? ['Seattle, WA', 'Sea-Tac Airport, WA'] // Example locations
        : ['Sea-Tac Airport, WA', 'Seattle, WA'];

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

      return {
        route,
        duration: durationMinutes,
        congestion,
        trustStatus: 'live',
        sourceName: 'Google Maps',
        lastUpdated: new Date().toISOString(),
        assumptions: ['Real-time traffic data', 'Based on current conditions', 'May vary by time of day']
      };
    } catch (error) {
      console.warn('Live traffic API failed, falling back to mock:', error);
      // Fallback to mock data
      return mockTrafficEstimates[route] || { 
        route, 
        duration: 25, 
        congestion: 'medium',
        trustStatus: 'estimated',
        sourceName: 'Historical averages',
        lastUpdated: new Date().toISOString(),
        assumptions: ['Fallback data', 'Based on typical conditions']
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

  async getTrafficEstimate(route: string, dateTime: string): Promise<TrafficEstimate> {
    return this.trafficProvider.getTrafficEstimate(route, dateTime);
  }

  async getParkingOptions(): Promise<ParkingOption[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // TODO: Replace with a live parking inventory API.
    return mockParkingOptions;
  }

  async getRideshareOptions(): Promise<RideshareOption[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // TODO: Replace with a live rideshare provider integration.
    return mockRideshareOptions;
  }

  async getTransitOptions(): Promise<TransitOption[]> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    // TODO: Replace with a live transit schedule provider.
    return mockTransitOptions;
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
