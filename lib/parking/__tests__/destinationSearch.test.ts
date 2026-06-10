import {
  getDestinationParkingOptions,
  getDestinationParkingOptionsWithMetadata,
  resetDestinationParkingSearchCacheForTests,
} from '../../providers/parking/providers/googlePlaces/destinationSearch';
import { resetPlacesRequestBudgetForTests } from '../../apiUsage/placesRequestBudget';
import { clearGeocodeCacheForTests } from '../../apiUsage/geocodeCache';
import { canMakeLiveApiCall } from '../../apiUsage/guard';
import { getParkingLotsNearPoint } from '../inventory';
import { sortParkingOptionsForMode } from '../sortParkingOptions';
import { getParkWhizDestinationParkingOptions } from '../../providers/parkWhiz';
import type { ParkingOption } from '../../types';

jest.mock('../../env/googleMapsServerKey', () => ({
  getGoogleMapsServerApiKey: jest.fn(() => 'test-key'),
}));

jest.mock('../../providers/parkWhiz', () => {
  const actual = jest.requireActual('../../providers/parkWhiz');
  return {
    ...actual,
    getParkWhizDestinationParkingOptions: jest.fn(async () => []),
  };
});

jest.mock('../inventory', () => ({
  getParkingLotsNearPoint: jest.fn(async () => []),
}));

jest.mock('../../providers/parking/providers/communityFree/provider', () => ({
  getCommunityFreeParkingOptions: jest.fn(async () => []),
}));

jest.mock('../../apiUsage/guard', () => ({
  ...jest.requireActual('../../apiUsage/guard'),
  canMakeLiveApiCall: jest.fn(async () => ({ allowed: true })),
  recordApiUsage: jest.fn(async () => undefined),
}));

// Lumen Field, Seattle.
const VENUE_LAT = 47.5952;
const VENUE_LNG = -122.3316;

type MockPlace = {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
};

function mockPlace(
  id: string,
  name: string,
  lat: number,
  lng: number,
): MockPlace {
  return {
    id,
    displayName: { text: name },
    formattedAddress: `${name} address`,
    location: { latitude: lat, longitude: lng },
    rating: 4.3,
    userRatingCount: 60,
  };
}

/** Offset a coordinate roughly `miles` north of the venue. */
function milesNorth(miles: number): { lat: number; lng: number } {
  return { lat: VENUE_LAT + miles / 69, lng: VENUE_LNG };
}

function parkWhizQuote(
  id: string,
  name: string,
  lat: number,
  lng: number,
  price = 12,
) {
  return {
    location_id: id,
    distance: { straight_line: { feet: 0 } },
    purchase_options: [
      {
        id: `option-${id}`,
        name: 'Self Park',
        price: { USD: String(price) },
        space_availability: { status: 'available' },
        _links: { 'site:purchase': { href: `/book/${id}` } },
      },
    ],
    _embedded: {
      'pw:location': {
        id,
        name,
        address1: `${id} Test Ave`,
        city: 'Seattle',
        state: 'WA',
        postal_code: '98134',
        entrances: [{ coordinates: [lng, lat] }],
      },
    },
  };
}

function applyEnv(): void {
  delete process.env.DISABLE_GOOGLE_PLACES;
  delete process.env.DISABLE_GOOGLE_PARKING_DISCOVERY;
  delete process.env.DISABLE_GEOCODING;
  delete process.env.DESTINATION_PARKING_SEARCH_RADIUS_METERS;
  process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
  process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '5';
  process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '5';
  process.env.DESTINATION_PARKING_MIN_RESULTS_BEFORE_STOP = '5';
  // Keep the geocoding budget check off the database in tests.
  process.env.DISABLE_PARKING_DB_CACHE = 'true';
}

/**
 * Mock both the Places searchText endpoint and the Geocoding endpoint. Passing
 * `geocode: null` simulates a destination that cannot be resolved (ZERO_RESULTS).
 */
