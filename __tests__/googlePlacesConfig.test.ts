import {
  formatGooglePlacesSafetySummary,
  getEffectiveGooglePlacesConfig,
  inferGooglePlacesRequestRoute,
  logGooglePlacesConfig,
  logGooglePlacesRequestSummary,
} from '../lib/parking/googlePlacesConfig';
import { resetPlacesRequestBudgetForTests } from '../lib/apiUsage/placesRequestBudget';

describe('googlePlacesConfig logging', () => {
  beforeEach(() => {
    resetPlacesRequestBudgetForTests();
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.DISABLE_GOOGLE_PLACE_PHOTOS;
    delete process.env.DISABLE_GOOGLE_PARKING_DISCOVERY;
    delete process.env.DISABLE_PARKING_DB_CACHE;
    delete process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST;
    delete process.env.DISABLE_GOOGLE_PLACE_REVIEWS;
    delete process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST;
    delete process.env.DEBUG_LOGS;
    process.env.NODE_ENV = 'development';
  });

  test('getEffectiveGooglePlacesConfig reflects kill switches and dev caps', () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';
    process.env.DISABLE_PARKING_DB_CACHE = 'false';

    const config = getEffectiveGooglePlacesConfig();

    expect(config.disableGooglePlaces).toBe(true);
    expect(config.disableGooglePlacePhotos).toBe(true);
    expect(config.disableGooglePlaceReviews).toBe(true);
    expect(config.disableGoogleParkingDiscovery).toBe(true);
    expect(config.livePlacesEnabled).toBe(false);
    expect(config.liveReviewsEnabled).toBe(false);
    expect(config.dbCacheEnabled).toBe(true);
    expect(config.maxGoogleSearchTextPerRequest).toBe(0);
    expect(config.maxGooglePlaceDetailsPerRequest).toBe(0);
    expect(config.maxGooglePhotoMediaPerRequest).toBe(0);
    expect(config.maxGooglePlaceReviewsPerRequest).toBe(0);
    expect(config.maxGooglePlacesCallsPerRequest).toBe(0);
  });

  test('formatGooglePlacesSafetySummary matches expected one-line output', () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'true';
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';

    expect(formatGooglePlacesSafetySummary()).toBe(
      '[google-places-config] livePlaces=false photos=false discovery=false caps=0/0/0/0 dbCache=true',
    );
  });

  test('logGooglePlacesConfig prints safety summary in development', () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    logGooglePlacesConfig('startup');

    expect(info).toHaveBeenCalledWith(
      '[google-places-config] livePlaces=false photos=false discovery=false caps=0/0/0/0 dbCache=true',
    );

    info.mockRestore();
  });

  test('logGooglePlacesConfig prints verbose payload only when DEBUG_LOGS=true', () => {
    process.env.DEBUG_LOGS = 'true';
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    logGooglePlacesConfig('request', {
      route: '/api/recommendations',
      requestKey: 'test-key',
    });

    expect(info).toHaveBeenCalledWith(
      'google_places_config_request',
      expect.objectContaining({
        route: '/api/recommendations',
        requestKey: 'test-key',
        livePlacesEnabled: true,
      }),
    );

    info.mockRestore();
  });

  test('inferGooglePlacesRequestRoute maps known request keys', () => {
    expect(inferGooglePlacesRequestRoute('google-place-match:SEA|name:jiffy')).toBe(
      '/api/google-place-match',
    );
    expect(inferGooglePlacesRequestRoute('google-place-photo:places/abc/photos/1')).toBe(
      '/api/google-place-photo',
    );
    expect(inferGooglePlacesRequestRoute('live-refresh:{"airportCode":"SEA"}')).toBe(
      '/api/parking/live-refresh',
    );
    expect(inferGooglePlacesRequestRoute('parking-reviews:place-123')).toBe(
      '/api/parking-reviews',
    );
    expect(inferGooglePlacesRequestRoute('{"origin":"Monroe"}')).toBe('/api/recommendations');
  });

  test('logGooglePlacesRequestSummary prints dev one-line summary', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    logGooglePlacesRequestSummary({
      route: '/api/recommendations',
      requestKey: 'test-key',
      searchTextUsed: 0,
      getPlaceUsed: 0,
      photoMediaUsed: 0,
      reviewsUsed: 0,
      totalUsed: 0,
      blocked: 3,
    });

    expect(info).toHaveBeenCalledWith(
      '[google-places-config] request /api/recommendations used=0/0/0/0 reviews=0 blocked=3',
    );

    info.mockRestore();
  });
});
