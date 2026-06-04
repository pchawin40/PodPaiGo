import {
  getDestinationParkingOptions,
  resetDestinationParkingSearchCacheForTests,
} from '../destinationSearch';
import { resetPlacesRequestBudgetForTests } from '../../../../../apiUsage/placesRequestBudget';
import { getGoogleMapsServerApiKey } from '../../../../../env/googleMapsServerKey';
import { getParkWhizDestinationParkingOptions } from '../../../../parkWhiz';

jest.mock('../../../../../env/googleMapsServerKey', () => ({
  getGoogleMapsServerApiKey: jest.fn(() => 'test-key'),
}));

jest.mock('../../../../parkWhiz', () => ({
  getParkWhizDestinationParkingOptions: jest.fn(async () => []),
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
    expect(first).toHaveLength(5);
    expect(second).toHaveLength(5);
    expect(third).toHaveLength(5);
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
});
