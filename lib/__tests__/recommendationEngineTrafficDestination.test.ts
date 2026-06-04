import { RecommendationEngine } from '../recommendationEngine';
import type { DataProvider } from '../providers';
import type {
  FlightInfo,
  LocationInfo,
  RideshareOption,
  TrafficEstimate,
  TransitJourney,
  TripData,
  TsaEstimate,
} from '../types';

jest.setTimeout(15000);

const emptyTsa: TsaEstimate = {
  destination: 'Destination',
  waitTime: 0,
  status: 'fallback',
  sourceName: 'Test',
  trustStatus: 'estimated',
  lastUpdated: new Date().toISOString(),
  assumptions: [],
};

const okTraffic: TrafficEstimate = {
  route: 'test',
  duration: 18,
  congestion: 'low',
  trustStatus: 'estimated',
  sourceName: 'Test',
  lastUpdated: new Date().toISOString(),
  assumptions: [],
};

describe('RecommendationEngine passes destination coordinates to getTrafficEstimate', () => {
  const originalProvider = RecommendationEngine.provider;

  afterEach(() => {
    RecommendationEngine.setDataProvider(originalProvider);
  });

  test('general Quick Go trip forwards destinationLat/destinationLng', async () => {
    const trafficSpy = jest.fn(async () => okTraffic);

    const mockProvider: DataProvider = {
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [] as RideshareOption[],
      getTransitOptions: async () => [] as TransitJourney[],
      getTsaEstimate: async () => emptyTsa,
      getTrafficEstimate: trafficSpy as unknown as DataProvider['getTrafficEstimate'],
      getFlightInfo: async () => null as unknown as FlightInfo,
      getAirportInfo: async () => ({}) as LocationInfo,
    };

    RecommendationEngine.setDataProvider(mockProvider);

    const tripData: TripData = {
      type: 'general-trip',
      origin: '123 Main Street, Example City, ST',
      destination: 'Costco, Everett, WA',
      destinationName: 'Costco, Everett, WA',
      destinationKind: 'general',
      destinationLat: 47.9,
      destinationLng: -122.2,
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    };

    await RecommendationEngine.generateRecommendations(tripData);

    expect(trafficSpy).toHaveBeenCalled();
    const mainCall = trafficSpy.mock.calls.find(
      (call) => (call[4] as { routePurpose?: string } | undefined)?.routePurpose === 'main_to_destination',
    );
    expect(mainCall).toBeDefined();
    expect(mainCall?.[3]).toEqual({ lat: 47.9, lng: -122.2 });
  });
});
