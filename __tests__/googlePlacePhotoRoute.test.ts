/** @jest-environment node */

import { NextRequest } from 'next/server';
import { GET } from '../app/api/google-place-photo/route';

jest.mock('@/lib/env/googleMapsServerKey', () => ({
  getGoogleMapsServerApiKey: jest.fn(() => 'test-key'),
}));

jest.mock('@/lib/parking/placeMediaCache', () => ({
  getCachedPhotoMedia: jest.fn(() => null),
  cachePhotoMedia: jest.fn(),
  dedupePhotoMediaFetch: jest.fn(async (_name: string, _width: number, fetcher: () => Promise<unknown>) =>
    fetcher(),
  ),
}));

describe('/api/google-place-photo safe mode', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.DISABLE_GOOGLE_PLACE_PHOTOS;
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST;
  });

  test('returns placeholder/no image when photos disabled', async () => {
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'true';
    process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '0';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '0';

    const fetchMock = jest.spyOn(global, 'fetch');

    const req = new NextRequest(
      'http://localhost/api/google-place-photo?name=places/ChIJ_test/photos/abc123&maxWidthPx=900',
    );

    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('unavailable');
    expect(json.imageUrl).toBeNull();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('places.googleapis.com')),
    ).toHaveLength(0);
  });
});
