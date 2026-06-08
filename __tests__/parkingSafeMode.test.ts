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
import { attachGooglePlaceToParking } from '../lib/parking/googlePlaceMatch';
import {
  CACHED_PARKING_UNAVAILABLE_MESSAGE,
  LIVE_PARKING_DISCOVERY_DISABLED_MESSAGE,
  getParkingDiscoveryNotice,
} from '../lib/parking/parkingDiscoveryMode';
import {
  formatGooglePlacesRequestSummaryLine,
  logGooglePlacesRequestSummary,
} from '../lib/parking/googlePlacesConfig';
import {
  canMakeLiveGetPlaceCall,
  canMakeLivePhotoMediaCall,
  canMakeLiveSearchTextCall,
} from '../lib/parking/googlePlacesGuard';
import {
  getActivePlacesRequestBudget,
  resetPlacesRequestBudgetForTests,
  runWithPlacesRequestBudget,
} from '../lib/apiUsage/placesRequestBudget';
import { RecommendationEngine } from '../lib/recommendationEngine';
import { shouldDiscoverParkingForTrip } from '../lib/trip/tripContext';
import type { TripData } from '../lib/types';

jest.mock('../lib/providers/parking/shared/snapshots', () => ({
  getParkingPriceSnapshotsCached: jest.fn(async () => []),
}));

jest.mock('../lib/db/parkingCache', () => ({
  getLatestParkingPriceSnapshots: jest.fn(async () => []),
  saveParkingPriceSnapshotsFromOptions: jest.fn(async () => undefined),
}));

