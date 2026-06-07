import {
  getActivePlacesRequestBudget,
  hasPhotoMediaBeenRequestedThisRequest,
  markPhotoMediaRequestedThisRequest,
  resetPlacesRequestBudgetForTests,
  runWithPlacesRequestBudget,
} from '../lib/apiUsage/placesRequestBudget';
import {
  getGooglePlacesDailyCountsSnapshot,
  resetGooglePlacesDailyBudgetForTests,
} from '../lib/apiUsage/googlePlacesDailyBudget';
import {
  canMakeLiveGetPlaceCall,
  canMakeLivePhotoMediaCall,
} from '../lib/parking/googlePlacesGuard';
import {
  resetGooglePlacesCacheForTests,
} from '../lib/parking/googlePlacesCache';
import {
  searchResultHasSufficientMetadata,
  shouldSkipGetPlaceForSearchResult,
} from '../lib/parking/googlePlacesMetadataPolicy';
import {
  resetPlaceMetadataRequestCacheForTests,
} from '../lib/parking/placeMetadataRequestCache';
import {
  getCachedPhotoMedia,
  cachePhotoMedia,
  clearPhotoMediaCacheForTests,
  dedupePhotoMediaFetch,
} from '../lib/parking/placeMediaCache';
import { resetParkingLotPhotoRouteCacheForTests } from '../app/api/parking-lot-photo/route';

jest.mock('../lib/db/client', () => ({
  db: {
    query: jest.fn(async () => ({ rows: [] })),
    connect: jest.fn(),
  },
  parkingDbCacheDisabledByConfig: () => false,
}));

