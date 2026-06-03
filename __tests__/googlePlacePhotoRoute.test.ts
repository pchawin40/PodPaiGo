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

  test('photos enabled with cap makes one PhotoMedia upstream call per request', async () => {
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'false';
    process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '1';

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: (name: string) => (name === 'content-type' ? 'image/jpeg' : null) },
      body: new ReadableStream(),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as Response);

    const photoName = 'places/ChIJ_test/photos/abc123';
    const url = `http://localhost/api/google-place-photo?name=${encodeURIComponent(photoName)}&maxWidthPx=900`;

    const res = await GET(new NextRequest(url));

    expect(res.status).toBe(200);

    const mediaCalls = fetchMock.mock.calls.filter(([u]) =>
      String(u).includes('places.googleapis.com') && String(u).includes('/media'),
    );
    expect(mediaCalls).toHaveLength(1);

    fetchMock.mockRestore();
  });
});
