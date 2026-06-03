import { RecommendationEngine } from '../recommendationEngine';
import type {
  FlightInfo,
  LocationInfo,
  ParkingOption,
  RideshareOption,
  TrafficEstimate,
  TransitJourney,
  TripData,
  TsaEstimate,
} from '../types';

describe('RecommendationEngine route timing integration', () => {
  test('route request receives trip-based departure time for future airport trips', async () => {
    const captured: string[] = [];
    const emptyTraffic: TrafficEstimate = {
      route: 'home-airport',
      duration: 42,
      congestion: 'normal',
      trustStatus: 'estimated',
      sourceName: 'Test',
      lastUpdated: new Date().toISOString(),
    };

    RecommendationEngine.setDataProvider({
      getParkingOptions: async () => [],
      getRideshareOptions: async () => [],
      getTransitOptions: async () => [],
      getTsaEstimate: async () => ({
        destination: 'SEA',
        waitTime: 20,
        status: 'fallback',
        sourceName: 'Test',
        trustStatus: 'estimated',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      }),
      getTrafficEstimate: async (_origin, _destination, dateTime) => {
        captured.push(dateTime);
        return emptyTraffic;
      },
      getFlightInfo: async (): Promise<FlightInfo | null> => null,
      getAirportInfo: async (): Promise<LocationInfo> => ({
        name: 'SEA',
        address: 'SEA',
        coordinates: { lat: 0, lng: 0 },
      }),
    });

    const trip: TripData = {
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      departureDate: '2026-12-01',
      departureTime: '18:00',
      bagPlan: 'none',
      checkingBags: false,
      securityOption: 'standard',
      flightType: 'domestic',
      cabin: 'economy',
    };

    await RecommendationEngine.generateRecommendations(trip);

    expect(captured.length).toBeGreaterThan(0);
    const routeTime = captured[0]!;
    expect(routeTime).not.toMatch(/^2026-06-/);
    expect(routeTime).toContain('2026-12-01');
    expect(new Date(routeTime).getTime()).toBeLessThan(new Date('2026-12-01T18:00:00').getTime());
  });
});
