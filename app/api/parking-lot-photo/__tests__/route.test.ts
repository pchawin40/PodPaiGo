import { NextRequest } from 'next/server';
import { GET, resetParkingLotPhotoRouteCacheForTests } from '../route';
import { resolveParkingGooglePlace } from '../../../../lib/parking/googlePlacesCache';
import { runWithPlacesRequestBudget } from '../../../../lib/apiUsage/placesRequestBudget';

const mockQuery = jest.fn(async () => ({ rows: [] }));
const originalFetch = global.fetch;

jest.mock('../../../../lib/db/client', () => ({
  getDb: jest.fn(() => ({
    query: mockQuery,
  })),
}));

jest.mock('../../../../lib/parking/googlePlacesCache', () => ({
  resolveParkingGooglePlace: jest.fn(),
}));

jest.mock('../../../../lib/apiUsage/placesRequestBudget', () => ({
  runWithPlacesRequestBudget: jest.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
}));

function request(query: Record<string, string>): NextRequest {
  return new NextRequest(
    `http://localhost/api/parking-lot-photo?${new URLSearchParams(query).toString()}`,
  );
}

function enableGooglePhotos(): void {
  process.env.DISABLE_GOOGLE_PLACES = 'false';
  process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'false';
  process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '10';
  process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '5';
  process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '5';
  process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '5';
}

function jiffyPlace(overrides: Record<string, unknown> = {}) {
  return {
    cacheKey: 'SEA|name:jiffy airport',
    airportCode: 'SEA',
    lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
    normalizedLotName: 'jiffy airport',
    googlePlaceId: 'ChIJD15CGENbkFQRLnsx4OUVfrQ',
    googlePlaceName: 'Jiffy Airport Parking - SeaTac',
    photoName: 'places/ChIJD15CGENbkFQRLnsx4OUVfrQ/photos/photo-1',
    photoNames: [
      'places/ChIJD15CGENbkFQRLnsx4OUVfrQ/photos/photo-1',
      'places/ChIJD15CGENbkFQRLnsx4OUVfrQ/photos/photo-2',
    ],
    source: 'google-places',
    ...overrides,
  };
}

function residencePlace(overrides: Record<string, unknown> = {}) {
  return {
    cacheKey: 'SEA|name:residence inn seatac',
    airportCode: 'SEA',
    lotName: 'Residence Inn SeaTac Lot - Self Uncovered',
    normalizedLotName: 'residence inn seatac',
    googlePlaceId: 'places/residence-parking',
    googlePlaceName: 'Residence Inn SeaTac Lot',
    source: 'google-places',
    ...overrides,
  };
}

