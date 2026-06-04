import {
  clearDestinationSearchCacheForTests,
  dedupeDestinationAutocompleteRequest,
  getCachedDestinationAutocomplete,
} from '../destinationSearchCache';

describe('destinationSearchCache', () => {
  beforeEach(() => {
    clearDestinationSearchCacheForTests();
  });

  test('caches normalized autocomplete responses and dedupes in-flight requests', async () => {
    const fetcher = jest.fn(async () => ({
      predictions: [{ description: 'Costco Wholesale', place_id: 'costco' }],
      status: 'OK',
      source: 'places-autocomplete',
    }));

    const first = await dedupeDestinationAutocompleteRequest('Costco', fetcher);
    const second = await dedupeDestinationAutocompleteRequest(' costco ', fetcher);
    const cached = getCachedDestinationAutocomplete('COSTCO');

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(cached).toEqual(first);
  });

  test('does not cache autocomplete error responses', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({
        predictions: [],
        status: 'GOOGLE_FAILED',
        error: 'Google address autocomplete failed',
      })
      .mockResolvedValueOnce({
        predictions: [{ description: 'Recovered Place', place_id: 'recovered' }],
        status: 'OK',
        source: 'places-autocomplete',
      });

    await dedupeDestinationAutocompleteRequest('broken query', fetcher);
    const retry = await dedupeDestinationAutocompleteRequest('broken query', fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(retry.predictions).toHaveLength(1);
  });
});
