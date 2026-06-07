import { MockProvider, type TrafficProvider } from '../providers';
import type { ParkingOption, TrafficEstimate } from '../types';
import { getLiveParkingOptions } from '../providers/parkingAggregator';

jest.mock('../providers/parkingAggregator', () => ({
  getLiveParkingOptions: jest.fn(async () => []),
  getDestinationParkingOptions: jest.fn(async () => []),
}));

function parkingOption(index: number): ParkingOption {
  return {
    id: `route-option-${index}`,
    name: `Route Option ${index}`,
    serviceAirportCode: 'SEA',
    type: 'off-airport',
    price: 20,
    distance: 10,
    availability: 50,
    trustStatus: 'estimated',
    sourceName: 'Fixture',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    assumptions: [],
    parkingBufferMinutes: 10,
    transferToTerminalMinutes: 12,
    transferType: 'shuttle',
    routeDestination: `${index} Test Ave, SeaTac, WA`,
    address: `${index} Test Ave, SeaTac, WA`,
    lat: 47.44 + index * 0.001,
    lng: -122.3 - index * 0.001,
  };
}

describe('parking route live limit', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT = '2';
    (getLiveParkingOptions as jest.Mock).mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => parkingOption(index + 1)),
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('limits live Google Routes calls to the initially selected parking route keys', async () => {
    const routeCalls: Array<{
      destination: string;
      routePurpose?: 'main_to_destination' | 'parking_origin_to_lot';
    }> = [];
    const fakeTrafficProvider: TrafficProvider = {
      async getTrafficEstimate(
        origin,
        destination,
        _dateTime,
        _destinationLatLng,
        routeContext,
      ): Promise<TrafficEstimate> {
        routeCalls.push({
          destination,
          routePurpose: routeContext?.routePurpose,
        });

        return {
          route: `${origin}->${destination}`,
          duration: routeContext?.routePurpose === 'parking_origin_to_lot' ? 12 : 30,
          congestion: 'low',
          trustStatus: 'live',
          sourceName: 'Google Routes API',
          lastUpdated: '2026-06-01T00:00:00.000Z',
          assumptions: ['Fake live route'],
        };
      },
    };

    const provider = new MockProvider();
    (provider as unknown as { trafficProvider: TrafficProvider }).trafficProvider = fakeTrafficProvider;

    const parking = await provider.getParkingOptions(
      'Monroe, WA',
      'Seattle-Tacoma International Airport',
      '2026-06-01T10:00:00.000Z',
      24 * 60,
      {
        destinationKind: 'airport',
        airportCode: 'SEA',
      },
    );

    const liveParkingRouteCalls = routeCalls.filter((call) => call.routePurpose === 'parking_origin_to_lot');

    expect(parking).toHaveLength(5);
    expect(liveParkingRouteCalls).toHaveLength(2);
    expect(parking.slice(0, 2).every((option) => option.originDriveSource === 'google-routes')).toBe(true);
    expect(parking.slice(2).every((option) => option.originDriveSource === 'haversine-estimated')).toBe(true);
  });
});