describe('Google Places quota efficiency', () => {
  beforeEach(() => {
    resetPlacesRequestBudgetForTests();
    resetGooglePlacesDailyBudgetForTests();
    resetGooglePlacesCacheForTests();
    resetPlaceMetadataRequestCacheForTests();
    clearPhotoMediaCacheForTests();
    resetParkingLotPhotoRouteCacheForTests();
    jest.restoreAllMocks();
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.DISABLE_GOOGLE_PLACE_PHOTOS;
    delete process.env.DISABLE_GOOGLE_PLACE_REVIEWS;
    delete process.env.GOOGLE_GETPLACE_DAILY_LIMIT;
    delete process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
    process.env.NODE_ENV = 'development';
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'false';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '50';
    process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '50';
    process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '20';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '100';
  });

  test('Supabase hit skips GetPlace', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');
    const dbModule = await import('../lib/db/client');

    (dbModule.db.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          cache_key: 'SEA|jiffy',
          parking_lot_id: 1,
          airport_code: 'SEA',
          lot_name: 'Jiffy Airport Parking',
          normalized_lot_name: 'jiffy airport parking',
          lot_address: '18836 International Blvd',
          google_place_id: 'places/jiffy',
          google_place_name: 'Jiffy Airport Parking',
          google_formatted_address: '18836 International Blvd',
          google_maps_uri: 'https://maps.example/jiffy',
          rating: 4.4,
          review_count: 1200,
          reviews_json: [],
          match_confidence: 'strong',
          lat: 47.439,
          lng: -122.294,
          photo_name: 'places/jiffy/photos/1',
          photo_names_json: ['places/jiffy/photos/1'],
          photo_refreshed_at: new Date().toISOString(),
          photo_source: 'google',
          last_fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      ],
    });

    await runWithPlacesRequestBudget('supabase-hit:test', async () => {
      const place = await resolveParkingGooglePlace({
        lotName: 'Jiffy Airport Parking',
        lotAddress: '18836 International Blvd',
        airportCode: 'SEA',
      });

      expect(place?.googlePlaceId).toBe('places/jiffy');
      expect(place?.source).toBe('supabase-cache');
    });

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('places.googleapis.com')),
    ).toHaveLength(0);
  });

  test('SearchText with photos skips GetPlace', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('places:searchText')) {
        return {
          ok: true,
          json: async () => ({
            places: [
              {
                id: 'places/jiffy',
                displayName: { text: 'Jiffy Airport Parking' },
                formattedAddress: '18836 International Blvd',
                location: { latitude: 47.439, longitude: -122.294 },
                rating: 4.4,
                userRatingCount: 1200,
                googleMapsUri: 'https://maps.example/jiffy',
                photos: [{ name: 'places/jiffy/photos/1' }],
              },
            ],
          }),
        } as Response;
      }

      if (url.includes('/places/places')) {
        throw new Error('GetPlace should not be called when SearchText is sufficient');
      }

      return { ok: false, json: async () => ({}) } as Response;
    });

    expect(
      shouldSkipGetPlaceForSearchResult({
        place_id: 'places/jiffy',
        name: 'Jiffy Airport Parking',
        rating: 4.4,
        user_ratings_total: 1200,
        lat: 47.439,
        lng: -122.294,
        photoName: 'places/jiffy/photos/1',
      }),
    ).toBe(true);

    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');

    await runWithPlacesRequestBudget('searchtext-skip-getplace:test', async () => {
      const place = await resolveParkingGooglePlace({
        lotName: 'Jiffy Airport Parking',
        lotAddress: '18836 International Blvd',
        airportCode: 'SEA',
      });

      expect(place?.googlePlaceId).toBe('places/jiffy');
      expect(place?.photoName).toBe('places/jiffy/photos/1');
    });

    const getPlaceCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/places/places'),
    );
    expect(getPlaceCalls).toHaveLength(0);
    expect(searchResultHasSufficientMetadata({
      place_id: 'places/jiffy',
      name: 'Jiffy Airport Parking',
      rating: 4.4,
      user_ratings_total: 1200,
      lat: 47.439,
      lng: -122.294,
      photoName: 'places/jiffy/photos/1',
    })).toBe(true);
  });

  test('reviews only load on modal route, not during place resolve', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('places:searchText')) {
        return {
          ok: true,
          json: async () => ({
            places: [
              {
                id: 'places/jiffy',
                displayName: { text: 'Jiffy Airport Parking' },
                formattedAddress: '18836 International Blvd',
                location: { latitude: 47.439, longitude: -122.294 },
                rating: 4.4,
                userRatingCount: 1200,
                photos: [{ name: 'places/jiffy/photos/1' }],
              },
            ],
          }),
        } as Response;
      }

      return { ok: false, json: async () => ({}) } as Response;
    });

    const { resolveParkingGooglePlace } = await import('../lib/parking/googlePlacesCache');

    await runWithPlacesRequestBudget('reviews-lazy:test', async () => {
      const place = await resolveParkingGooglePlace({
        lotName: 'Jiffy Airport Parking',
        airportCode: 'SEA',
      });

      expect(place?.rating).toBe(4.4);
      expect(place?.reviewCount).toBe(1200);
      expect(place?.reviews).toEqual([]);
    });

    const getPlaceCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/places/places'),
    );
    expect(getPlaceCalls).toHaveLength(0);
  });

  test('provider image path skips GetPhotoMedia guard when photos disabled', async () => {
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'true';

    const fetchMock = jest.spyOn(global, 'fetch');

    const { GET } = await import('../app/api/google-place-photo/route');
    const { NextRequest } = await import('next/server');

    const response = await GET(
      new NextRequest('http://localhost/api/google-place-photo?name=places/abc/photos/def'),
    );

    expect(response.status).toBe(200);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('/media?')),
    ).toHaveLength(0);
  });

  test('hidden cards use background priority and skip live photo lookup', async () => {
    const { parkingPhotoPriorityForMoreParkingRank } = await import('../lib/parking/parkingLotPhotoShared');

    expect(parkingPhotoPriorityForMoreParkingRank(4, 6)).toBe('background');
    expect(parkingPhotoPriorityForMoreParkingRank(7, 6)).toBe('visible');
  });

  test('googlePhotoName deduped per request budget scope', async () => {
    await runWithPlacesRequestBudget('photo-dedupe:test', async () => {
      expect(hasPhotoMediaBeenRequestedThisRequest('places/shared/photos/1')).toBe(false);
      markPhotoMediaRequestedThisRequest('places/shared/photos/1');
      expect(hasPhotoMediaBeenRequestedThisRequest('places/shared/photos/1')).toBe(true);
    });

    expect(hasPhotoMediaBeenRequestedThisRequest('places/shared/photos/1')).toBe(false);

    const fetchMock = jest.fn().mockResolvedValue({
      body: new ArrayBuffer(8),
      contentType: 'image/jpeg',
      ts: Date.now(),
    });

    await dedupePhotoMediaFetch('places/shared/photos/1', 900, fetchMock);
    await dedupePhotoMediaFetch('places/shared/photos/1', 900, fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedPhotoMedia('places/shared/photos/1', 900)).not.toBeNull();
  });

  test('budget guard blocks GetPlace when daily limit reached', () => {
    process.env.GOOGLE_GETPLACE_DAILY_LIMIT = '1';
    process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '5';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '5';

    expect(
      canMakeLiveGetPlaceCall({
        reason: 'place_details',
        route: 'test',
        cacheKey: 'first',
      }),
    ).toBe(true);

    expect(
      canMakeLiveGetPlaceCall({
        reason: 'place_details',
        route: 'test',
        cacheKey: 'second',
      }),
    ).toBe(false);

    expect(getGooglePlacesDailyCountsSnapshot().getPlace).toBe(1);
  });

  test('usage summary logs at end of request budget scope', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    await runWithPlacesRequestBudget('summary:test', async () => {
      const budget = getActivePlacesRequestBudget();
      expect(budget?.route).toBe('/api/recommendations');
    });

    expect(
      infoSpy.mock.calls.some(([message, payload]) =>
        message === 'google_usage_summary' &&
        payload &&
        typeof payload === 'object' &&
        (payload as { requestKey: string }).requestKey === 'summary:test',
      ),
    ).toBe(true);

    infoSpy.mockRestore();
  });

  test('negative no-photo cache prevents repeat live lookup', async () => {
    const { GET } = await import('../app/api/parking-lot-photo/route');
    const { NextRequest } = await import('next/server');
    const cacheModule = await import('../lib/parking/googlePlacesCache');

    jest.spyOn(cacheModule, 'resolveParkingGooglePlace').mockResolvedValue(null);

    const query =
      'lotName=No%20Photo%20Lot&airportCode=SEA&priority=top&provider=ParkWhiz&providerLotId=999';

    const first = await GET(new NextRequest(`http://localhost/api/parking-lot-photo?${query}`));
    const firstJson = await first.json();
    expect(firstJson.source).toBe('placeholder');

    const second = await GET(new NextRequest(`http://localhost/api/parking-lot-photo?${query}`));
    const secondJson = await second.json();
    expect(secondJson.source).toBe('placeholder');
    expect(cacheModule.resolveParkingGooglePlace).toHaveBeenCalledTimes(1);
  });
});
