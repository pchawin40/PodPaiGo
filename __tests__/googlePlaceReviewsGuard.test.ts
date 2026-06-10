import {
  canMakeLiveGoogleReviewCall,
  isGooglePlaceReviewsLiveBlocked,
} from '../lib/parking/googlePlacesGuard';
import { getActivePlacesRequestBudget, resetPlacesRequestBudgetForTests, runWithPlacesRequestBudget, tryConsumePlacesReviewCall } from '../lib/apiUsage/placesRequestBudget';
import {
  GOOGLE_LISTING_NOT_FOUND_MESSAGE,
  GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE,
  GOOGLE_REVIEWS_SAFE_MODE_MESSAGE,
} from '../lib/parking/googlePlacesSafeMode';
import { resetGooglePlacesCacheForTests } from '../lib/parking/googlePlacesCache';

jest.mock('../lib/db/client', () => ({
  db: {
    query: jest.fn(async () => ({ rows: [] })),
    connect: jest.fn(),
  },
  parkingDbCacheDisabledByConfig: () => false,
}));

describe('google place reviews guard', () => {
  beforeEach(() => {
    resetPlacesRequestBudgetForTests();
    resetGooglePlacesCacheForTests();
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.DISABLE_GOOGLE_PLACE_REVIEWS;
    delete process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST;
    process.env.NODE_ENV = 'development';
  });

  test('DISABLE_GOOGLE_PLACE_REVIEWS=true blocks review fetch', () => {
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'true';

    expect(isGooglePlaceReviewsLiveBlocked()).toBe(true);
    expect(
      canMakeLiveGoogleReviewCall({
        reason: 'reviews',
        route: '/api/parking-reviews',
        cacheKey: 'place-123',
      }),
    ).toBe(false);
  });

  test('DISABLE_GOOGLE_PLACES=true also blocks reviews', () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'false';

    expect(
      canMakeLiveGoogleReviewCall({
        reason: 'reviews',
        route: '/api/parking-reviews',
        cacheKey: 'place-123',
      }),
    ).toBe(false);
  });

  test('MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST=0 blocks reviews', () => {
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'false';
    process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST = '0';

    const { getMaxGooglePlaceReviewsPerRequest } = require('../lib/apiUsage/placesRequestLimits');
    expect(getMaxGooglePlaceReviewsPerRequest()).toBe(0);
    expect(tryConsumePlacesReviewCall()).toBe(false);
    expect(
      canMakeLiveGoogleReviewCall({
        reason: 'reviews',
        route: '/api/parking-reviews',
        cacheKey: 'place-123',
      }),
    ).toBe(false);
  });

  test('DISABLE_GOOGLE_PLACE_REVIEWS=false allows reviews when caps allow', () => {
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'false';
    process.env.DISABLE_GOOGLE_PLACES = 'false';
    process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '2';

    expect(isGooglePlaceReviewsLiveBlocked()).toBe(false);
  });

  test('review call increments details + total budget when enabled', async () => {
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'false';
    process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '1';

    await runWithPlacesRequestBudget('parking-reviews:test', async () => {
      expect(
        canMakeLiveGoogleReviewCall({
          reason: 'reviews',
          route: '/api/parking-reviews',
          cacheKey: 'place-123',
        }),
      ).toBe(true);

      expect(
        canMakeLiveGoogleReviewCall({
          reason: 'reviews',
          route: '/api/parking-reviews',
          cacheKey: 'place-456',
        }),
      ).toBe(false);

      const budget = getActivePlacesRequestBudget();
      expect(budget?.reviews).toBe(1);
      expect(budget?.getPlace).toBe(1);
      expect(budget?.total).toBe(1);
      expect(budget?.blocked).toBe(1);
    });
  });

  test('coordinate resolution does not request review fields', async () => {
    delete process.env.DISABLE_GOOGLE_PLACES;
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'true';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '1';
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'places/abc',
        displayName: { text: 'Test Lot' },
        formattedAddress: '123 Main',
        location: { latitude: 47.6, longitude: -122.3 },
        googleMapsUri: 'https://maps.example/test',
      }),
    } as Response);

    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');

    await runWithPlacesRequestBudget('place-details:test', async () => {
      await resolveParkingGooglePlace({
        lotName: 'Jiffy Airport Parking',
        googlePlaceId: 'place-abc',
        airportCode: 'SEA',
      });
    });

    const googleFetch = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('places.googleapis.com'),
    );
    expect(googleFetch).toBeTruthy();

    const headers = (googleFetch?.[1] as RequestInit | undefined)?.headers as
      | Record<string, string>
      | undefined;
    const fieldMask = headers?.['X-Goog-FieldMask'];

    expect(String(fieldMask)).not.toContain('reviews');
    expect(String(fieldMask)).not.toContain('rating');
    expect(String(fieldMask)).not.toContain('userRatingCount');

    fetchMock.mockRestore();
  });
});

