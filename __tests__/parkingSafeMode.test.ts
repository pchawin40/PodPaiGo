import type { ParkingOption } from '../lib/types';
import { aggregateAirportParkingOptions } from '../lib/providers/parking/aggregator';
import { mergeLiveParkingSourceResults } from '../lib/providers/parking/merge';
import { parkingProviderRegistry } from '../lib/providers/parking/registry';
import {
  registerDefaultParkingProviders,
  resetDefaultParkingProvidersForTests,
} from '../lib/providers/parking/registerDefaults';
import { googlePlacesParkingProvider } from '../lib/providers/parking/providers/googlePlaces/provider';
import { getGoogleParkingPlaces } from '../lib/providers/parking/providers/googlePlaces/airportSearch';
import {
  LIVE_PARKING_DISCOVERY_DISABLED_MESSAGE,
} from '../lib/parking/parkingDiscoveryMode';
import { RecommendationEngine } from '../lib/recommendationEngine';
import { shouldDiscoverParkingForTrip } from '../lib/trip/tripContext';
import type { TripData } from '../lib/types';
import { resetPlacesRequestBudgetForTests } from '../lib/apiUsage/placesRequestBudget';

jest.mock('../lib/providers/parking/shared/snapshots', () => ({
  getParkingPriceSnapshotsCached: jest.fn(async () => []),
}));

jest.mock('../lib/db/parkingCache', () => ({
  getLatestParkingPriceSnapshots: jest.fn(async () => []),
  saveParkingPriceSnapshotsFromOptions: jest.fn(async () => undefined),
}));

function baseOption(overrides: Partial<ParkingOption> = {}): ParkingOption {
  return {
    id: 'lot-1',
    name: 'Test Lot',
    type: 'off-airport',
    price: 15,
    distance: 10,
    availability: 70,
    trustStatus: 'estimated',
    sourceName: 'Parking inventory',
    serviceAirportCode: 'SEA',
    lat: 47.44,
    lng: -122.29,
    lastUpdated: '2024-01-01T00:00:00.000Z',
    assumptions: [],
    ...overrides,
  };
}

const AIRPORT_TRIP: TripData = {
  type: 'one-way-departure',
  origin: 'Monroe, WA',
  destination: 'Seattle-Tacoma International Airport',
  destinationKind: 'airport',
  airportCode: 'SEA',
  departureDate: '2026-06-01',
  departureTime: '06:00',
  transportAvailability: 'car',
};

const CITY_TRIP: TripData = {
  type: 'general-trip',
  origin: 'Monroe, WA',
  destination: 'Bellevue, WA',
  destinationKind: 'downtown',
  arrivalDate: '2026-06-01',
  arrivalTime: '10:00',
  parkingDuration: 180,
  transportAvailability: 'car',
};

describe('parking safe mode', () => {
  beforeEach(() => {
    resetDefaultParkingProvidersForTests();
    resetPlacesRequestBudgetForTests();
    jest.restoreAllMocks();
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.DISABLE_GOOGLE_PLACE_PHOTOS;
    delete process.env.DISABLE_GOOGLE_PARKING_DISCOVERY;
    delete process.env.DISABLE_PARKING_DB_CACHE;
    process.env.NODE_ENV = 'development';
  });

  test('google provider is disabled when live discovery kill switch is on', () => {
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';
    registerDefaultParkingProviders();

    expect(googlePlacesParkingProvider.enabled()).toBe(false);
  });

  test('airport aggregation still returns cached/provider parking when Google discovery is disabled', async () => {
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';
    process.env.DISABLE_GOOGLE_PLACES = 'true';

    jest.spyOn(parkingProviderRegistry, 'executeSearch').mockResolvedValueOnce([
      {
        providerId: 'inventory',
        options: [baseOption({ id: 'inv-1', name: 'Inventory Lot A' })],
        health: { status: 'healthy', checkedAt: new Date().toISOString() },
      },
      {
        providerId: 'google',
        options: [],
        health: {
          status: 'offline',
          message: 'Live Google parking discovery disabled',
          checkedAt: new Date().toISOString(),
        },
      },
    ]);

    const options = await aggregateAirportParkingOptions({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport (SEA)',
    });

    expect(options.map((option) => option.id)).toEqual(['inv-1']);
    expect(options[0]?.assumptions).toEqual(
      expect.arrayContaining([
        'Cached/provider parking data (live Google Places discovery disabled).',
      ]),
    );
  });

  test('Google Places disabled causes zero SearchText, GetPlace, and PhotoMedia calls', async () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';
    process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'true';
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';

    const fetchMock = jest.spyOn(global, 'fetch');

    await getGoogleParkingPlaces({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport',
    });

    const placesApiCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('places.googleapis.com'),
    );

    expect(placesApiCalls).toHaveLength(0);
  });

  test('merge applies safe-mode labels when discovery is disabled', async () => {
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';

    const merged = await mergeLiveParkingSourceResults(
      { airportCode: 'SEA' },
      {
        inventoryOptions: [baseOption({ id: 'inv-1', name: 'Inventory Lot A' })],
        parkWhizOptions: [],
        aprOptions: [],
        liveGoogleOptions: [],
        snapshotOptions: [],
        marketplaceOptions: [],
        latestPriceSnapshots: [],
      },
    );

    expect(merged[0]?.assumptions).toEqual(
      expect.arrayContaining([
        'Cached/provider parking data (live Google Places discovery disabled).',
      ]),
    );
  });

  test('recommendation includes parking discovery notice when live discovery is disabled', async () => {
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';

    const originalProvider = RecommendationEngine.provider;
    RecommendationEngine.setDataProvider({
      ...originalProvider,
      getParkingOptions: jest.fn(async () => [baseOption({ id: 'inv-1' })]),
      getRideshareOptions: jest.fn(async () => []),
      getTransitOptions: jest.fn(async () => []),
      getTsaEstimate: jest.fn(async () => ({
        destination: 'SEA',
        waitTime: 15,
        status: 'fallback',
        sourceName: 'Test',
        trustStatus: 'estimated',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
      getTrafficEstimate: jest.fn(async () => ({
        route: 'test',
        duration: 30,
        congestion: 'low',
        trustStatus: 'estimated',
        sourceName: 'Test',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
      getFlightInfo: jest.fn(async () => null),
      getAirportInfo: jest.fn(async () => ({})),
    });

    const recommendation = await RecommendationEngine.generateRecommendations(AIRPORT_TRIP);

    expect(recommendation.parkingDiscoveryNotice).toBe(
      LIVE_PARKING_DISCOVERY_DISABLED_MESSAGE,
    );
    expect(recommendation.parking.length).toBeGreaterThan(0);

    RecommendationEngine.setDataProvider(originalProvider);
  });

  test('non-airport trip does not call parking discovery', async () => {
    process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';

    const getParkingOptionsSpy = jest
      .spyOn(RecommendationEngine.provider, 'getParkingOptions')
      .mockResolvedValue([]);

    expect(shouldDiscoverParkingForTrip(CITY_TRIP)).toBe(false);

    const recommendation = await RecommendationEngine.generateRecommendations(CITY_TRIP);

    expect(getParkingOptionsSpy).not.toHaveBeenCalled();
    expect(recommendation.parkingDiscoveryNotice).toBeUndefined();

    getParkingOptionsSpy.mockRestore();
  });
});
