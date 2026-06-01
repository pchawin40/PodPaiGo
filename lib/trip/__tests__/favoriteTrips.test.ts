import {
  buildFavoriteTripName,
  deleteFavoriteTrip,
  favoriteTripToSearchParams,
  intentFromSearchParams,
  intentToTripType,
  isFavoriteTripIntent,
  readFavoriteTrips,
  shortOriginLabel,
  upsertFavoriteTrip,
  writeFavoriteTrips,
  FAVORITE_TRIPS_STORAGE_KEY,
  MAX_FAVORITE_TRIPS,
  type SavedFavoriteTrip,
} from '../favoriteTrips';

describe('favoriteTrips', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
  });

  const mockStorage: Storage = {
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: (key) => storage.get(key) ?? null,
    key: (index) => Array.from(storage.keys())[index] ?? null,
    removeItem: (key) => {
      storage.delete(key);
    },
    setItem: (key, value) => {
      storage.set(key, value);
    },
  };

  test('buildFavoriteTripName formats airport and general trips', () => {
    expect(
      buildFavoriteTripName({
        origin: '19944 Colleens Ln SE, Monroe, WA 98272',
        airportCode: 'SEA',
        intent: 'flying-out',
      }),
    ).toBe('Monroe → SEA');

    expect(
      buildFavoriteTripName({
        origin: 'Home',
        airportCode: 'SEA',
        intent: 'flying-out',
      }),
    ).toBe('Home → SEA');

    expect(
      buildFavoriteTripName({
        origin: 'Capitol Hill, Seattle, WA',
        airportCode: 'SEA',
        intent: 'general-trip',
        destination: 'Pioneer Square, Seattle, WA',
      }),
    ).toBe('Capitol → Pioneer');
  });

  test('shortOriginLabel uses city for street addresses', () => {
    expect(shortOriginLabel('123 Main St, Monroe, WA')).toBe('Monroe');
    expect(shortOriginLabel('Home')).toBe('Home');
  });

  test('upsertFavoriteTrip stores and updates matching routes', () => {
    const first = upsertFavoriteTrip(
      {
        origin: 'Monroe, WA',
        airportCode: 'SEA',
        intent: 'flying-out',
        checkingBags: false,
        cabin: 'economy',
        transportAvailability: 'all',
        preferredSort: 'easiest',
      },
      mockStorage,
    );

    expect(first).not.toBeNull();
    expect(readFavoriteTrips(mockStorage)).toHaveLength(1);
    expect(first!.name).toBe('Monroe → SEA');

    const updated = upsertFavoriteTrip(
      {
        origin: 'Monroe, WA',
        airportCode: 'SEA',
        intent: 'flying-out',
        checkingBags: true,
        cabin: 'premium',
        transportAvailability: 'rideshare',
        preferredSort: 'cheapest',
      },
      mockStorage,
    );

    expect(updated?.id).toBe(first!.id);
    expect(readFavoriteTrips(mockStorage)).toHaveLength(1);
    expect(updated?.checkingBags).toBe(true);
    expect(updated?.preferredSort).toBe('cheapest');
  });

  test('deleteFavoriteTrip removes a saved trip', () => {
    const saved = upsertFavoriteTrip(
      {
        origin: 'Monroe, WA',
        airportCode: 'SEA',
        intent: 'flying-out',
        checkingBags: false,
        cabin: 'economy',
        transportAvailability: 'all',
        preferredSort: 'easiest',
      },
      mockStorage,
    );

    expect(saved).not.toBeNull();
    deleteFavoriteTrip(saved!.id, mockStorage);
    expect(readFavoriteTrips(mockStorage)).toHaveLength(0);
  });

  test('favoriteTripToSearchParams includes saved preferences and sort', () => {
    const params = favoriteTripToSearchParams({
      id: '1',
      name: 'Monroe → SEA',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      origin: 'Monroe, WA',
      airportCode: 'SEA',
      intent: 'flying-out',
      checkingBags: true,
      cabin: 'premium',
      transportAvailability: 'rideshare',
      preferredSort: 'cheapest',
    });

    expect(params.get('origin')).toBe('Monroe, WA');
    expect(params.get('intent')).toBe('flying-out');
    expect(params.get('type')).toBe('one-way-departure');
    expect(params.get('airportCode')).toBe('SEA');
    expect(params.get('transport')).toBe('rideshare');
    expect(params.get('sort')).toBe('cheapest');
    expect(params.get('bags')).toBe('yes');
    expect(params.get('cabin')).toBe('premium');
    expect(params.get('departureDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.get('parkingCheckOutDate')).toBeTruthy();
  });

  test('writeFavoriteTrips respects max saved trips', () => {
    const trips: SavedFavoriteTrip[] = Array.from({ length: 12 }).map((_, index) => ({
      id: `trip-${index}`,
      name: `Trip ${index}`,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      origin: `Origin ${index}`,
      airportCode: 'SEA',
      intent: 'flying-out',
      checkingBags: false,
      cabin: 'economy',
      transportAvailability: 'all',
      preferredSort: 'easiest',
    }));

    writeFavoriteTrips(trips, mockStorage);
    expect(readFavoriteTrips(mockStorage)).toHaveLength(MAX_FAVORITE_TRIPS);
    expect(mockStorage.getItem(FAVORITE_TRIPS_STORAGE_KEY)).toContain('trip-0');
  });

  test('intent helpers map trip intents', () => {
    expect(intentToTripType('parking-trip')).toBe('one-way-departure');
    expect(intentToTripType('picking-up')).toBe('dropoff-pickup');
    expect(intentFromSearchParams('parking-trip')).toBe('parking-trip');
    expect(isFavoriteTripIntent('flying-out')).toBe(true);
    expect(isFavoriteTripIntent('hotels')).toBe(false);
  });
});
