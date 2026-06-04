import {
  buildAirportSearchCacheKey,
  getGoogleParkingPlaces,
  looksLikeParkingOrTransitName,
  resetAirportSearchCacheForTests,
} from '../airportSearch';
import { getAirportById } from '../../../../../airports/catalog';
import { resolveParkingPricing } from '../../../../pricingResolver';
import { resetPlacesRequestBudgetForTests, runWithPlacesRequestBudget } from '../../../../../apiUsage/placesRequestBudget';

const SEA_AIRPORT_LABEL = getAirportById('SEA')!.label;

jest.mock('../../../../../env/googleMapsServerKey', () => ({
  getGoogleMapsServerApiKey: jest.fn(() => 'test-key'),
}));

jest.mock('../../../../dynamicParkingPricing', () => ({
  resolveDynamicParkingPrice: jest.fn(async () => null),
}));

function mockParkingPlace(id: string, name: string) {
  return {
    id,
    displayName: { text: name },
    formattedAddress: '17801 International Blvd, SeaTac, WA',
    location: { latitude: 47.44, longitude: -122.29 },
    rating: 4.5,
    userRatingCount: 120,
  };
}

function applyLiveGoogleParkingEnv(): void {
  delete process.env.DISABLE_GOOGLE_PLACES;
  delete process.env.DISABLE_GOOGLE_PARKING_DISCOVERY;
  process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
  process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '5';
  process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '5';
  process.env.GOOGLE_PARKING_MIN_RESULTS_BEFORE_STOP = '5';
}