function mockSearchTextAndGeocode(
  places: MockPlace[],
  geocode: { lat: number; lng: number } | null,
): { fetchMock: jest.SpyInstance; queries: string[]; geocodeCalls: string[] } {
  const queries: string[] = [];
  const geocodeCalls: string[] = [];
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/maps/api/geocode/json')) {
      geocodeCalls.push(url);
      return {
        ok: true,
        json: async () =>
          geocode
            ? {
                status: 'OK',
                results: [{ geometry: { location: { lat: geocode.lat, lng: geocode.lng } } }],
              }
            : { status: 'ZERO_RESULTS', results: [] },
      } as Response;
    }
    if (url.includes('places:searchText')) {
      const body = JSON.parse(String(init?.body));
      queries.push(body.textQuery);
      return { ok: true, json: async () => ({ places }) } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  });
  return { fetchMock, queries, geocodeCalls };
}

function mockSearchText(places: MockPlace[]): {
  fetchMock: jest.SpyInstance;
  queries: string[];
} {
  const queries: string[] = [];
  const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.includes('places:searchText')) {
      return { ok: false, json: async () => ({}) } as Response;
    }
    const body = JSON.parse(String(init?.body));
    queries.push(body.textQuery);
    return { ok: true, json: async () => ({ places }) } as Response;
  });
  return { fetchMock, queries };
}

