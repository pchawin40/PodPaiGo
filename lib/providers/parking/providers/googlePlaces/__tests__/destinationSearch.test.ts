import {
  getDestinationParkingOptions,
  getDestinationParkingOptionsWithMetadata,
  resetDestinationParkingSearchCacheForTests,
} from '../destinationSearch';
import { resetPlacesRequestBudgetForTests } from '../../../../../apiUsage/placesRequestBudget';
import { getGoogleMapsServerApiKey } from '../../../../../env/googleMapsServerKey';
import { getParkWhizDestinationParkingOptions } from '../../../../parkWhiz';
import { getParkingLotsNearPoint } from '../../../../../parking/inventory';

jest.mock('../../../../../env/googleMapsServerKey', () => ({
  getGoogleMapsServerApiKey: jest.fn(() => 'test-key'),
}));

jest.mock('../../../../parkWhiz', () => ({
  getParkWhizDestinationParkingOptions: jest.fn(async () => []),
}));

jest.mock('../../../../../parking/inventory', () => ({
  getParkingLotsNearPoint: jest.fn(async () => []),
}));

function mockDestinationPlace(id: string, name: string) {
  return {
    id,
    displayName: { text: name },
    formattedAddress: '85 Pike St, Seattle, WA',
    location: { latitude: 47.6089, longitude: -122.3401 },
    rating: 4.4,
    userRatingCount: 80,
  };
}

function applyLiveGoogleParkingEnv(): void {
  delete process.env.DISABLE_GOOGLE_PLACES;
  delete process.env.DISABLE_GOOGLE_PARKING_DISCOVERY;
  process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
  process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '5';
  process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '5';
  process.env.DESTINATION_PARKING_MIN_RESULTS_BEFORE_STOP = '5';
}