describe('/api/parking-lot-photo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
    resetParkingLotPhotoRouteCacheForTests();
    enableGooglePhotos();
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('Jiffy-style ParkWhiz lot name resolves to Google photo source', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValueOnce(jiffyPlace());

    const response = await GET(
      request({
        providerLotId: 'parkwhiz-33661-5881c8e9-ca0c-47de-aeee-d6dd4d594883',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.source).toBe('google_live');
    expect(json.imageUrl).toContain('/api/google-place-photo?name=');
    expect(json.imageUrl).toContain(encodeURIComponent('places/ChIJD15CGENbkFQRLnsx4OUVfrQ/photos/photo-1'));
    expect(json.requiresGoogleAttribution).toBe(true);
  });

  test('provider suffix SEA - Self Uncovered does not prevent Google match', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValueOnce(jiffyPlace());

    await GET(
      request({
        providerLotId: 'parkwhiz-session-specific-id',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
      }),
    );

    expect(resolveParkingGooglePlace).toHaveBeenCalledWith(
      expect.objectContaining({
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        airportCode: 'SEA',
        provider: 'ParkWhiz',
      }),
    );
  });

  test('existing Google photo name returns proxy URL without placeholder', async () => {
    const response = await GET(
      request({
        providerLotId: 'parkwhiz-any',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        googlePhotoName: 'places/ChIJD15CGENbkFQRLnsx4OUVfrQ/photos/photo-1',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
      }),
    );
    const json = await response.json();

    expect(json.source).toBe('google_live');
    expect(json.imageUrl).toContain('/api/google-place-photo?name=');
    expect(resolveParkingGooglePlace).not.toHaveBeenCalled();
  });

  test('Google match failure returns placeholder with reason', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValueOnce(null);

    const response = await GET(
      request({
        providerLotId: 'parkwhiz-no-match',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Unknown Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
      }),
    );
    const json = await response.json();

    expect(json.source).toBe('placeholder');
    expect(json.imageUrl).toContain('/assets/parking/');
    expect(json.fallbackReason).toBe('google_place_match_unavailable');
  });

  test('server dedupes concurrent same-key live lookups', async () => {
    let resolvePlace: (value: unknown) => void = () => undefined;
    (resolveParkingGooglePlace as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolvePlace = resolve;
      }),
    );

    const first = GET(
      request({
        providerLotId: 'parkwhiz-session-a',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'smart-pick',
      }),
    );
    const second = GET(
      request({
        providerLotId: 'parkwhiz-session-b',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'smart-pick',
      }),
    );

    resolvePlace(jiffyPlace());

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    const firstJson = await firstResponse.json();
    const secondJson = await secondResponse.json();

    expect(resolveParkingGooglePlace).toHaveBeenCalledTimes(1);
    expect(firstJson.source).toBe('google_live');
    expect(secondJson.source).toBe('google_live');
  });

  test('negative no-photo result is cached and prevents repeated Google calls', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValue(
      jiffyPlace({ photoName: undefined, photoNames: undefined }),
    );

    const first = await GET(
      request({
        providerLotId: 'parkwhiz-no-photo-a',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'No Photo Parking',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'smart-pick',
      }),
    );
    const second = await GET(
      request({
        providerLotId: 'parkwhiz-no-photo-b',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'No Photo Parking',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'smart-pick',
      }),
    );
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(resolveParkingGooglePlace).toHaveBeenCalledTimes(2);
    expect(firstJson.source).toBe('placeholder');
    expect(firstJson.fallbackReason).toBe('hotel_business_no_photo');
    expect(secondJson.source).toBe('placeholder');
    expect(secondJson.fallbackReason).toBe('hotel_business_no_photo');
  });

  test('hotel lot with parking Google match no photo falls back to ParkWhiz provider photo', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValueOnce(
      residencePlace({ photoName: undefined, photoNames: undefined }),
    );
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        id: '52086',
        name: 'Residence Inn SeaTac Lot',
        photos: [
          {
            position: 1,
            sizes: {
              gallery: {
                URL: 'https://d2uqqhmijd5j2z.cloudfront.net/files/760385/gallery/Residence_Inn_Sea-Tac_1.png',
              },
            },
          },
        ],
      }),
    })) as jest.Mock;

    const response = await GET(
      request({
        providerLotId: 'parkwhiz-52086-session-option',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Residence Inn SeaTac Lot - Self Uncovered',
        lotAddress: '19608 International Blvd, SeaTac, WA 98188',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'visible',
      }),
    );
    const json = await response.json();

    expect(resolveParkingGooglePlace).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.parkwhiz.com/v4/locations/52086',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(json.source).toBe('provider');
    expect(json.imageUrl).toContain('Residence_Inn_Sea-Tac_1.png');
    expect(json.fallbackReason ?? null).toBeNull();
  });

  test('hotel lot with no provider image falls back to hotel business Google photo', async () => {
    (resolveParkingGooglePlace as jest.Mock)
      .mockResolvedValueOnce(residencePlace({ photoName: undefined, photoNames: undefined }))
      .mockResolvedValueOnce(
        residencePlace({
          cacheKey: 'SEA|name:residence inn seatac|business',
          lotName: 'Residence Inn SeaTac',
          googlePlaceId: 'places/residence-business',
          googlePlaceName: 'Residence Inn by Marriott Seattle Sea-Tac Airport',
          photoName: 'places/residence-business/photos/primary',
          photoNames: ['places/residence-business/photos/primary'],
        }),
      );

    const response = await GET(
      request({
        providerLotId: 'parkwhiz-no-location-id',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Residence Inn SeaTac Lot - Self Uncovered',
        lotAddress: '19608 International Blvd, SeaTac, WA 98188',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'visible',
      }),
    );
    const json = await response.json();

    expect(resolveParkingGooglePlace).toHaveBeenCalledTimes(2);
    expect(resolveParkingGooglePlace).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        lotName: 'Residence Inn SeaTac',
        lotAddress: '19608 International Blvd, SeaTac, WA 98188',
      }),
    );
    expect(json.source).toBe('google_business');
    expect(json.imageUrl).toContain('/api/google-place-photo?name=');
    expect(json.imageUrl).toContain(encodeURIComponent('places/residence-business/photos/primary'));
  });

  test('secondary hotel business no-photo result is cached', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValue(
      residencePlace({ photoName: undefined, photoNames: undefined }),
    );

    const first = await GET(
      request({
        providerLotId: 'parkwhiz-no-location-a',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Residence Inn SeaTac Lot - Self Uncovered',
        lotAddress: '19608 International Blvd, SeaTac, WA 98188',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'visible',
      }),
    );
    const second = await GET(
      request({
        providerLotId: 'parkwhiz-no-location-b',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Residence Inn SeaTac Lot - Self Uncovered',
        lotAddress: '19608 International Blvd, SeaTac, WA 98188',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'visible',
      }),
    );
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(resolveParkingGooglePlace).toHaveBeenCalledTimes(2);
    expect(firstJson.source).toBe('placeholder');
    expect(firstJson.fallbackReason).toBe('hotel_business_no_photo');
    expect(secondJson.source).toBe('placeholder');
    expect(secondJson.fallbackReason).toBe('hotel_business_no_photo');
  });

  test('low-priority request skips live Google lookup', async () => {
    const response = await GET(
      request({
        providerLotId: 'parkwhiz-background',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'background',
      }),
    );
    const json = await response.json();

    expect(resolveParkingGooglePlace).not.toHaveBeenCalled();
    expect(json.source).toBe('placeholder');
    expect(json.fallbackReason).toBe('live_lookup_skipped_priority');
  });

  test('smart-pick priority allows live Google lookup', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValueOnce(jiffyPlace());

    const response = await GET(
      request({
        providerLotId: 'parkwhiz-smart',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'smart-pick',
      }),
    );
    const json = await response.json();

    expect(resolveParkingGooglePlace).toHaveBeenCalledTimes(1);
    expect(json.source).toBe('google_live');
  });

  test('visible priority allows live Google lookup', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValueOnce(jiffyPlace());

    const response = await GET(
      request({
        providerLotId: 'parkwhiz-visible',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'visible',
      }),
    );
    const json = await response.json();

    expect(resolveParkingGooglePlace).toHaveBeenCalledTimes(1);
    expect(json.source).toBe('google_live');
  });

  test('negative visible no-photo result is cached and prevents repeated Google calls', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValue(
      jiffyPlace({ photoName: undefined, photoNames: undefined }),
    );

    const first = await GET(
      request({
        providerLotId: 'parkwhiz-visible-no-photo-a',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Visible No Photo Parking',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'visible',
      }),
    );
    const second = await GET(
      request({
        providerLotId: 'parkwhiz-visible-no-photo-b',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Visible No Photo Parking',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'visible',
      }),
    );
    const firstJson = await first.json();
    const secondJson = await second.json();

    expect(resolveParkingGooglePlace).toHaveBeenCalledTimes(2);
    expect(firstJson.source).toBe('placeholder');
    expect(firstJson.fallbackReason).toBe('hotel_business_no_photo');
    expect(secondJson.source).toBe('placeholder');
    expect(secondJson.fallbackReason).toBe('hotel_business_no_photo');
  });

  test('provider image wins without Google call', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'photo-provider',
          parking_lot_id: null,
          provider: 'ParkWhiz',
          provider_lot_id: 'parkwhiz-provider-photo',
          google_place_id: null,
          airport_code: 'SEA',
          image_url: 'https://provider.example.com/jiffy.jpg',
          storage_path: null,
          source: 'provider',
          attribution: 'Provider supplied',
          attribution_url: null,
          license_note: null,
          is_primary: true,
        },
      ],
    });

    const response = await GET(
      request({
        providerLotId: 'parkwhiz-provider-photo',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
        priority: 'smart-pick',
      }),
    );
    const json = await response.json();

    expect(resolveParkingGooglePlace).not.toHaveBeenCalled();
    expect(json.source).toBe('provider');
    expect(json.imageUrl).toBe('https://provider.example.com/jiffy.jpg');
  });

  test('changing providerLotId does not change stable Google match key', async () => {
    (resolveParkingGooglePlace as jest.Mock).mockResolvedValue(jiffyPlace());

    await GET(
      request({
        providerLotId: 'parkwhiz-session-a',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
      }),
    );
    await GET(
      request({
        providerLotId: 'parkwhiz-session-b',
        provider: 'ParkWhiz',
        airportCode: 'SEA',
        lotName: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
        lotType: 'off-airport',
        tripContext: 'airport_trip',
      }),
    );

    expect(resolveParkingGooglePlace).toHaveBeenCalledTimes(1);
    expect(resolveParkingGooglePlace).toHaveBeenCalledWith(
      expect.objectContaining({ parkingLotId: null }),
    );
    const keys = (runWithPlacesRequestBudget as jest.Mock).mock.calls.map(([key]) => key);
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toContain('parkwhiz-session-a');
    expect(keys[0]).not.toContain('parkwhiz-session-b');
  });
});