describe('destination-specific parking discovery', () => {
  beforeEach(() => {
    resetDestinationParkingSearchCacheForTests();
    resetPlacesRequestBudgetForTests();
    clearGeocodeCacheForTests();
    jest.restoreAllMocks();
    (canMakeLiveApiCall as jest.Mock).mockResolvedValue({ allowed: true });
    (getParkWhizDestinationParkingOptions as jest.Mock).mockResolvedValue([]);
    (getParkingLotsNearPoint as jest.Mock).mockResolvedValue([]);
    applyEnv();
  });

  // Test 1 + 2: event/stadium destination uses venue-anchored queries, never a
  // broad "downtown Seattle parking" search.
  test('stadium/event destination searches near the venue, not the broad city', async () => {
    const { queries } = mockSearchText([
      mockPlace('near', 'Stadium Lot Parking', VENUE_LAT, VENUE_LNG),
    ]);

    await getDestinationParkingOptions({
      origin: 'Bellevue, WA',
      destination: 'Lumen Field, 800 Occidental Ave S, Seattle, WA 98134',
      destinationName: 'Lumen Field',
      destinationKind: 'stadium',
      dateTime: '2026-06-01T18:00:00.000Z',
      parkingDurationMinutes: 240,
      destinationLat: VENUE_LAT,
      destinationLng: VENUE_LNG,
    });

    expect(queries[0]).toBe('event parking near Lumen Field');
    expect(queries).toContain('parking near Lumen Field');
    // Never collapses to a broad downtown/city search.
    expect(queries.some((q) => /parking near (downtown )?seattle\b/i.test(q))).toBe(false);
    expect(queries.every((q) => /lumen field/i.test(q))).toBe(true);
  });

  test('generic stadium name (no kind) is still detected and venue-anchored', async () => {
    const { queries } = mockSearchText([
      mockPlace('near', 'Arena Garage Parking', VENUE_LAT, VENUE_LNG),
    ]);

    await getDestinationParkingOptions({
      origin: 'Tacoma, WA',
      destination: 'Tacoma Dome Stadium',
      dateTime: '2026-06-01T18:00:00.000Z',
      destinationLat: VENUE_LAT,
      destinationLng: VENUE_LNG,
    });

    expect(queries[0]).toBe('event parking near Tacoma Dome Stadium');
  });

  // Test 3: office destination uses the exact destinationName/address.
  test('office destination anchors on the exact destination name', async () => {
    const { queries } = mockSearchText([
      mockPlace('near', 'Office Tower Parking', VENUE_LAT, VENUE_LNG),
    ]);

    await getDestinationParkingOptions({
      origin: 'Renton, WA',
      destination: 'F5 Tower, 801 5th Ave, Seattle, WA',
      destinationName: 'F5 Tower',
      destinationKind: 'office',
      dateTime: '2026-06-01T09:00:00.000Z',
      destinationLat: VENUE_LAT,
      destinationLng: VENUE_LNG,
    });

    expect(queries[0]).toBe('parking near F5 Tower');
    expect(queries).toContain('parking near F5 Tower, 801 5th Ave, Seattle, WA');
    expect(queries.some((q) => q.startsWith('event parking'))).toBe(false);
  });

  // Test 4: restaurant/retail destination still uses the exact destination.
  test('restaurant destination uses the exact destination, no event phrasing', async () => {
    const { queries } = mockSearchText([
      mockPlace('near', 'Bistro Parking Lot', VENUE_LAT, VENUE_LNG),
    ]);

    await getDestinationParkingOptions({
      origin: 'Kirkland, WA',
      destination: 'Canlis Restaurant, 2576 Aurora Ave N, Seattle, WA',
      destinationName: 'Canlis Restaurant',
      destinationKind: 'restaurant',
      dateTime: '2026-06-01T19:00:00.000Z',
      destinationLat: VENUE_LAT,
      destinationLng: VENUE_LNG,
    });

    expect(queries[0]).toBe('parking near Canlis Restaurant');
    expect(queries.some((q) => q.startsWith('event parking'))).toBe(false);
  });

  // Test 6: far lots demoted/excluded by distance; Park & Ride exempt.
  test('far lots are demoted or excluded, while Park & Ride is kept', async () => {
    const near = milesNorth(0.1);
    const backup = milesNorth(1.3);
    const tooFar = milesNorth(2.6);
    const farParkRide = milesNorth(2.6);

    mockSearchText([
      mockPlace('near', 'Stadium Adjacent Parking', near.lat, near.lng),
      mockPlace('backup', 'Pioneer Square Garage Parking', backup.lat, backup.lng),
      mockPlace('toofar', 'Downtown Core Parking', tooFar.lat, tooFar.lng),
      mockPlace('pr', 'Tukwila Park & Ride Lot', farParkRide.lat, farParkRide.lng),
    ]);

    const options = await getDestinationParkingOptions({
      origin: 'Bellevue, WA',
      destination: 'Lumen Field',
      destinationName: 'Lumen Field',
      destinationKind: 'stadium',
      dateTime: '2026-06-01T18:00:00.000Z',
      parkingDurationMinutes: 240,
      destinationLat: VENUE_LAT,
      destinationLng: VENUE_LNG,
    });

    const byName = (needle: string) =>
      options.find((option) => option.name.toLowerCase().includes(needle));

    const nearLot = byName('stadium adjacent');
    const backupLot = byName('pioneer square');
    const tooFarLot = byName('downtown core');
    const parkRideLot = byName('park & ride');

    // Within the preferred radius: kept as a primary option.
    expect(nearLot).toBeTruthy();
    expect(nearLot?.bestFor).not.toContain('Farther backup');

    // Between preferred and max radius: kept but flagged as a backup.
    expect(backupLot).toBeTruthy();
    expect(backupLot?.bestFor).toContain('Farther backup');

    // Beyond the hard max radius: excluded entirely.
    expect(tooFarLot).toBeUndefined();

    // Park & Ride is exempt from destination-radius exclusion.
    expect(parkRideLot).toBeTruthy();

    // Real walk time scales with distance instead of a flat 8 minutes.
    expect(nearLot?.transferToTerminalMinutes ?? 0).toBeLessThan(
      backupLot?.transferToTerminalMinutes ?? 0,
    );
  });

  test('lot distance and walk minutes are computed from destination coordinates', async () => {
    mockSearchText([
      mockPlace('near', 'Close Parking', milesNorth(0.1).lat, milesNorth(0.1).lng),
    ]);

    const result = await getDestinationParkingOptionsWithMetadata({
      origin: 'Bellevue, WA',
      destination: 'Lumen Field',
      destinationName: 'Lumen Field',
      destinationKind: 'stadium',
      dateTime: '2026-06-01T18:00:00.000Z',
      destinationLat: VENUE_LAT,
      destinationLng: VENUE_LNG,
    });

    const lot = result.options.find((option) => option.name === 'Close Parking');
    expect(lot).toBeTruthy();
    // ~0.1 mile, not the old hardcoded distance of 10.
    expect(lot?.distance ?? 99).toBeLessThan(0.5);
    expect(lot?.distance).not.toBe(10);
  });

  // Fuzzy event/city destination WITHOUT destinationLat/Lng: the venue is
  // geocoded and per-lot distance/walk vary (the reported production bug).
  test('fuzzy event destination without coordinates is geocoded, producing varied distance/walk', async () => {
    const near = milesNorth(0.1);
    const far = milesNorth(1.3);
    const { fetchMock, geocodeCalls } = mockSearchTextAndGeocode(
      [
        mockPlace('near', 'Stadium Adjacent Parking', near.lat, near.lng),
        mockPlace('far', 'Far Pioneer Lot Parking', far.lat, far.lng),
      ],
      { lat: VENUE_LAT, lng: VENUE_LNG },
    );

    const result = await getDestinationParkingOptionsWithMetadata({
      origin: 'Bellevue, WA',
      destination: 'Lumen Field, 800 Occidental Ave S, Seattle, WA 98134',
      destinationName: 'Lumen Field',
      destinationKind: 'stadium',
      dateTime: '2026-06-01T18:00:00.000Z',
      parkingDurationMinutes: 240,
      // No destinationLat / destinationLng — resolved via geocode fallback.
    });

    // The venue anchor was resolved through the geocoding endpoint.
    expect(geocodeCalls.length).toBeGreaterThan(0);

    const nearLot = result.options.find((o) => o.name === 'Stadium Adjacent Parking');
    const farLot = result.options.find((o) => o.name === 'Far Pioneer Lot Parking');
    expect(nearLot).toBeTruthy();
    expect(farLot).toBeTruthy();

    // Real, varied distances — not the old hardcoded 10 for every lot.
    expect(nearLot?.distance ?? 99).toBeLessThan(0.5);
    expect(farLot?.distance ?? 0).toBeGreaterThan(1);
    expect(nearLot?.distance).not.toBe(farLot?.distance);
    expect(nearLot?.distance).not.toBe(10);
    expect(farLot?.distance).not.toBe(10);

    // Walk/transfer minutes scale with distance instead of a flat 8.
    expect(nearLot?.walkingMinutes).not.toBe(8);
    expect(nearLot?.walkingMinutes ?? 0).toBeLessThan(farLot?.walkingMinutes ?? 0);
    expect(nearLot?.transferToTerminalMinutes).toBe(nearLot?.walkingMinutes);

    // Nearer lot ranks ahead of the farther backup at similar (estimated) price.
    const nearIndex = result.options.findIndex((o) => o.name === 'Stadium Adjacent Parking');
    const farIndex = result.options.findIndex((o) => o.name === 'Far Pioneer Lot Parking');
    expect(nearIndex).toBeLessThan(farIndex);

    fetchMock.mockRestore();
  });

  test('two lots at different coordinates produce different distance, walk and transfer minutes', async () => {
    const a = milesNorth(0.2);
    const b = milesNorth(0.9);
    mockSearchText([
      mockPlace('a', 'Lot A Parking', a.lat, a.lng),
      mockPlace('b', 'Lot B Parking', b.lat, b.lng),
    ]);

    const result = await getDestinationParkingOptionsWithMetadata({
      origin: 'Bellevue, WA',
      destination: 'Lumen Field',
      destinationName: 'Lumen Field',
      destinationKind: 'stadium',
      dateTime: '2026-06-01T18:00:00.000Z',
      destinationLat: VENUE_LAT,
      destinationLng: VENUE_LNG,
    });

    const lotA = result.options.find((o) => o.name === 'Lot A Parking');
    const lotB = result.options.find((o) => o.name === 'Lot B Parking');
    expect(lotA?.distance).not.toBeUndefined();
    expect(lotB?.distance).not.toBeUndefined();
    expect(lotA?.distance).not.toBe(lotB?.distance);
    expect(lotA?.walkingMinutes).not.toBe(lotB?.walkingMinutes);
    expect(lotA?.transferToTerminalMinutes).not.toBe(lotB?.transferToTerminalMinutes);
  });

  test('no google lot defaults to distance=10 / walkingMinutes=8 when the destination is resolvable', async () => {
    mockSearchTextAndGeocode(
      Array.from({ length: 5 }, (_, i) => {
        const p = milesNorth(0.1 + i * 0.2);
        return mockPlace(`lot-${i}`, `City Lot ${i + 1} Parking`, p.lat, p.lng);
      }),
      { lat: VENUE_LAT, lng: VENUE_LNG },
    );

    const result = await getDestinationParkingOptionsWithMetadata({
      origin: 'Bellevue, WA',
      destination: 'Downtown Seattle event center',
      destinationName: 'Downtown Seattle event center',
      dateTime: '2026-06-01T18:00:00.000Z',
      // No coords — resolved via geocode fallback.
    });

    const googleLots = result.options.filter((o) => o.providerSource === 'google');
    expect(googleLots.length).toBeGreaterThan(0);
    expect(googleLots.every((o) => o.distance === 10)).toBe(false);
    expect(googleLots.every((o) => o.walkingMinutes === 8)).toBe(false);
    // Distances genuinely vary across lots.
    expect(new Set(googleLots.map((o) => o.distance)).size).toBeGreaterThan(1);
  });

  test('when the destination cannot be geocoded, lots are not faked as distance=10 / walk=8', async () => {
    const { fetchMock } = mockSearchTextAndGeocode(
      [
        mockPlace('a', 'Unanchored Lot A Parking', milesNorth(0.2).lat, milesNorth(0.2).lng),
        mockPlace('b', 'Unanchored Lot B Parking', milesNorth(0.9).lat, milesNorth(0.9).lng),
      ],
      null, // geocode yields ZERO_RESULTS -> no anchor
    );

    const result = await getDestinationParkingOptionsWithMetadata({
      origin: 'Bellevue, WA',
      destination: 'Somewhere ambiguous that will not geocode',
      destinationName: 'Somewhere ambiguous that will not geocode',
      dateTime: '2026-06-01T18:00:00.000Z',
      // No coords; geocode fails -> distance/walk must be unset, never faked.
    });

    const googleLots = result.options.filter((o) => o.providerSource === 'google');
    expect(googleLots.length).toBeGreaterThan(0);
    for (const lot of googleLots) {
      expect(lot.distance).toBeUndefined();
      expect(lot.walkingMinutes).toBeUndefined();
      expect(lot.transferToTerminalMinutes).toBeUndefined();
      expect(lot.distance).not.toBe(10);
      expect(lot.walkingMinutes).not.toBe(8);
    }

    fetchMock.mockRestore();
  });

  test('when geocoding is budget-blocked, lots keep unknown distance and walk timing', async () => {
    (canMakeLiveApiCall as jest.Mock).mockImplementation(async (provider: string) =>
      provider === 'geocoding'
        ? { allowed: false, reason: 'daily_limit' }
        : { allowed: true },
    );
    const { fetchMock } = mockSearchText([
      mockPlace('a', 'Budget Blocked Lot A Parking', milesNorth(0.2).lat, milesNorth(0.2).lng),
      mockPlace('b', 'Budget Blocked Lot B Parking', milesNorth(0.9).lat, milesNorth(0.9).lng),
    ]);

    const result = await getDestinationParkingOptionsWithMetadata({
      origin: 'Bellevue, WA',
      destination: 'Budget blocked event venue',
      destinationName: 'Budget blocked event venue',
      destinationKind: 'stadium',
      dateTime: '2026-06-01T18:00:00.000Z',
    });

    expect(canMakeLiveApiCall).toHaveBeenCalledWith('geocoding');
    const googleLots = result.options.filter((o) => o.providerSource === 'google');
    expect(googleLots.length).toBeGreaterThan(0);
    for (const lot of googleLots) {
      expect(lot.distance).toBeUndefined();
      expect(lot.walkingMinutes).toBeUndefined();
      expect(lot.transferToTerminalMinutes).toBeUndefined();
      expect(lot.distance).not.toBe(10);
      expect(lot.walkingMinutes).not.toBe(8);
      expect(lot.assumptions.join(' ')).toContain("couldn't pinpoint your destination");
    }

    fetchMock.mockRestore();
  });

  test('ParkWhiz city lots with coordinates get varied distance and walk minutes', async () => {
    const actualParkWhiz = jest.requireActual('../../providers/parkWhiz') as typeof import('../../providers/parkWhiz');
    const near = milesNorth(0.1);
    const backup = milesNorth(1.2);
    const tooFar = milesNorth(2.4);
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get('q')).toBe(`coordinates:${VENUE_LAT},${VENUE_LNG} distance:2`);
      return {
        ok: true,
        json: async () => [
          parkWhizQuote('near', 'ParkWhiz Stadium Garage', near.lat, near.lng, 18),
          parkWhizQuote('backup', 'ParkWhiz Downtown Backup Garage', backup.lat, backup.lng, 8),
          parkWhizQuote('too-far', 'ParkWhiz Too Far Garage', tooFar.lat, tooFar.lng, 4),
        ],
      } as Response;
    });

    const options = await actualParkWhiz.getParkWhizDestinationParkingOptions({
      destination: 'Lumen Field',
      coordinates: { lat: VENUE_LAT, lng: VENUE_LNG },
      destinationKind: 'stadium',
      isEventVenue: true,
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-01',
    });

    const nearOption = options.find((option) => option.name.includes('Stadium Garage'));
    const backupOption = options.find((option) => option.name.includes('Downtown Backup'));
    expect(options.some((option) => option.name.includes('Too Far'))).toBe(false);
    expect(nearOption?.distance).toBeLessThan(0.5);
    expect(backupOption?.distance).toBeGreaterThan(1);
    expect(nearOption?.distance).not.toBe(backupOption?.distance);
    expect(new Set(options.map((option) => option.distance)).size).toBeGreaterThan(1);
    expect(options.every((option) => option.distance === 0)).toBe(false);
    expect(options.every((option) => option.walkingMinutes === 5)).toBe(false);
    expect(nearOption?.walkingMinutes).toBeLessThan(backupOption?.walkingMinutes ?? 0);
    expect(nearOption?.transferToTerminalMinutes).toBe(nearOption?.walkingMinutes);
    expect(backupOption?.bestFor).toContain('Farther backup');
    expect(nearOption?.price).toBe(18);
    expect(nearOption?.priceSource).toBe('parkwhiz-live');

    fetchMock.mockRestore();
  });

  test('ParkWhiz city quotes without any provider price are dropped', async () => {
    const actualParkWhiz = jest.requireActual('../../providers/parkWhiz') as typeof import('../../providers/parkWhiz');
    const near = milesNorth(0.1);
    const quoteWithPrice = parkWhizQuote('no-price', 'ParkWhiz No Price Garage', near.lat, near.lng, 18);
    const { price: _price, ...optionWithoutPrice } = quoteWithPrice.purchase_options[0];
    const noPriceQuote = {
      ...quoteWithPrice,
      purchase_options: [optionWithoutPrice],
    };

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [noPriceQuote],
    } as Response);

    const options = await actualParkWhiz.getParkWhizDestinationParkingOptions({
      destination: 'Lumen Field',
      coordinates: { lat: VENUE_LAT, lng: VENUE_LNG },
      destinationKind: 'stadium',
      isEventVenue: true,
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-01',
    });

    expect(options).toHaveLength(0);
    expect(options.some((option) => option.price === 999)).toBe(false);

    fetchMock.mockRestore();
  });

  test('normal downtown office trip still allows nearby ParkWhiz city lots', async () => {
    const actualParkWhiz = jest.requireActual('../../providers/parkWhiz') as typeof import('../../providers/parkWhiz');
    const near = milesNorth(0.2);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        parkWhizQuote('office-near', 'ParkWhiz Office Garage', near.lat, near.lng, 20),
      ],
    } as Response);

    const options = await actualParkWhiz.getParkWhizDestinationParkingOptions({
      destination: 'F5 Tower',
      coordinates: { lat: VENUE_LAT, lng: VENUE_LNG },
      destinationKind: 'office',
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-01',
    });

    expect(options).toHaveLength(1);
    expect(options[0]?.name).toContain('ParkWhiz Office Garage');
    expect(options[0]?.distance).toBeGreaterThan(0);
    expect(options[0]?.walkingMinutes).not.toBe(5);

    fetchMock.mockRestore();
  });

  test('near stadium Google lots rank above far live ParkWhiz backups', async () => {
    const near = milesNorth(0.1);
    mockSearchText([
      mockPlace('near-google', 'Lumen Field North Lot Parking', near.lat, near.lng),
    ]);
    (getParkWhizDestinationParkingOptions as jest.Mock).mockResolvedValueOnce([
      {
        id: 'parkwhiz-far-live',
        name: 'Securities Building Garage - Self Park',
        type: 'off-airport',
        price: 1,
        priceDisplay: 'live',
        priceUnit: 'total',
        pricingConfidence: 'live',
        priceConfidence: 'high',
        distance: 1.2,
        parkingBufferMinutes: 8,
        transferToTerminalMinutes: 24,
        transferType: 'walk',
        walkingMinutes: 24,
        availability: 90,
        availabilityScore: 100,
        trustStatus: 'live',
        sourceName: 'ParkWhiz',
        sourceLink: 'https://www.parkwhiz.com/book/far',
        mapLink: 'https://www.google.com/maps',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: ['Farther from your destination — shown as a backup, not a primary option.'],
        bestFor: ['Live provider price', 'Farther backup'],
        providerSource: 'parkwhiz',
        bookingProvider: 'ParkWhiz',
      } satisfies ParkingOption,
    ]);

    const result = await getDestinationParkingOptionsWithMetadata({
      origin: 'Bellevue, WA',
      destination: 'Lumen Field',
      destinationName: 'Lumen Field',
      destinationKind: 'stadium',
      dateTime: '2026-06-01T18:00:00.000Z',
      destinationLat: VENUE_LAT,
      destinationLng: VENUE_LNG,
      checkInDate: '2026-06-01',
      checkOutDate: '2026-06-01',
    });

    const googleIndex = result.options.findIndex((option) => option.name === 'Lumen Field North Lot Parking');
    const parkWhizIndex = result.options.findIndex((option) => option.id === 'destination-parkwhiz-parkwhiz-far-live');
    expect(googleIndex).toBeGreaterThanOrEqual(0);
    expect(parkWhizIndex).toBeGreaterThanOrEqual(0);
    expect(googleIndex).toBeLessThan(parkWhizIndex);
  });
});

