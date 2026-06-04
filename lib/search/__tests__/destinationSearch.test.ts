import {
  buildTypedDestinationFallback,
  destinationSearchResultToSelection,
  isGenericLocalDestinationQuery,
  searchDestinations,
} from '../destinationSearch';
import type { SavedDestination } from '../../trip/savedDestinations';

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

  test('detects generic local destination queries without forcing airports', () => {
    expect(isGenericLocalDestinationQuery('nearest grocery store')).toBe(true);
    expect(isGenericLocalDestinationQuery('Thai food')).toBe(true);
    expect(isGenericLocalDestinationQuery('SEA Airport')).toBe(false);
  });

  test('passes origin location bias for generic local queries with coordinates', async () => {
    const fetchGooglePlaces = jest.fn(async () => [
      {
        id: 'google:safeway',
        label: 'Safeway',
        address: 'Safeway, Monroe, WA',
        category: 'retail' as const,
        source: 'google' as const,
        confidence: 'medium' as const,
        lat: 47.85,
        lng: -121.98,
      },
    ]);

    const results = await searchDestinations(
      {
        query: 'Safeway',
        savedDestinations: [],
        recentDestinations: [],
        originLat: 47.86,
        originLng: -121.99,
        originSource: 'geolocation',
      },
      {
        fetchGeocoder: async () => [
          {
            description: 'Safeway, 19651 Highway 2, Monroe, WA',
            place_id: 'safeway-geocoder',
          },
        ],
        fetchGooglePlaces,
      },
    );

    expect(fetchGooglePlaces).toHaveBeenCalledWith(
      'Safeway',
      undefined,
      {
        originLat: 47.86,
        originLng: -121.99,
        originSource: 'geolocation',
      },
    );
    expect(results.some((result) => result.source === 'google')).toBe(true);
  });

  test('generic local query without coordinates falls back safely', async () => {
    const fetchGooglePlaces = jest.fn(async () => []);

    await searchDestinations(
      {
        query: 'coffee',
        savedDestinations: [],
        recentDestinations: [],
      },
      {
        fetchGeocoder: async () => [
          {
            description: 'Coffee Shop, Seattle, WA',
            place_id: 'coffee-geocoder',
          },
        ],
        fetchGooglePlaces,
      },
    );

    expect(fetchGooglePlaces).not.toHaveBeenCalled();
  });
});
