import { resetGooglePlacesCacheForTests } from '../lib/parking/googlePlacesCache';
import { resetPlacesRequestBudgetForTests } from '../lib/apiUsage/placesRequestBudget';

jest.mock('../lib/db/client', () => ({
  db: {
    connect: jest.fn(),
    query: jest.fn(),
  },
  parkingDbCacheDisabledByConfig: jest.fn(() => false),
}));

jest.mock('../lib/env/googleMapsServerKey', () => ({
  getGoogleMapsServerApiKey: jest.fn(() => 'test-key'),
}));

describe('resolveParkingGooglePlace cache write failures', () => {
  beforeEach(() => {
    resetGooglePlacesCacheForTests();
    resetPlacesRequestBudgetForTests();
    jest.restoreAllMocks();
    delete process.env.DISABLE_PARKING_DB_CACHE;
    delete process.env.DISABLE_GOOGLE_PLACES;
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '2';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '2';
  });

  test('write failure does not trigger another live GetPlace call', async () => {
    const { db } = jest.requireMock('../lib/db/client') as {
      db: {
        connect: jest.Mock;
        query: jest.Mock;
      };
    };

    const freshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('expires_at > now()')) {
        return { rows: [] };
      }

      if (sql.includes('where cache_key = $1')) {
        return { rows: [] };
      }

      if (sql.includes('where google_place_id = $1')) {
        return { rows: [] };
      }

      throw new Error('Unexpected query');
    });

    db.connect.mockImplementation(async () => ({
      query: jest.fn(async (sql: string) => {
        if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
          return { rows: [] };
        }

        if (sql.includes('insert into parking_lot_google_place_snapshots')) {
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error('write failed');
        }

        return { rows: [] };
      }),
      release: jest.fn(),
    }));

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('places.googleapis.com/v1/places/place-live')) {
        return {
          ok: true,
          json: async () => ({
            id: 'place-live',
            displayName: { text: 'Jiffy Airport Parking' },
            formattedAddress: '18836 International Blvd',
            location: { latitude: 47.439, longitude: -122.294 },
            photos: [{ name: 'photos/live/1' }],
          }),
        } as Response;
      }

      if (url.includes('places.googleapis.com/v1/places:searchText')) {
        return {
          ok: true,
          json: async () => ({
            places: [
              {
                id: 'place-live',
                displayName: { text: 'Jiffy Airport Parking' },
                formattedAddress: '18836 International Blvd',
                location: { latitude: 47.439, longitude: -122.294 },
                photos: [{ name: 'photos/live/1' }],
              },
            ],
          }),
        } as Response;
      }

      return { ok: false, status: 404, clone: async () => ({ text: async () => '' }) } as Response;
    });

    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');
    const { flushGooglePlacesCacheWriteQueueForTests } = await import(
      '../lib/parking/googlePlacesCacheWrite'
    );

    const place = await resolveParkingGooglePlace({
      airportCode: 'SEA',
      lotName: 'Jiffy Airport Parking',
      lotAddress: '18836 International Blvd',
      googlePlaceId: 'place-live',
      provider: 'ParkWhiz',
      source: 'ParkWhiz',
    });

    await flushGooglePlacesCacheWriteQueueForTests();

    expect(place?.googlePlaceId).toBe('place-live');
    expect(place?.lat).toBe(47.439);

    const detailsCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('places.googleapis.com/v1/places/place-live'),
    );
    const searchCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('places.googleapis.com/v1/places:searchText'),
    );

    expect(detailsCalls.length).toBeLessThanOrEqual(2);
    expect(searchCalls).toHaveLength(0);
  });
});
