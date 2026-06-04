import { NextRequest } from 'next/server';

describe('/api/search/destinations/places', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
    delete process.env.DISABLE_GOOGLE_PLACES;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
    process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '1';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '1';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.dontMock('@/lib/apiUsage/placesRequestBudget');
  });

  test('wraps the live Google Places call with a request budget and caches normalized input', async () => {
    const budgetModule = jest.requireActual('@/lib/apiUsage/placesRequestBudget') as typeof import('@/lib/apiUsage/placesRequestBudget');
    const runWithPlacesRequestBudget = jest.fn(budgetModule.runWithPlacesRequestBudget);

    jest.doMock('@/lib/apiUsage/placesRequestBudget', () => ({
      ...budgetModule,
      runWithPlacesRequestBudget,
    }));

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'place-1',
            displayName: { text: 'Pike Place Market' },
            formattedAddress: '85 Pike St, Seattle, WA',
            location: { latitude: 47.6089, longitude: -122.3401 },
          },
        ],
      }),
    } as Response);

    const { GET } = await import('../route');

    const first = await GET(
      new NextRequest('http://localhost/api/search/destinations/places?input=Pike%20Place'),
    );
    const second = await GET(
      new NextRequest('http://localhost/api/search/destinations/places?input=%20pike%20%20place%20'),
    );

    await expect(first.json()).resolves.toMatchObject({
      status: 'OK',
      results: [
        {
          id: 'google:place-1',
          label: 'Pike Place Market',
          source: 'google',
        },
      ],
    });
    await expect(second.json()).resolves.toMatchObject({ status: 'OK' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runWithPlacesRequestBudget).toHaveBeenCalledTimes(1);
    expect(runWithPlacesRequestBudget).toHaveBeenCalledWith(
      'destination-search:Pike Place',
      expect.any(Function),
      { route: '/api/search/destinations/places' },
    );

    fetchMock.mockRestore();
  });

  test('uses rounded origin coordinates in cache and applies location bias for generic local queries', async () => {
    const budgetModule = jest.requireActual('@/lib/apiUsage/placesRequestBudget') as typeof import('@/lib/apiUsage/placesRequestBudget');
    const runWithPlacesRequestBudget = jest.fn(budgetModule.runWithPlacesRequestBudget);

    jest.doMock('@/lib/apiUsage/placesRequestBudget', () => ({
      ...budgetModule,
      runWithPlacesRequestBudget,
    }));

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'safeway-1',
            displayName: { text: 'Safeway' },
            formattedAddress: '19651 US-2, Monroe, WA',
            location: { latitude: 47.862, longitude: -121.987 },
          },
        ],
      }),
    } as Response);

    const { GET } = await import('../route');

    const first = await GET(
      new NextRequest(
        'http://localhost/api/search/destinations/places?input=Safeway&originLat=47.8624&originLng=-121.9876',
      ),
    );
    const second = await GET(
      new NextRequest(
        'http://localhost/api/search/destinations/places?input=safeway&originLat=47.86249&originLng=-121.98751',
      ),
    );

    await expect(first.json()).resolves.toMatchObject({ status: 'OK' });
    await expect(second.json()).resolves.toMatchObject({ status: 'OK' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body || '{}')) as {
      locationBias?: {
        circle?: {
          center?: { latitude?: number; longitude?: number };
          radius?: number;
        };
      };
    };
    expect(fetchBody.locationBias?.circle?.center).toEqual({
      latitude: 47.8624,
      longitude: -121.9876,
    });
    expect(fetchBody.locationBias?.circle?.radius).toBe(20000);
    expect(runWithPlacesRequestBudget).toHaveBeenCalledWith(
      'destination-search:Safeway|origin:47.862,-121.988',
      expect.any(Function),
      { route: '/api/search/destinations/places' },
    );

    fetchMock.mockRestore();
  });
});
