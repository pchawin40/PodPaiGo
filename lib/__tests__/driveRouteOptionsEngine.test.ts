import { RecommendationEngine } from '../recommendationEngine';
import { clearNwsWeatherCache } from '../weather/nws';
import type { DataProvider } from '../providers';
import type { DriveRouteRanking } from '../routes/driveRouteProfiles';
import type {
  DriveRoutePreferences,
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

const sampleRanking: DriveRouteRanking = {
  options: [
    {
      id: 'drive-toll_allowed',
      label: 'Fastest with tolls',
      profile: 'toll_allowed',
      durationMinutes: 18,
      tollEstimated: true,
      tollCostMin: 6,
      tollCostMax: 6,
      trustStatus: 'estimated',
      sourceName: 'Google Routes',
    },
    {
      id: 'drive-standard',
      label: 'Standard route',
      profile: 'standard',
      durationMinutes: 26,
      tollEstimated: false,
      trustStatus: 'estimated',
      sourceName: 'Google Routes',
    },
  ],
  bestOverallId: 'drive-toll_allowed',
  fastestWithTollsId: 'drive-toll_allowed',
};

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

function baseProvider(overrides: Partial<DataProvider> = {}): DataProvider {
  return {
    getParkingOptions: async () => [],
    getRideshareOptions: async () => [] as RideshareOption[],
    getTransitOptions: async () => [] as TransitJourney[],
    getTsaEstimate: async () => emptyTsa,
    getTrafficEstimate: async () => okTraffic,
    getFlightInfo: async () => null as unknown as FlightInfo,
    getAirportInfo: async () => ({}) as LocationInfo,
    ...overrides,
  };
}

const chosenPrefs: DriveRoutePreferences = {
  avoidTolls: false,
  hasTollPass: true,
  hovEligible: true,
  vehicleOccupancy: 2,
  showExpressLaneNotes: true,
};

describe('RecommendationEngine drive route options (Phase 1)', () => {
  const originalProvider = RecommendationEngine.provider;
  const originalFetch = global.fetch;

  beforeEach(() => {
    clearNwsWeatherCache();
    mockWeatherFetch();
  });

  afterEach(() => {
    RecommendationEngine.setDataProvider(originalProvider);
    global.fetch = originalFetch;
    clearNwsWeatherCache();
  });

  // Test 8: no extra toll route calls when route options are disabled.
  it('does not call getDriveRouteOptions when no toll/HOV preference is chosen', async () => {
    const driveSpy = jest.fn(async () => sampleRanking);
    RecommendationEngine.setDataProvider(
      baseProvider({ getDriveRouteOptions: driveSpy as never }),
    );

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: 'Monroe, WA',
      originLat: 47.855,
      originLng: -121.97,
      destination: 'Bellevue Square',
      destinationKind: 'general',
      destinationLat: 47.6,
      destinationLng: -122.2,
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    expect(driveSpy).not.toHaveBeenCalled();
    expect(recommendation.driveRouteOptions).toBeUndefined();
  });

  it('attaches ranked drive route options when the user chose a toll/HOV option', async () => {
    const driveSpy = jest.fn(async () => sampleRanking);
    RecommendationEngine.setDataProvider(
      baseProvider({ getDriveRouteOptions: driveSpy as never }),
    );

    const recommendation = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: 'Monroe, WA',
      originLat: 47.855,
      originLng: -121.97,
      destination: 'Bellevue Square',
      destinationKind: 'general',
      destinationLat: 47.6,
      destinationLng: -122.2,
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
      driveRoutePreferences: chosenPrefs,
    });

    expect(driveSpy).toHaveBeenCalled();
    expect(recommendation.driveRouteOptions?.[0]?.id).toBe('drive-toll_allowed');
    expect(recommendation.driveRoutePreferences).toEqual(chosenPrefs);
  });

  // Test 7: airport, city, and stadium/event trips still build recommendations.
  it('still builds recommendations for airport, city, and stadium trips', async () => {
    RecommendationEngine.setDataProvider(
      baseProvider({
        geocodeAddress: async () => ({ lat: 47.6, lng: -122.3 }),
      }),
    );

    const airport = await RecommendationEngine.generateRecommendations({
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      departureDate: '2026-06-01',
      departureTime: '12:00',
      timeAnchor: 'flight-departure',
      transportAvailability: 'all',
    });

    const city = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Pike Place Market, Seattle, WA',
      destinationName: 'Pike Place Market',
      destinationKind: 'downtown',
      destinationLat: 47.6097,
      destinationLng: -122.3425,
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      transportAvailability: 'all',
    });

    const stadium = await RecommendationEngine.generateRecommendations({
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Lumen Field, Seattle, WA',
      destinationName: 'Lumen Field',
      destinationKind: 'stadium',
      destinationLat: 47.5952,
      destinationLng: -122.3316,
      arrivalDate: '2026-06-01',
      arrivalTime: '18:00',
      transportAvailability: 'all',
    });

    for (const recommendation of [airport, city, stadium]) {
      expect(recommendation).toBeDefined();
      expect(Array.isArray(recommendation.parking)).toBe(true);
      expect(Array.isArray(recommendation.rideshare)).toBe(true);
      expect(Array.isArray(recommendation.transit)).toBe(true);
      expect(recommendation.tsaEstimate).toBeDefined();
    }
  });
});
