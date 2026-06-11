import {
  resetPlacesRequestBudgetForTests,
  runWithPlacesRequestBudget,
} from '../lib/apiUsage/placesRequestBudget';
import { resetGooglePlacesDailyBudgetForTests } from '../lib/apiUsage/googlePlacesDailyBudget';
import {
  getGooglePlacesSearchDedupeStatsForTests,
  resetGooglePlacesCacheForTests,
} from '../lib/parking/googlePlacesCache';

jest.mock('../lib/db/client', () => ({
  db: {
    query: jest.fn(async () => ({ rows: [] })),
    connect: jest.fn(),
  },
  parkingDbCacheDisabledByConfig: () => false,
}));

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SEARCH_TEXT_NEW = 'places.googleapis.com/v1/places:searchText';
const SEARCH_TEXT_LEGACY = '/maps/api/place/textsearch/json';

function isSearchTextUrl(url: string): boolean {
  return url.includes(SEARCH_TEXT_NEW) || url.includes(SEARCH_TEXT_LEGACY);
}

function mockNoMatchFetch() {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes(SEARCH_TEXT_NEW)) {
      return { ok: true, json: async () => ({ places: [] }) } as Response;
    }
    if (url.includes(SEARCH_TEXT_LEGACY)) {
      return { ok: true, json: async () => ({ results: [] }) } as Response;
    }
    return { ok: false, status: 404, clone: async () => ({ text: async () => '' }) } as Response;
  });
}

function mockMatchFetch(placeId: string) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes(SEARCH_TEXT_NEW)) {
      return {
        ok: true,
        json: async () => ({
          places: [
            {
              id: placeId,
              displayName: { text: 'Jiffy Airport Parking' },
              formattedAddress: '18836 International Blvd',
              location: { latitude: 47.439, longitude: -122.294 },
              rating: 4.4,
              userRatingCount: 1200,
              photos: [{ name: `${placeId}/photos/1` }],
            },
          ],
        }),
      } as Response;
    }
    return { ok: false, status: 404, clone: async () => ({ text: async () => '' }) } as Response;
  });
}

describe('Google Places repeated live SearchText dedupe', () => {
  beforeEach(() => {
    resetPlacesRequestBudgetForTests();
    resetGooglePlacesDailyBudgetForTests();
    resetGooglePlacesCacheForTests();
    jest.restoreAllMocks();
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.GOOGLE_PLACES_NEGATIVE_MATCH_TTL_MS;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
    process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '50';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '50';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '200';
  });

  const noMatchLot = {
    lotName: '[A653] 1727 Harvard Ave. Lot',
    lotAddress: '1727 Harvard Ave, Seattle, WA',
    airportCode: null,
    provider: 'ParkWhiz',
    source: 'ParkWhiz',
  };

  test('same no-match lot searched twice only hits Google once', async () => {
    const fetchMock = mockNoMatchFetch();
    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');

    const searchTextCalls = () =>
      fetchMock.mock.calls.filter(([url]) => isSearchTextUrl(String(url))).length;

    const first = await runWithPlacesRequestBudget('negcache:first', () =>
      resolveParkingGooglePlace(noMatchLot),
    );
    const afterFirst = searchTextCalls();

    const second = await runWithPlacesRequestBudget('negcache:second', () =>
      resolveParkingGooglePlace(noMatchLot),
    );
    const afterSecond = searchTextCalls();

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(afterFirst).toBeGreaterThan(0);
    // Negative cache prevented the second run from issuing any new live SearchText calls.
    expect(afterSecond).toBe(afterFirst);
    expect(getGooglePlacesSearchDedupeStatsForTests().negativeCacheSkips).toBeGreaterThanOrEqual(1);
  });

  test('concurrent lookups for the same lot share one in-flight live search', async () => {
    const fetchMock = mockNoMatchFetch();
    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');

    const results = await runWithPlacesRequestBudget('negcache:concurrent', () =>
      Promise.all([
        resolveParkingGooglePlace(noMatchLot),
        resolveParkingGooglePlace(noMatchLot),
        resolveParkingGooglePlace(noMatchLot),
      ]),
    );

    expect(results).toEqual([null, null, null]);
    // Two of the three concurrent calls reused the single in-flight promise.
    expect(getGooglePlacesSearchDedupeStatsForTests().inFlightShares).toBe(2);
    expect(
      fetchMock.mock.calls.filter(([url]) => isSearchTextUrl(String(url))).length,
    ).toBeGreaterThan(0);
  });

  test('negative cache expires after its TTL and a fresh live search is allowed', async () => {
    process.env.GOOGLE_PLACES_NEGATIVE_MATCH_TTL_MS = '15';
    const fetchMock = mockNoMatchFetch();
    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');

    const legacyCalls = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes(SEARCH_TEXT_LEGACY)).length;

    await runWithPlacesRequestBudget('negcache:ttl-first', () =>
      resolveParkingGooglePlace(noMatchLot),
    );
    const afterFirst = legacyCalls();
    expect(afterFirst).toBeGreaterThan(0);

    await delay(40);

    await runWithPlacesRequestBudget('negcache:ttl-second', () =>
      resolveParkingGooglePlace(noMatchLot),
    );
    const afterSecond = legacyCalls();

    // After the TTL elapses the lot is searched live again (not permanently blocked).
    expect(afterSecond).toBeGreaterThan(afterFirst);
  });

  test('airport behavior unchanged: a successful match resolves and is not negatively cached', async () => {
    const fetchMock = mockMatchFetch('places/jiffy');
    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');

    const place = await runWithPlacesRequestBudget('negcache:airport', () =>
      resolveParkingGooglePlace({
        lotName: 'Jiffy Airport Parking',
        lotAddress: '18836 International Blvd',
        airportCode: 'SEA',
        provider: 'ParkWhiz',
        source: 'ParkWhiz',
      }),
    );

    expect(place?.googlePlaceId).toBe('places/jiffy');
    expect(getGooglePlacesSearchDedupeStatsForTests().negativeCacheSkips).toBe(0);
    expect(
      fetchMock.mock.calls.filter(([url]) => isSearchTextUrl(String(url))).length,
    ).toBeGreaterThan(0);
  });

  test('event/general no-match does not block an airport lot with the same name', async () => {
    const fetchMock = mockNoMatchFetch();
    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');

    // City/general no-match lot is negatively cached under the UNKNOWN namespace.
    const cityResult = await runWithPlacesRequestBudget('negcache:city', () =>
      resolveParkingGooglePlace({
        lotName: 'Pier 66 Surface',
        lotAddress: '2401 Alaskan Way, Seattle, WA',
        airportCode: null,
        provider: 'ParkWhiz',
        source: 'ParkWhiz',
      }),
    );
    expect(cityResult).toBeNull();

    const afterCity = fetchMock.mock.calls.filter(([url]) => isSearchTextUrl(String(url))).length;

    // The airport lot lives in a separate (SEA) namespace and must still be searched.
    const airportResult = await runWithPlacesRequestBudget('negcache:airport-sep', () =>
      resolveParkingGooglePlace({
        lotName: 'Pier 66 Surface',
        lotAddress: '2401 Alaskan Way, Seattle, WA',
        airportCode: 'SEA',
        provider: 'ParkWhiz',
        source: 'ParkWhiz',
      }),
    );
    expect(airportResult).toBeNull();

    const afterAirport = fetchMock.mock.calls.filter(([url]) => isSearchTextUrl(String(url))).length;

    // Airport namespace was not skipped by the city lot's negative cache entry.
    expect(afterAirport).toBeGreaterThan(afterCity);
  });
});