function applySafeModeEnv(): void {
  process.env.DISABLE_GOOGLE_PLACES = 'true';
  process.env.DISABLE_GOOGLE_PLACE_PHOTOS = 'true';
  process.env.DISABLE_GOOGLE_PLACE_REVIEWS = 'true';
  process.env.DISABLE_GOOGLE_PARKING_DISCOVERY = 'true';
  process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST = '0';
  process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST = '0';
  process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST = '0';
  process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST = '0';
  process.env.MAX_GOOGLE_PLACE_REVIEWS_PER_REQUEST = '0';
  process.env.DISABLE_PARKING_DB_CACHE = 'false';
}

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
    delete process.env.MAX_GOOGLE_PLACES_CALLS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_SEARCHTEXT_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PLACE_DETAILS_PER_REQUEST;
    delete process.env.MAX_GOOGLE_PHOTO_MEDIA_PER_REQUEST;
  });

  test('google provider is disabled when live discovery kill switch is on', () => {
    applySafeModeEnv();
    registerDefaultParkingProviders();

    expect(googlePlacesParkingProvider.enabled()).toBe(false);
  });

  test('airport aggregation returns cached/provider parking only when Google is disabled', async () => {
    applySafeModeEnv();

    jest.spyOn(parkingProviderRegistry, 'executeSearchPartial').mockResolvedValueOnce({
      timedOut: false,
      results: [
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
      ],
    });

    const fetchMock = jest.spyOn(global, 'fetch');

    const options = await aggregateAirportParkingOptions({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport (SEA)',
    });

    expect(options.map((option) => option.id)).toContain('inv-1');
    expect(options.every((option) => !String(option.id).startsWith('google-live'))).toBe(true);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('places.googleapis.com')),
    ).toHaveLength(0);
  });

  test('Google Places disabled causes zero SearchText, GetPlace, and PhotoMedia calls', async () => {
    applySafeModeEnv();

    const fetchMock = jest.spyOn(global, 'fetch');

    await getGoogleParkingPlaces({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport',
    });

    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('places.googleapis.com')),
    ).toHaveLength(0);
  });

  test('non-airport trip can request destination parking without live Google Places calls in safe mode', async () => {
    applySafeModeEnv();

    const fetchMock = jest.spyOn(global, 'fetch');
    const getParkingOptionsSpy = jest
      .spyOn(RecommendationEngine.provider, 'getParkingOptionsWithMetadata')
      .mockResolvedValue({ options: [], metadata: undefined });

    expect(shouldDiscoverParkingForTrip(CITY_TRIP)).toBe(true);

    await RecommendationEngine.generateRecommendations(CITY_TRIP);
    await attachGooglePlaceToParking(baseOption(), CITY_TRIP, 'SEA');

    expect(getParkingOptionsSpy).toHaveBeenCalledTimes(1);
    expect(getParkingOptionsSpy).toHaveBeenCalledWith(
      CITY_TRIP.origin,
      CITY_TRIP.destination,
      expect.any(String),
      CITY_TRIP.parkingDuration,
      expect.objectContaining({
        destinationKind: 'downtown',
        airportCode: undefined,
      }),
    );
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('places.googleapis.com')),
    ).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes('google-place-match')),
    ).toHaveLength(0);

    getParkingOptionsSpy.mockRestore();
  });

  test('airport trip with Google disabled still returns parking when cached provider data exists', async () => {
    applySafeModeEnv();

    const originalProvider = RecommendationEngine.provider;
    RecommendationEngine.setDataProvider({
      ...originalProvider,
      getParkingOptions: jest.fn(async () => [baseOption({ id: 'inv-1' })]),
      getRideshareOptions: jest.fn(async () => []),
      getTransitOptions: jest.fn(async () => []),
      getTsaEstimate: jest.fn(async () => ({
        destination: 'SEA',
        waitTime: 15,
        status: 'fallback' as const,
        sourceName: 'Test',
        trustStatus: 'estimated' as const,
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
      getTrafficEstimate: jest.fn(async () => ({
        route: 'test',
        duration: 30,
        congestion: 'low' as const,
        trustStatus: 'estimated' as const,
        sourceName: 'Test',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
      getFlightInfo: jest.fn(async () => ({
        destination: 'SEA',
        status: 'on-time' as const,
        trustStatus: 'estimated' as const,
        sourceName: 'Test',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
      getAirportInfo: jest.fn(async () => ({
        destination: 'SEA',
        name: 'SEA',
        services: [],
        trustStatus: 'estimated' as const,
        sourceName: 'Test',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
    });

    const recommendation = await RecommendationEngine.generateRecommendations(AIRPORT_TRIP);

    expect(recommendation.parking.length).toBeGreaterThan(0);
    expect(recommendation.parkingDiscoveryNotice).toBe(
      LIVE_PARKING_DISCOVERY_DISABLED_MESSAGE,
    );

    RecommendationEngine.setDataProvider(originalProvider);
  });

  test('airport trip with Google disabled shows unavailable notice when no cached parking exists', async () => {
    applySafeModeEnv();

    const originalProvider = RecommendationEngine.provider;
    RecommendationEngine.setDataProvider({
      ...originalProvider,
      getParkingOptions: jest.fn(async () => []),
      getRideshareOptions: jest.fn(async () => []),
      getTransitOptions: jest.fn(async () => []),
      getTsaEstimate: jest.fn(async () => ({
        destination: 'SEA',
        waitTime: 15,
        status: 'fallback' as const,
        sourceName: 'Test',
        trustStatus: 'estimated' as const,
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
      getTrafficEstimate: jest.fn(async () => ({
        route: 'test',
        duration: 30,
        congestion: 'low' as const,
        trustStatus: 'estimated' as const,
        sourceName: 'Test',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
      getFlightInfo: jest.fn(async () => ({
        destination: 'SEA',
        status: 'on-time' as const,
        trustStatus: 'estimated' as const,
        sourceName: 'Test',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
      getAirportInfo: jest.fn(async () => ({
        destination: 'SEA',
        name: 'SEA',
        services: [],
        trustStatus: 'estimated' as const,
        sourceName: 'Test',
        lastUpdated: new Date().toISOString(),
        assumptions: [],
      })),
    });

    const recommendation = await RecommendationEngine.generateRecommendations(AIRPORT_TRIP);

    expect(recommendation.parking).toHaveLength(0);
    expect(recommendation.parkingDiscoveryNotice).toBe(CACHED_PARKING_UNAVAILABLE_MESSAGE);
    expect(getParkingDiscoveryNotice(0)).toBe(CACHED_PARKING_UNAVAILABLE_MESSAGE);

    RecommendationEngine.setDataProvider(originalProvider);
  });

  test('merge applies safe-mode labels when discovery is disabled', async () => {
    applySafeModeEnv();

    const merged = await mergeLiveParkingSourceResults(
      { airportCode: 'SEA' },
      {
        inventoryOptions: [baseOption({ id: 'inv-1', name: 'Inventory Lot A' })],
        parkWhizOptions: [],
        aprOptions: [],
        liveGoogleOptions: [],
        snapshotOptions: [],
        marketplaceOptions: [],
        communityOptions: [],
        latestPriceSnapshots: [],
      },
    );

    expect(merged[0]?.assumptions).toEqual(
      expect.arrayContaining([
        'Showing cached/provider data',
      ]),
    );
  });

  test('request summary logs used=0/0/0/0 when live Places calls are blocked', async () => {
    applySafeModeEnv();

    await runWithPlacesRequestBudget('safe-mode-airport-search', async () => {
      expect(
        canMakeLiveSearchTextCall({
          reason: 'airport_parking_discovery',
          route: 'searchAirportGoogleParking',
          airportCode: 'SEA',
        }),
      ).toBe(false);

      expect(
        canMakeLiveGetPlaceCall({
          reason: 'place_details',
          route: 'fetchGooglePlaceDetailsLive',
          lotName: 'Jiffy Airport Parking',
          airportCode: 'SEA',
          cacheKey: 'place-live',
        }),
      ).toBe(false);

      expect(
        canMakeLivePhotoMediaCall({
          reason: 'place_photo_media',
          route: '/api/google-place-photo',
          cacheKey: 'places/abc/photos/def',
        }),
      ).toBe(false);

      const budget = getActivePlacesRequestBudget();
      expect(budget?.searchText).toBe(0);
      expect(budget?.getPlace).toBe(0);
      expect(budget?.photoMedia).toBe(0);
      expect(budget?.total).toBe(0);
    });

    expect(
      formatGooglePlacesRequestSummaryLine({
        route: '/api/recommendations',
        requestKey: 'safe-mode-airport-search',
        searchTextUsed: 0,
        getPlaceUsed: 0,
        photoMediaUsed: 0,
        reviewsUsed: 0,
        totalUsed: 0,
        blocked: 3,
      }),
    ).toBe('[google-places-config] request /api/recommendations used=0/0/0/0 reviews=0 blocked=3');

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    logGooglePlacesRequestSummary({
      route: '/api/recommendations',
      requestKey: 'safe-mode-airport-search',
      searchTextUsed: 0,
      getPlaceUsed: 0,
      photoMediaUsed: 0,
      reviewsUsed: 0,
      totalUsed: 0,
      blocked: 3,
    });

    expect(info).toHaveBeenCalledWith(
      '[google-places-config] request /api/recommendations used=0/0/0/0 reviews=0 blocked=3',
    );

    info.mockRestore();
    process.env.NODE_ENV = previousNodeEnv;
  });
});
