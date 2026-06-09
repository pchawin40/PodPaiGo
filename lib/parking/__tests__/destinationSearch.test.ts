import {
  getDestinationParkingOptions,
  getDestinationParkingOptionsWithMetadata,
  resetDestinationParkingSearchCacheForTests,
} from '../../providers/parking/providers/googlePlaces/destinationSearch';
import { resetPlacesRequestBudgetForTests } from '../../apiUsage/placesRequestBudget';
import { getParkingLotsNearPoint } from '../inventory';
import { sortParkingOptionsForMode } from '../sortParkingOptions';
import type { ParkingOption } from '../../types';

jest.mock('../../env/googleMapsServerKey', () => ({
  getGoogleMapsServerApiKey: jest.fn(() => 'test-key'),
}));

jest.mock('../../providers/parkWhiz', () => ({
  getParkWhizDestinationParkingOptions: jest.fn(async () => []),
}));

jest.mock('../inventory', () => ({
  getParkingLotsNearPoint: jest.fn(async () => []),
}));

jest.mock('../../providers/parking/providers/communityFree/provider', () => ({
  getCommunityFreeParkingOptions: jest.fn(async () => []),
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

function applyEnv(): void {
  delete process.env.DISABLE_GOOGLE_PLACES;
  delete process.env.DISABLE_GOOGLE_PARKING_DISCOVERY;
  delete process.env.DESTINATION_PARKING_SEARCH_RADIUS_METERS;
  process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-key';
  process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '5';
  process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '5';
  process.env.DESTINATION_PARKING_MIN_RESULTS_BEFORE_STOP = '5';
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
    jest.restoreAllMocks();
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
