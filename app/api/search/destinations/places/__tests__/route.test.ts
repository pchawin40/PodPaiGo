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
});
