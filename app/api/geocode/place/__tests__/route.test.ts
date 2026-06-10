import { NextRequest } from 'next/server';
import { getGoogleMapsServerApiKey } from '@/lib/env/googleMapsServerKey';
import { isGooglePlacesLiveBlocked } from '@/lib/parking/googlePlacesGuard';
import { resolveGooglePlaceCoordinates } from '@/lib/parking/googlePlacesCache';
import { GET } from '../route';

jest.mock('@/lib/env/googleMapsServerKey', () => ({
  getGoogleMapsServerApiKey: jest.fn(() => 'test-key'),
}));
jest.mock('@/lib/parking/googlePlacesGuard', () => ({
  isGooglePlacesLiveBlocked: jest.fn(() => false),
}));
jest.mock('@/lib/parking/googlePlacesCache', () => ({
  resolveGooglePlaceCoordinates: jest.fn(),
}));

const getKeyMock = getGoogleMapsServerApiKey as jest.MockedFunction<
  typeof getGoogleMapsServerApiKey
>;
const blockedMock = isGooglePlacesLiveBlocked as jest.MockedFunction<
  typeof isGooglePlacesLiveBlocked
>;
const resolveMock = resolveGooglePlaceCoordinates as jest.MockedFunction<
  typeof resolveGooglePlaceCoordinates
>;

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/geocode/place${query}`);
}

describe('/api/geocode/place', () => {
  beforeEach(() => {
    getKeyMock.mockReturnValue('test-key');
    blockedMock.mockReturnValue(false);
    resolveMock.mockReset();
  });

  test('returns resolved coordinates for a place_id', async () => {
    resolveMock.mockResolvedValue({ lat: 47.6101, lng: -122.3421 });

    const response = await GET(request('?placeId=ChIJBrightonJones'));

    await expect(response.json()).resolves.toEqual({
      status: 'OK',
      location: { lat: 47.6101, lng: -122.3421 },
    });
    expect(resolveMock).toHaveBeenCalledWith(
      'ChIJBrightonJones',
      expect.objectContaining({ reason: 'destination_place_resolve' }),
    );
  });

  test('returns NOT_FOUND when the place has no usable coordinates', async () => {
    resolveMock.mockResolvedValue(null);

    const response = await GET(request('?placeId=ChIJUnknown'));

    await expect(response.json()).resolves.toEqual({
      status: 'NOT_FOUND',
      location: null,
    });
  });

  test('rejects a missing place_id without calling the resolver', async () => {
    const response = await GET(request(''));

    await expect(response.json()).resolves.toEqual({
      status: 'MISSING_PLACE_ID',
      location: null,
    });
    expect(resolveMock).not.toHaveBeenCalled();
  });

  test('returns GOOGLE_PLACES_DISABLED when Places is kill-switched', async () => {
    blockedMock.mockReturnValue(true);

    const response = await GET(request('?placeId=ChIJBrightonJones'));

    await expect(response.json()).resolves.toEqual({
      status: 'GOOGLE_PLACES_DISABLED',
      location: null,
    });
    expect(resolveMock).not.toHaveBeenCalled();
  });

  test('returns MISSING_API_KEY when no server key is configured', async () => {
    getKeyMock.mockReturnValue(undefined as unknown as string);

    const response = await GET(request('?placeId=ChIJBrightonJones'));

    await expect(response.json()).resolves.toEqual({
      status: 'MISSING_API_KEY',
      location: null,
    });
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
