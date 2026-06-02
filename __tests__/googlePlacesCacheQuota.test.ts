import {
  fetchGooglePlacePhotoNames,
  resetGooglePlacesCacheForTests,
} from '../lib/parking/googlePlacesCache';
import {
  cachePhotoMedia,
  clearPhotoMediaCacheForTests,
  dedupePhotoMediaFetch,
  getCachedPhotoMedia,
} from '../lib/parking/placeMediaCache';
import { attachGooglePlaceToParking } from '../lib/parking/googlePlaceMatch';
import type { ParkingOption } from '../lib/types';

describe('Google Places quota controls', () => {
  beforeEach(() => {
    resetGooglePlacesCacheForTests();
    clearPhotoMediaCacheForTests();
    jest.restoreAllMocks();
  });

  test('photo media cache avoids duplicate upstream fetches', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      body: new ArrayBuffer(8),
      contentType: 'image/jpeg',
      ts: Date.now(),
    });

    const first = await dedupePhotoMediaFetch('places/abc/photos/def', 900, fetchMock);
    const second = await dedupePhotoMediaFetch('places/abc/photos/def', 900, fetchMock);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getCachedPhotoMedia('places/abc/photos/def', 900)).not.toBeNull();
  });

  test('cached photo media is served from memory', () => {
    const body = new ArrayBuffer(4);
    cachePhotoMedia('places/test/photos/1', 900, body, 'image/jpeg');

    const cached = getCachedPhotoMedia('places/test/photos/1', 900);
    expect(cached?.contentType).toBe('image/jpeg');
  });

  test('attachGooglePlaceToParking skips API when lot already has google_place coords', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const parking: ParkingOption = {
      id: 'jiffy',
      name: 'Jiffy Airport Parking',
      type: 'off-airport',
      price: 40,
      distance: 0,
      availability: 80,
      trustStatus: 'live',
      sourceName: 'ParkWhiz',
      lastUpdated: '2026-01-01T00:00:00.000Z',
      assumptions: [],
      googlePlaceId: 'place-123',
      coordinateSource: 'google_place',
      canonicalLat: 47.439,
      canonicalLng: -122.294,
    };

    const result = await attachGooglePlaceToParking(parking, {
      type: 'one-way-departure',
      origin: 'Monroe, WA',
      destination: 'SEA',
      airportCode: 'SEA',
      destinationKind: 'airport',
    });

    expect(result.googlePlaceId).toBe('place-123');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('fetchGooglePlacePhotoNames does not call Google when DISABLE_GOOGLE_PLACES is true', async () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';
    const fetchMock = jest.spyOn(global, 'fetch');

    const names = await fetchGooglePlacePhotoNames('place-123', 4);

    expect(names).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    delete process.env.DISABLE_GOOGLE_PLACES;
  });
});
