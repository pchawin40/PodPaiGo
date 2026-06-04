import {
  buildTypedDestinationFallback,
  destinationSearchResultToSelection,
  searchDestinations,
} from '../destinationSearch';
import type { SavedDestination } from '../trip/savedDestinations';

describe('destinationSearch', () => {
  test('Fred Meyer Monroe search returns selectable destination with mocked geocoder', async () => {
    const savedDestinations: SavedDestination[] = [
      {
        id: 'saved-1',
        label: 'Fred Meyer Monroe',
        destination: '19500 Hwy 2, Monroe, WA 98272',
        accessType: 'free',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
    ];

    const results = await searchDestinations(
      {
        query: 'Fred Meyer Monroe',
        savedDestinations,
        recentDestinations: [],
      },
      {
        fetchGeocoder: async () => [
          {
            description: 'Fred Meyer, 19500 Hwy 2, Monroe, WA 98272',
            place_id: 'fred-meyer-monroe',
          },
        ],
        fetchGooglePlaces: async () => [],
      },
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.label).toMatch(/Fred Meyer/i);

    const selection = destinationSearchResultToSelection(results[0]!);
    expect(selection.destinationLabel).toMatch(/Fred Meyer/i);
    expect(selection.destinationSource).toBe('saved');
    expect(selection.destinationConfidence).toBe('high');
  });

  test('airport query includes airport directory result', async () => {
    const results = await searchDestinations(
      {
        query: 'SEA Airport',
        savedDestinations: [],
        recentDestinations: [],
      },
      {
        fetchGeocoder: async () => [],
        fetchGooglePlaces: async () => [],
      },
    );

    expect(results.some((result) => result.source === 'airport')).toBe(true);
    expect(results.some((result) => result.airportCode === 'SEA')).toBe(true);
  });

  test('typed fallback uses low confidence', () => {
    const fallback = buildTypedDestinationFallback('Mystery place');
    const selection = destinationSearchResultToSelection(fallback);

    expect(selection.destinationSource).toBe('typed');
    expect(selection.destinationConfidence).toBe('low');
  });

  test('skips Google Places when geocoder already returned predictions', async () => {
    const fetchGooglePlaces = jest.fn(async () => [
      {
        id: 'google:extra',
        label: 'Extra Place',
        address: 'Extra Place',
        category: 'address' as const,
        source: 'google' as const,
        confidence: 'medium' as const,
      },
    ]);

    const results = await searchDestinations(
      {
        query: 'Fred Meyer Monroe',
        savedDestinations: [],
        recentDestinations: [],
        limit: 8,
      },
      {
        fetchGeocoder: async () => [
          {
            description: 'Fred Meyer, 19500 Hwy 2, Monroe, WA 98272',
            place_id: 'fred-meyer-monroe',
          },
        ],
        fetchGooglePlaces,
      },
    );

    expect(fetchGooglePlaces).not.toHaveBeenCalled();
    expect(results.some((result) => result.source === 'geocoder')).toBe(true);
  });

  test('falls back to Google Places only when geocoder is empty', async () => {
    const fetchGooglePlaces = jest.fn(async () => [
      {
        id: 'google:costco',
        label: 'Costco Wholesale',
        address: 'Costco Wholesale, Kirkland, WA',
        category: 'retail' as const,
        source: 'google' as const,
        confidence: 'medium' as const,
      },
    ]);

    const results = await searchDestinations(
      {
        query: 'costco kirkland',
        savedDestinations: [],
        recentDestinations: [],
      },
      {
        fetchGeocoder: async () => [],
        fetchGooglePlaces,
      },
    );

    expect(fetchGooglePlaces).toHaveBeenCalledTimes(1);
    expect(results.some((result) => result.source === 'google')).toBe(true);
  });
});
