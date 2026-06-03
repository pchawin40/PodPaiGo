import {
  buildGoogleLiveParkingPhoto,
  buildPlaceholderParkingPhoto,
  getBestParkingPhoto,
  isGooglePhotoProxyUrl,
  lookupParkingLotPhotoFromDb,
} from '../parkingLotPhotos';
import { savePlacePhotoCache } from '../placePhotoCache';

jest.mock('../../db/client', () => ({
  getDb: jest.fn(),
}));

const { getDb } = jest.requireMock('../../db/client') as {
  getDb: jest.Mock;
};

const queryMock = jest.fn();

describe('getBestParkingPhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryMock.mockReset();
    getDb.mockReturnValue({ query: queryMock });
    delete process.env.DISABLE_GOOGLE_PLACE_PHOTOS;
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST;
  });

  test('first-party photo wins over Google photo', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'photo-1',
          parking_lot_id: '42',
          provider: 'inventory',
          provider_lot_id: '42',
          google_place_id: 'place-abc',
          airport_code: 'SEA',
          image_url: 'https://cdn.example.com/jiffy-first-party.jpg',
          storage_path: null,
          source: 'first_party',
          attribution: 'PodPaiGo',
          attribution_url: null,
          license_note: null,
          is_primary: true,
        },
      ],
    });

    const selection = await getBestParkingPhoto({
      parkingLotId: '42',
      provider: 'inventory',
      providerLotId: '42',
      googlePlaceId: 'place-abc',
      googlePhotoName: 'places/ChIJ_test/photos/abc123',
      airportCode: 'SEA',
      lotName: 'Jiffy Airport Parking',
    });

    expect(selection.source).toBe('first_party');
    expect(selection.imageUrl).toBe('https://cdn.example.com/jiffy-first-party.jpg');
    expect(selection.imageUrl).not.toContain('/api/google-place-photo');
  });

  test('provider photo wins over placeholder', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'photo-2',
          parking_lot_id: '99',
          provider: 'inventory',
          provider_lot_id: '99',
          google_place_id: null,
          airport_code: 'SEA',
          image_url: 'https://provider.example.com/lot.jpg',
          storage_path: null,
          source: 'provider',
          attribution: 'Provider supplied',
          attribution_url: 'https://provider.example.com/license',
          license_note: null,
          is_primary: false,
        },
      ],
    });

    const selection = await getBestParkingPhoto({
      parkingLotId: '99',
      provider: 'inventory',
      providerLotId: '99',
      airportCode: 'SEA',
      lotName: 'Inventory Lot',
    });

    expect(selection.source).toBe('provider');
    expect(selection.imageUrl).toContain('provider.example.com');
    expect(selection.source).not.toBe('placeholder');
  });

  test('Google photo proxy only used when explicitly enabled', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    process.env.DISABLE_GOOGLE_PLACES = 'false';
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'false';
    process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '1';

    const enabled = buildGoogleLiveParkingPhoto('places/ChIJ_test/photos/abc123');
    expect(enabled?.source).toBe('google_live');
    expect(enabled?.imageUrl).toContain('/api/google-place-photo');
    expect(enabled?.requiresGoogleAttribution).toBe(true);

    delete process.env.DISABLE_GOOGLE_PLACE_PHOTOS;
    expect(buildGoogleLiveParkingPhoto('places/ChIJ_test/photos/abc123')).toBeNull();

    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'true';
    const disabled = buildGoogleLiveParkingPhoto('places/ChIJ_test/photos/abc123');
    expect(disabled).toBeNull();

    const selection = await getBestParkingPhoto({
      googlePhotoName: 'places/ChIJ_test/photos/abc123',
      lotName: 'Shuttle Lot',
    });

    expect(selection.source).toBe('placeholder');
    expect(selection.imageUrl).toContain('/assets/parking/');
  });

  test('lookup rejects stored Google proxy URLs', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'photo-bad',
          parking_lot_id: '1',
          provider: null,
          provider_lot_id: null,
          google_place_id: null,
          airport_code: 'SEA',
          image_url: '/api/google-place-photo?name=places%2Fbad%2Fphotos%2F1',
          storage_path: null,
          source: 'provider',
          attribution: null,
          attribution_url: null,
          license_note: null,
          is_primary: false,
        },
      ],
    });

    const selection = await lookupParkingLotPhotoFromDb({ parkingLotId: '1' });
    expect(selection).toBeNull();
  });
});

describe('placePhotoCache compliance', () => {
  beforeEach(() => {
    queryMock.mockReset();
    getDb.mockReturnValue({ query: queryMock });
  });

  test('does not persist Google proxy URLs', async () => {
    queryMock.mockResolvedValue({ rows: [] });

    await savePlacePhotoCache({
      placeId: 'place-123',
      photos: ['/api/google-place-photo?name=places%2Fabc%2Fphotos%2F1'],
      attributions: [],
    });

    expect(queryMock).not.toHaveBeenCalled();
    expect(isGooglePhotoProxyUrl('/api/google-place-photo?name=test')).toBe(true);
  });
});

describe('placeholder helper', () => {
  test('builds gradient-card fallback asset', () => {
    const selection = buildPlaceholderParkingPhoto({ lotName: 'Garage Lot' }, 'airport_trip');
    expect(selection.source).toBe('placeholder');
    expect(selection.imageUrl).toMatch(/\/assets\/parking\/.+\.svg$/);
  });
});