describe('/api/parking-reviews route', () => {
  beforeEach(() => {
    resetPlacesRequestBudgetForTests();
    resetGooglePlacesCacheForTests();
    jest.restoreAllMocks();
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.DISABLE_GOOGLE_PLACE_REVIEWS;
    delete process.env.DISABLE_GOOGLE_PARKING_DISCOVERY;
    delete process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST;
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'true';
    process.env.DISABLE_GOOGLE_PLACES = 'true';
  });

  test('cache miss returns disabled response without Google fetch', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    const cachedSpy = jest
      .spyOn(await import('../lib/parking/googlePlacesCache'), 'getCachedParkingGoogleReviews')
      .mockResolvedValue(null);

    const { GET } = await import('../app/api/parking-reviews/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest(
      'http://localhost/api/parking-reviews?name=Jiffy%20Airport%20Parking&airport=SEA',
    );

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.reviews).toEqual([]);
    expect(json.source).toBe('disabled');
    expect(json.message).toBe(GOOGLE_REVIEWS_SAFE_MODE_MESSAGE);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('places.googleapis.com')),
    ).toHaveLength(0);

    cachedSpy.mockRestore();
    fetchMock.mockRestore();
  });

  test('cached reviews return without Google fetch', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    const cachedSpy = jest
      .spyOn(await import('../lib/parking/googlePlacesCache'), 'getCachedParkingGoogleReviews')
      .mockResolvedValue({
        cacheKey: 'SEA|jiffy',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking',
        googlePlaceId: 'place-123',
        reviews: [
          {
            id: 'review-1',
            authorName: 'Alex',
            rating: 5,
            text: 'Easy parking',
          },
        ],
        fetchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        source: 'supabase-cache',
      });

    const { GET } = await import('../app/api/parking-reviews/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest(
      'http://localhost/api/parking-reviews?name=Jiffy%20Airport%20Parking&airport=SEA',
    );

    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.reviews).toHaveLength(1);
    expect(json.source).toBe('supabase-cache');
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('places.googleapis.com')),
    ).toHaveLength(0);

    cachedSpy.mockRestore();
    fetchMock.mockRestore();
  });

  test('no googlePlaceId with discovery disabled returns no-listing', async () => {
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'false';
    process.env.DISABLE_GOOGLE_PLACES = 'false';
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';
    process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '2';

    const cacheModule = await import('../lib/parking/googlePlacesCache');
    const cachedSpy = jest.spyOn(cacheModule, 'getCachedParkingGoogleReviews').mockResolvedValue(null);

    const { GET } = await import('../app/api/parking-reviews/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest(
      'http://localhost/api/parking-reviews?name=Four%20Points%20Sheraton%20Lot&airport=SEA',
    );

    const response = await GET(request);
    const json = await response.json();

    expect(json.source).toBe('no-listing');
    expect(json.message).toBe(GOOGLE_LISTING_NOT_FOUND_MESSAGE);

    cachedSpy.mockRestore();
  });

  test('no googlePlaceId with reviews enabled attempts one place match', async () => {
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'false';
    process.env.DISABLE_GOOGLE_PLACES = 'false';
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'false';
    process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '3';
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';

    const cacheModule = await import('../lib/parking/googlePlacesCache');
    jest.spyOn(cacheModule, 'getCachedParkingGoogleReviews').mockResolvedValue(null);

    let searchTextCalls = 0;
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('places:searchText')) {
        searchTextCalls += 1;
        return {
          ok: true,
          json: async () => ({
            places: [
              {
                id: 'place-matched',
                displayName: { text: 'Four Points by Sheraton Seattle Airport South' },
                formattedAddress: '19500 International Blvd, Seattle, WA',
                location: { latitude: 47.44, longitude: -122.29 },
                rating: 4.2,
                userRatingCount: 88,
                types: ['parking'],
              },
            ],
          }),
        } as Response;
      }

      if (url.includes('places/place-matched')) {
        return {
          ok: true,
          json: async () => ({
            id: 'place-matched',
            displayName: { text: 'Four Points by Sheraton Seattle Airport South' },
            formattedAddress: '19500 International Blvd, Seattle, WA',
            location: { latitude: 47.44, longitude: -122.29 },
            rating: 4.2,
            userRatingCount: 88,
            reviews: [
              {
                name: 'review-1',
                authorAttribution: { displayName: 'Sam' },
                rating: 5,
                relativePublishTimeDescription: '1 week ago',
                text: { text: 'Convenient airport parking.' },
              },
            ],
          }),
        } as Response;
      }

      return { ok: false, json: async () => ({}) } as Response;
    });

    await runWithPlacesRequestBudget('parking-reviews:place-match', async () => {
      await cacheModule.resolveParkingGoogleReviews({
        lotName: 'Four Points by Sheraton Seattle Airport South Lot - Self Uncovered',
        airportCode: 'SEA',
        lotAddress: '19500 International Blvd, Seattle, WA',
      });
    });

    expect(searchTextCalls).toBe(1);

    fetchMock.mockRestore();
    jest.restoreAllMocks();
  });

  test('review lookup does not stop at coordinate-only place-id cache records', async () => {
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'false';
    process.env.DISABLE_GOOGLE_PLACES = 'false';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '2';
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';

    const { db } = await import('../lib/db/client');
    const queryMock = db.query as jest.Mock;
    queryMock.mockImplementation(async (sql: unknown, params?: unknown[]) => {
      if (
        String(sql).includes('where google_place_id = $1') &&
        params?.[0] === 'place-cached'
      ) {
        return {
          rows: [
            {
              cache_key: 'SEA|1935-2nd-ave-lot',
              airport_code: 'SEA',
              lot_name: '1935 2nd Ave. Lot',
              normalized_lot_name: '1935 2nd Ave Lot',
              lot_address: '161 Virginia St., Seattle, WA 98101',
              google_place_id: 'place-cached',
              google_place_name: '1935 2nd Ave. Lot',
              google_formatted_address: '161 Virginia St., Seattle, WA 98101',
              google_maps_uri: 'https://maps.example/place-cached',
              rating: 3.6,
              review_count: 32,
              reviews_json: [],
              lat: 47.611,
              lng: -122.342,
              last_fetched_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 86400000).toISOString(),
            },
          ],
        };
      }

      return { rows: [] };
    });

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('places.googleapis.com/v1/places/place-cached')) {
        return {
          ok: true,
          json: async () => ({
            id: 'place-cached',
            displayName: { text: '1935 2nd Ave. Lot' },
            formattedAddress: '161 Virginia St., Seattle, WA 98101',
            location: { latitude: 47.611, longitude: -122.342 },
            rating: 3.6,
            userRatingCount: 32,
            googleMapsUri: 'https://maps.example/place-cached',
            reviews: [
              {
                name: 'places/place-cached/reviews/1',
                authorAttribution: { displayName: 'Dana' },
                rating: 4,
                relativePublishTimeDescription: '3 weeks ago',
                text: { text: 'Simple lot near Pike Place.' },
              },
            ],
          }),
        } as Response;
      }

      return { ok: false, json: async () => ({}) } as Response;
    });

    const cacheModule = await import('../lib/parking/googlePlacesCache');
    const result = await runWithPlacesRequestBudget('parking-reviews:coord-cache', async () =>
      cacheModule.resolveParkingGoogleReviews({
        googlePlaceId: 'place-cached',
        lotName: '1935 2nd Ave. Lot',
        lotAddress: '161 Virginia St., Seattle, WA 98101',
        airportCode: 'SEA',
      }),
    );

    expect(result?.reviews).toHaveLength(1);
    expect(result?.reviews[0]?.text).toBe('Simple lot near Pike Place.');
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('places.googleapis.com/v1/places/place-cached'),
      ),
    ).toHaveLength(1);

    fetchMock.mockRestore();
    queryMock.mockImplementation(async () => ({ rows: [] }));
  });

  test('cap exceeded returns demo limit message', async () => {
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'false';
    process.env.DISABLE_GOOGLE_PLACES = 'false';
    process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '2';

    const cacheModule = await import('../lib/parking/googlePlacesCache');
    jest.spyOn(cacheModule, 'resolveParkingGoogleReviews').mockResolvedValue({
      cacheKey: 'SEA|lot',
      airportCode: 'SEA',
      lotName: 'Test Lot',
      googlePlaceId: 'place-123',
      reviews: [],
      fetchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'google-places',
    });

    const budgetModule = await import('../lib/apiUsage/placesRequestBudget');
    jest.spyOn(budgetModule, 'getActivePlacesRequestBudget').mockReturnValue({
      key: 'parking-reviews:test',
      route: '/api/parking-reviews',
      searchText: 0,
      getPlace: 1,
      photoMedia: 0,
      reviews: 1,
      total: 1,
      blocked: 1,
    });

    const { GET } = await import('../app/api/parking-reviews/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest(
      'http://localhost/api/parking-reviews?name=Test%20Lot&airport=SEA',
    );

    const response = await GET(request);
    const json = await response.json();

    expect(json.source).toBe('cap-exceeded');
    expect(json.message).toBe(GOOGLE_REVIEWS_CAP_EXCEEDED_MESSAGE);
    expect(json.place?.googlePlaceId).toBe('place-123');

    jest.restoreAllMocks();
  });

  test('successful cached placeId returns reviews when reviews enabled', async () => {
    process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'false';
    process.env.DISABLE_GOOGLE_PLACES = 'false';
    process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '2';

    const cacheModule = await import('../lib/parking/googlePlacesCache');
    jest.spyOn(cacheModule, 'resolveParkingGoogleReviews').mockResolvedValue({
      cacheKey: 'SEA|jiffy',
      airportCode: 'SEA',
      lotName: 'Jiffy Airport Parking',
      googlePlaceId: 'place-123',
      reviews: [
        {
          id: 'review-1',
          authorName: 'Alex',
          rating: 5,
          text: 'Easy parking',
        },
      ],
      fetchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      source: 'google-places',
    });

    const { GET } = await import('../app/api/parking-reviews/route');
    const { NextRequest } = await import('next/server');

    const request = new NextRequest(
      'http://localhost/api/parking-reviews?placeId=place-123&name=Jiffy%20Airport%20Parking&airport=SEA',
    );

    const response = await GET(request);
    const json = await response.json();

    expect(json.reviews).toHaveLength(1);
    expect(json.source).toBe('google-places');
    expect(json.place?.googlePlaceId).toBe('place-123');
    expect(json.liveReviewsEnabled).toBe(true);

    jest.restoreAllMocks();
  });
});
