import { NextRequest } from 'next/server';
import { clearDestinationSearchCacheForTests } from '@/lib/apiUsage/destinationSearchCache';
import { resetPlacesRequestBudgetForTests } from '@/lib/apiUsage/placesRequestBudget';
import { GET } from '../route';

describe('/api/geocode/autocomplete', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    clearDestinationSearchCacheForTests();
    resetPlacesRequestBudgetForTests();
    process.env = { ...originalEnv };
    delete process.env.DISABLE_GOOGLE_PLACES;
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
    process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '2';
    process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '2';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('does not run Text Search fallback when Autocomplete returns useful predictions', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        predictions: [
          {
            description: 'Pike Place Market, Seattle, WA',
            place_id: 'pike-place',
          },
        ],
      }),
    } as Response);

    const response = await GET(
      new NextRequest('http://localhost/api/geocode/autocomplete?input=Pike%20Place'),
    );

    await expect(response.json()).resolves.toMatchObject({
      status: 'OK',
      source: 'places-autocomplete',
      predictions: [{ place_id: 'pike-place' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/autocomplete/json');

    fetchMock.mockRestore();
  });

  test('runs Text Search fallback only when Autocomplete has no useful predictions', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/autocomplete/json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ZERO_RESULTS',
            predictions: [],
          }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 'OK',
          results: [
            {
              name: 'Pike Place Market',
              formatted_address: '85 Pike St, Seattle, WA',
              place_id: 'pike-place-text',
            },
          ],
        }),
      } as Response;
    });

    const response = await GET(
      new NextRequest('http://localhost/api/geocode/autocomplete?input=Pike%20Place'),
    );

    await expect(response.json()).resolves.toMatchObject({
      status: 'OK',
      source: 'places-text-search',
      predictions: [{ place_id: 'pike-place-text' }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/autocomplete/json');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/textsearch/json');

    fetchMock.mockRestore();
  });
});
