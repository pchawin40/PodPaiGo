import { RecommendationEngine } from '../recommendationEngine';
import { clearNwsWeatherCache } from '../weather/nws';
import { resolveGooglePlaceCoordinates } from '../parking/googlePlacesCache';
import type { DataProvider } from '../providers';
import type {
  FlightInfo,
  LocationInfo,
  RideshareOption,
  TrafficEstimate,
  TransitJourney,
  TsaEstimate,
} from '../types';

jest.mock('../parking/googlePlacesCache', () => ({
  __esModule: true,
  ...jest.requireActual('../parking/googlePlacesCache'),
  resolveGooglePlaceCoordinates: jest.fn(),
}));

const resolveGooglePlaceCoordinatesMock =
  resolveGooglePlaceCoordinates as jest.MockedFunction<typeof resolveGooglePlaceCoordinates>;

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

// Brighton-Jones-style downtown Seattle coordinates resolved from a place_id.
const RESOLVED = { lat: 47.6101, lng: -122.3421 };

function mockWeatherFetch() {
  const fetchMock = jest.fn(async (url: string | URL | Request) => {
    const textUrl = String(url);
    return {
      ok: true,
      json: async () =>
        textUrl.includes('/points/')
          ? {
              properties: {
                forecastHourly:
                  'https://api.weather.gov/gridpoints/SEW/124,67/forecast/hourly',
                timeZone: 'America/Los_Angeles',
              },
            }
          : {
              properties: {
                periods: [
                  {
                    startTime: '2026-06-01T10:00:00-07:00',
                    shortForecast: 'Sunny',
                    temperature: 62,
                    windSpeed: '5 mph',
                    probabilityOfPrecipitation: { value: 10 },
                  },
                ],
              },
            },
    } as Response;
  });

  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('RecommendationEngine resolves destination coordinates from place_id', () => {
  const originalProvider = RecommendationEngine.provider;
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearNwsWeatherCache();
    resolveGooglePlaceCoordinatesMock.mockReset();
    mockWeatherFetch();
  });

  afterEach(() => {
    RecommendationEngine.setDataProvider(originalProvider);
    global.fetch = originalFetch;
    clearNwsWeatherCache();
    jest.restoreAllMocks();
  });

  test('destination with place_id but no lat/lng resolves coords and forwards them to route + weather', async () => {
    resolveGooglePlaceCoordinatesMock.mockResolvedValue(RESOLVED);
    const trafficSpy = jest.fn(async () => okTraffic);

    // No geocodeAddress on the provider: the ONLY way to get destination coords
    // is the place_id resolver. This reproduces the Monroe -> Brighton Jones case.
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

    const fetchMock = global.fetch as unknown as jest.Mock;

    await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: 'Monroe, WA',
      originLat: 47.8554,
      originLng: -121.9709,
      destination: 'Brighton Jones, 2030 1st Ave, Seattle, WA 98121',
      destinationName: 'Brighton Jones',
      destinationKind: 'office',
      destinationPlaceId: 'ChIJBrightonJones',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(resolveGooglePlaceCoordinatesMock).toHaveBeenCalledWith(
      'ChIJBrightonJones',
      expect.objectContaining({ reason: 'trip_coordinate' }),
    );

    const trafficCalls = trafficSpy.mock.calls as Array<
      Parameters<DataProvider['getTrafficEstimate']>
    >;
    const mainCall = trafficCalls.find(
      (call) =>
        (call[4] as { routePurpose?: string } | undefined)?.routePurpose ===
        'main_to_destination',
    );
    expect(mainCall).toBeDefined();
    expect(mainCall?.[3]).toEqual(RESOLVED);

    // Weather got the resolved coordinates instead of failing missing-coordinates.
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.weather.gov/points/${RESOLVED.lat},${RESOLVED.lng}`,
      expect.any(Object),
    );
  });

  test('existing destination coordinates win and the place_id resolver is not called', async () => {
    resolveGooglePlaceCoordinatesMock.mockResolvedValue(RESOLVED);
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

    await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: 'Monroe, WA',
      originLat: 47.8554,
      originLng: -121.9709,
      destination: 'Brighton Jones, 2030 1st Ave, Seattle, WA 98121',
      destinationName: 'Brighton Jones',
      destinationKind: 'office',
      destinationPlaceId: 'ChIJBrightonJones',
      destinationLat: 47.6,
      destinationLng: -122.34,
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(resolveGooglePlaceCoordinatesMock).not.toHaveBeenCalled();

    const trafficCalls = trafficSpy.mock.calls as Array<
      Parameters<DataProvider['getTrafficEstimate']>
    >;
    const mainCall = trafficCalls.find(
      (call) =>
        (call[4] as { routePurpose?: string } | undefined)?.routePurpose ===
        'main_to_destination',
    );
    expect(mainCall?.[3]).toEqual({ lat: 47.6, lng: -122.34 });
  });
});