describe('Google airport parking discovery helpers', () => {
  beforeEach(() => {
    resetAirportSearchCacheForTests();
    resetPlacesRequestBudgetForTests();
    jest.restoreAllMocks();
  });

  test('allows park-and-ride and transit center names', () => {
    expect(looksLikeParkingOrTransitName('Northgate Transit Center')).toBe(true);
    expect(looksLikeParkingOrTransitName('Angle Lake Park & Ride')).toBe(true);
    expect(looksLikeParkingOrTransitName('SeaTac Link Station Parking')).toBe(true);
    expect(looksLikeParkingOrTransitName('Airport Shuttle Parking Lot')).toBe(true);
  });

  test('blocks clearly unrelated businesses', () => {
    expect(looksLikeParkingOrTransitName('Joe\'s Coffee Shop')).toBe(false);
    expect(looksLikeParkingOrTransitName('Shell Gas Station')).toBe(false);
    expect(looksLikeParkingOrTransitName('Planet Fitness')).toBe(false);
  });

  test('uses lower estimated band for park-and-ride lots', () => {
    const pricing = resolveParkingPricing({
      airportCode: 'SEA',
      lotName: 'Northgate Transit Center Parking',
      lotKind: 'park-and-ride',
    });

    expect(pricing.priceMin).toBe(5);
    expect(pricing.priceMax).toBe(15);
    expect(pricing.priceDisplay).toBe('estimated');
  });

  test('uses wider off-airport estimated band for unknown google lots', () => {
    const pricing = resolveParkingPricing({
      airportCode: 'LAX',
      lotName: 'Off Airport Parking Garage',
      lotKind: 'off-airport',
    });

    expect(pricing.priceMin).toBe(12);
    expect(pricing.priceMax).toBe(28);
    expect(pricing.priceDisplay).toBe('estimated');
  });

  test('buildAirportSearchCacheKey normalizes query and rounds coordinates', () => {
    const cacheKey = buildAirportSearchCacheKey({
      airportCode: 'sea',
      airportCoordinates: { lat: 47.4502499, lng: -122.3088499 },
      radiusMeters: 50000,
      textQuery: '  Airport   Parking   Near   SEA  ',
    });

    expect(cacheKey).toBe('SEA|47.45,-122.309|50000|airport parking near sea');
  });

  test('uses one searchText call when the primary query returns enough parking', async () => {
    applyLiveGoogleParkingEnv();

    let searchTextCalls = 0;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.includes('places:searchText')) {
        return { ok: false, json: async () => ({}) } as Response;
      }

      searchTextCalls += 1;
      const body = JSON.parse(String(init?.body));
      expect(body.textQuery).toBe(`airport parking near ${SEA_AIRPORT_LABEL}`);

      return {
        ok: true,
        json: async () => ({
          places: Array.from({ length: 5 }, (_, index) =>
            mockParkingPlace(`primary-${index}`, `SEA Airport Parking Lot ${index + 1}`),
          ),
        }),
      } as Response;
    });

    await runWithPlacesRequestBudget('airport-search:primary-only', async () => {
      const options = await getGoogleParkingPlaces({
        airportCode: 'SEA',
        destination: 'Seattle-Tacoma International Airport',
      });

      expect(options).toHaveLength(5);
      expect(searchTextCalls).toBe(1);
    });

    fetchMock.mockRestore();
  });

  test('falls back to additional queries when primary results are too sparse', async () => {
    applyLiveGoogleParkingEnv();

    const attemptedQueries: string[] = [];
    let searchTextCalls = 0;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.includes('places:searchText')) {
        return { ok: false, json: async () => ({}) } as Response;
      }

      searchTextCalls += 1;
      const body = JSON.parse(String(init?.body));
      attemptedQueries.push(body.textQuery);

      if (body.textQuery.startsWith('off airport parking near')) {
        return {
          ok: true,
          json: async () => ({
            places: Array.from({ length: 4 }, (_, index) =>
              mockParkingPlace(`fallback-${index}`, `Off Airport Parking ${index + 1}`),
            ),
          }),
        } as Response;
      }

      if (body.textQuery.startsWith('airport parking near')) {
        return {
          ok: true,
          json: async () => ({
            places: [mockParkingPlace('sparse-1', 'SEA Airport Parking Lot')],
          }),
        } as Response;
      }

      return { ok: true, json: async () => ({ places: [] }) } as Response;
    });

    await runWithPlacesRequestBudget('airport-search:fallback', async () => {
      const options = await getGoogleParkingPlaces({
        airportCode: 'SEA',
        destination: 'Seattle-Tacoma International Airport',
      });

      expect(options.length).toBeGreaterThanOrEqual(5);
      expect(searchTextCalls).toBe(2);
      expect(attemptedQueries).toEqual([
        `airport parking near ${SEA_AIRPORT_LABEL}`,
        `off airport parking near ${SEA_AIRPORT_LABEL}`,
      ]);
    });

    fetchMock.mockRestore();
  });

  test('uses the third fallback only when the first two queries are still weak', async () => {
    applyLiveGoogleParkingEnv();

    const attemptedQueries: string[] = [];
    let searchTextCalls = 0;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.includes('places:searchText')) {
        return { ok: false, json: async () => ({}) } as Response;
      }

      searchTextCalls += 1;
      const body = JSON.parse(String(init?.body));
      attemptedQueries.push(body.textQuery);

      if (body.textQuery.startsWith('park and ride to')) {
        return {
          ok: true,
          json: async () => ({
            places: Array.from({ length: 3 }, (_, index) =>
              mockParkingPlace(`third-${index}`, `Park and Ride Airport Parking ${index + 1}`),
            ),
          }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => ({
          places: [mockParkingPlace(`sparse-${searchTextCalls}`, `Sparse Airport Parking ${searchTextCalls}`)],
        }),
      } as Response;
    });

    await runWithPlacesRequestBudget('airport-search:third-fallback', async () => {
      const options = await getGoogleParkingPlaces({
        airportCode: 'SEA',
        destination: 'Seattle-Tacoma International Airport',
      });

      expect(options.length).toBeGreaterThanOrEqual(5);
      expect(searchTextCalls).toBe(3);
      expect(attemptedQueries).toEqual([
        `airport parking near ${SEA_AIRPORT_LABEL}`,
        `off airport parking near ${SEA_AIRPORT_LABEL}`,
        `park and ride to ${SEA_AIRPORT_LABEL}`,
      ]);
    });

    fetchMock.mockRestore();
  });

  test('never restores the old 12-query airport fan-out', async () => {
    applyLiveGoogleParkingEnv();
    process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '20';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '20';

    let searchTextCalls = 0;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes('places:searchText')) {
        return { ok: false, json: async () => ({}) } as Response;
      }

      searchTextCalls += 1;
      return { ok: true, json: async () => ({ places: [] }) } as Response;
    });

    await runWithPlacesRequestBudget('airport-search:max-three', async () => {
      const options = await getGoogleParkingPlaces({
        airportCode: 'SEA',
        destination: 'Seattle-Tacoma International Airport',
      });

      expect(options).toHaveLength(0);
      expect(searchTextCalls).toBeLessThanOrEqual(3);
      expect(searchTextCalls).not.toBe(12);
    });

    fetchMock.mockRestore();
  });

  test('reuses module cache across repeated airport searches', async () => {
    applyLiveGoogleParkingEnv();

    let searchTextCalls = 0;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (!url.includes('places:searchText')) {
        return { ok: false, json: async () => ({}) } as Response;
      }

      searchTextCalls += 1;
      return {
        ok: true,
        json: async () => ({
          places: Array.from({ length: 5 }, (_, index) =>
            mockParkingPlace(`cached-${index}`, `SEA Airport Parking Cached ${index + 1}`),
          ),
        }),
      } as Response;
    });

    await runWithPlacesRequestBudget('airport-search:cache-first', async () => {
      await getGoogleParkingPlaces({
        airportCode: 'SEA',
        destination: 'Seattle-Tacoma International Airport',
      });
    });

    await runWithPlacesRequestBudget('airport-search:cache-second', async () => {
      await getGoogleParkingPlaces({
        airportCode: 'SEA',
        destination: 'Seattle-Tacoma International Airport',
      });
    });

    expect(searchTextCalls).toBe(1);

    fetchMock.mockRestore();
  });
});
