import {
  canMakeLivePhotoMediaCall,
  isGooglePlacePhotosLiveBlocked,
} from '../lib/parking/googlePlacesGuard';
import {
  getActivePlacesRequestBudget,
  resetPlacesRequestBudgetForTests,
  runWithPlacesRequestBudget,
} from '../lib/apiUsage/placesRequestBudget';

describe('google place photos guard', () => {
  beforeEach(() => {
    resetPlacesRequestBudgetForTests();
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.DISABLE_GOOGLE_PLACE_PHOTOS;
    delete process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST;
  });

  test('photos blocked unless DISABLE_GOOGLE_PLACE_PHOTOS=false', () => {
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'true';
    expect(isGooglePlacePhotosLiveBlocked()).toBe(true);

    delete process.env.DISABLE_GOOGLE_PLACE_PHOTOS;
    expect(isGooglePlacePhotosLiveBlocked()).toBe(true);

    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'false';
    process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '1';
    expect(isGooglePlacePhotosLiveBlocked()).toBe(false);
  });

  test('MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST=0 blocks PhotoMedia', () => {
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'false';
    process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '0';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '1';

    expect(isGooglePlacePhotosLiveBlocked()).toBe(true);
    expect(
      canMakeLivePhotoMediaCall({
        reason: 'place_photo_media',
        route: '/api/google-place-photo',
        cacheKey: 'places/abc/photos/def',
      }),
    ).toBe(false);
  });

  test('photo cap 1 allows only one PhotoMedia call per request budget', async () => {
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'false';
    process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '1';

    await runWithPlacesRequestBudget('google-place-photo:test', async () => {
      expect(
        canMakeLivePhotoMediaCall({
          reason: 'place_photo_media',
          route: '/api/google-place-photo',
          cacheKey: 'places/abc/photos/1',
        }),
      ).toBe(true);

      expect(
        canMakeLivePhotoMediaCall({
          reason: 'place_photo_media',
          route: '/api/google-place-photo',
          cacheKey: 'places/abc/photos/2',
        }),
      ).toBe(false);

      const budget = getActivePlacesRequestBudget();
      expect(budget?.photoMedia).toBe(1);
      expect(budget?.total).toBe(1);
      expect(budget?.blocked).toBe(1);
    });
  });
});