// Test 5: cheapest mode orders by price, then distance/time as a tiebreak.
describe('cheapest parking ordering favors nearer lots on close prices', () => {
  function lot(overrides: Partial<ParkingOption>): ParkingOption {
    return {
      id: 'lot',
      name: 'Lot',
      type: 'off-airport',
      price: 20,
      priceDisplay: 'estimated',
      priceUnit: 'total',
      priceConfidence: 'medium',
      pricingConfidence: 'recent',
      availability: 80,
      availabilityStatus: 'unknown',
      isAvailable: true,
      trustStatus: 'estimated',
      sourceName: 'Test',
      lastUpdated: '2026-06-01T00:00:00.000Z',
      assumptions: [],
      routeToParkingMinutes: 15,
      parkingBufferMinutes: 8,
      ...overrides,
    } as ParkingOption;
  }

  test('equal price → nearer (shorter walk/distance) lot ranks first', () => {
    const near = lot({
      id: 'near',
      name: 'Venue Adjacent',
      price: 20,
      distance: 0.1,
      transferToTerminalMinutes: 2,
      walkingMinutes: 2,
    });
    const far = lot({
      id: 'far',
      name: 'Downtown Far',
      price: 20,
      distance: 1.3,
      transferToTerminalMinutes: 26,
      walkingMinutes: 26,
    });

    const sorted = sortParkingOptionsForMode([far, near], 'cheapest');
    expect(sorted[0]?.id).toBe('near');
  });

  test('clearly cheaper lot still wins on price', () => {
    const cheaper = lot({ id: 'cheap', name: 'Cheaper Far', price: 8, distance: 1.3, transferToTerminalMinutes: 26, walkingMinutes: 26 });
    const pricier = lot({ id: 'pricey', name: 'Pricey Near', price: 25, distance: 0.1, transferToTerminalMinutes: 2, walkingMinutes: 2 });

    const sorted = sortParkingOptionsForMode([pricier, cheaper], 'cheapest');
    expect(sorted[0]?.id).toBe('cheap');
  });
});
