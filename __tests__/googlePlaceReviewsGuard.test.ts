import {
  canMakeLiveGoogleReviewCall,
  isGooglePlaceReviewsLiveBlocked,
} from '../lib/parking/googlePlacesGuard';
import { getActivePlacesRequestBudget, resetPlacesRequestBudgetForTests, runWithPlacesRequestBudget, tryConsumePlacesReviewCall } from '../lib/apiUsage/placesRequestBudget';
import { resetGooglePlacesCacheForTests } from '../lib/parking/googlePlacesCache';

jest.mock('../lib/db/client', () => ({
  db: {
    query: jest.fn(async () => ({ rows: [] })),
    connect: jest.fn(),
  },
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
    expect(json.message).toMatch(/safe mode/i);
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
});