describe('Google destination parking discovery', () => {
  beforeEach(() => {
    resetDestinationParkingSearchCacheForTests();
    resetPlacesRequestBudgetForTests();
    jest.restoreAllMocks();
    (getParkingLotsNearPoint as jest.Mock).mockResolvedValue([]);
  });

  test('uses destination coordinates for bias and caches/dedupes identical searches', async () => {
    applyLiveGoogleParkingEnv();

    const requestBodies: Array<Record<string, unknown>> = [];
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.includes('places:searchText')) {
        return { ok: false, json: async () => ({}) } as Response;
      }

      requestBodies.push(JSON.parse(String(init?.body)));
      return {
        ok: true,
        json: async () => ({
          places: Array.from({ length: 5 }, (_, index) =>
            mockDestinationPlace(`dest-${index}`, `Pike Place Parking Garage ${index + 1}`),
          ),
        }),
      } as Response;
    });

    const args = {
      origin: 'Monroe, WA',
      destination: 'Pike Place Market',
      dateTime: '2026-06-01T10:00:00.000Z',
      parkingDurationMinutes: 180,
      destinationLat: 47.6097,
      destinationLng: -122.3425,
    };

    const [first, second] = await Promise.all([
      getDestinationParkingOptions(args),
      getDestinationParkingOptions({ ...args, destination: '  Pike Place Market  ' }),
    ]);
    const third = await getDestinationParkingOptions(args);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(6);
    expect(second).toHaveLength(6);
    expect(third).toHaveLength(6);
    expect(first.map((option) => option.id)).toContain('official-pike-place-market-parking');
    expect(requestBodies[0]?.textQuery).toBe('parking near Pike Place Market');
    expect(requestBodies[0]?.locationBias).toEqual({
      circle: {
        center: {
          latitude: 47.6097,
          longitude: -122.3425,
        },
        radius: 2500,
      },
    });

    fetchMock.mockRestore();
  });

  test('runs fallback destination parking queries only while results are weak', async () => {
    applyLiveGoogleParkingEnv();

    const attemptedQueries: string[] = [];
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.includes('places:searchText')) {
        return { ok: false, json: async () => ({}) } as Response;
      }

      const body = JSON.parse(String(init?.body));
      attemptedQueries.push(body.textQuery);

      if (body.textQuery.startsWith('parking garage near')) {
        return {
          ok: true,
          json: async () => ({
            places: Array.from({ length: 4 }, (_, index) =>
              mockDestinationPlace(`garage-${index}`, `Downtown Parking Garage ${index + 1}`),
            ),
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          places: [mockDestinationPlace('primary-1', 'Small Parking Lot')],
        }),
      } as Response;
    });

    const options = await getDestinationParkingOptions({
      origin: 'Monroe, WA',
      destination: 'Pike Place Market',
      dateTime: '2026-06-01T10:00:00.000Z',
      parkingDurationMinutes: 180,
      destinationLat: 47.6097,
      destinationLng: -122.3425,
    });

    expect(options.length).toBeGreaterThanOrEqual(5);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(attemptedQueries).toEqual([
      'parking near Pike Place Market',
      'parking garage near Pike Place Market',
    ]);

    fetchMock.mockRestore();
  });

  test('still returns ParkWhiz destination parking when Google key is unavailable', async () => {
    applyLiveGoogleParkingEnv();
    (getGoogleMapsServerApiKey as jest.Mock).mockReturnValueOnce(null);
    (getParkWhizDestinationParkingOptions as jest.Mock).mockResolvedValueOnce([
      {
        id: 'parkwhiz-city-1',
        name: 'ParkWhiz City Garage',
        type: 'official',
        price: 18,
        distance: 10,
        availability: 80,
        trustStatus: 'live',
        sourceName: 'ParkWhiz',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    ]);
    const fetchMock = jest.spyOn(global, 'fetch');

    const options = await getDestinationParkingOptions({
      origin: 'Monroe, WA',
      destination: 'Bellevue Square',
      dateTime: '2026-06-01T10:00:00.000Z',
      parkingDurationMinutes: 180,
      destinationLat: 47.615,
      destinationLng: -122.203,
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-01',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(getParkWhizDestinationParkingOptions).toHaveBeenCalledTimes(1);
    expect(options.map((option) => option.name)).toContain('ParkWhiz City Garage');

    fetchMock.mockRestore();
  });

  test('returns cached destination lots when Google live discovery is budget limited', async () => {
    applyLiveGoogleParkingEnv();
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';
    (getParkingLotsNearPoint as jest.Mock).mockResolvedValueOnce([
      {
        id: 101,
        airportCode: 'GENERAL',
        name: 'Cached Pike Garage',
        normalizedName: 'cached pike garage',
        address: '100 Pike St, Seattle, WA',
        latitude: 47.609,
        longitude: -122.34,
        source: 'Supabase cache',
        sourceId: 'cached-pike-garage',
        sourceUrl: 'https://example.com/parking',
        isOfficial: false,
        confidence: 0.8,
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
        distanceMiles: 0.2,
      },
    ]);
    const fetchMock = jest.spyOn(global, 'fetch');

    const result = await getDestinationParkingOptionsWithMetadata({
      origin: 'Monroe, WA',
      destination: 'Bellevue Square',
      dateTime: '2026-06-07T10:00:00.000Z',
      parkingDurationMinutes: 180,
      destinationLat: 47.615,
      destinationLng: -122.203,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.metadata.status).toBe('cache_only_budget_limited');
    expect(result.metadata.cachedCount).toBe(1);
    expect(result.metadata.liveRefreshPaused).toBe(true);
    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({
      name: 'Cached Pike Garage',
      providerSource: 'destination-cache',
      parkingDiscoveryStatus: 'cache_only_budget_limited',
      priceDisplay: 'check-live',
    });
    expect(result.options[0]?.assumptions).toEqual(
      expect.arrayContaining([
        'Cached parking option.',
        'Live availability not confirmed.',
        'Open directions/provider site to verify price and availability.',
      ]),
    );

    fetchMock.mockRestore();
  });

  test('reports cache empty when Google live discovery is paused and Supabase has no lots', async () => {
    applyLiveGoogleParkingEnv();
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';
    (getParkingLotsNearPoint as jest.Mock).mockResolvedValueOnce([]);
    const fetchMock = jest.spyOn(global, 'fetch');

    const result = await getDestinationParkingOptionsWithMetadata({
      origin: 'Monroe, WA',
      destination: 'Bellevue Square',
      dateTime: '2026-06-07T10:00:00.000Z',
      parkingDurationMinutes: 180,
      destinationLat: 47.615,
      destinationLng: -122.203,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.options).toEqual([]);
    expect(result.metadata.status).toBe('cache_empty');
    expect(result.metadata.message).toMatch(/No saved parking options/);

    fetchMock.mockRestore();
  });
});
