import type { ParkingOption } from '../../../types';
import { aggregateAirportParkingOptions } from '../aggregator';
import { parkingProviderRegistry } from '../registry';
import { registerDefaultParkingProviders, resetDefaultParkingProvidersForTests } from '../registerDefaults';
import { applyLegacyDisplayOrder } from '../displayOrder';
import { mergeLiveParkingSourceResults } from '../merge';
import { resetParkingSearchCacheForTests } from '../searchCache';
import { getParkingPriceSnapshotsCached } from '../shared/snapshots';

jest.mock('../shared/snapshots', () => ({
  getParkingPriceSnapshotsCached: jest.fn(async () => []),
}));

jest.mock('../../../db/parkingCache', () => ({
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
    lastUpdated: '2024-01-01T00:00:00.000Z',
    assumptions: [],
    ...overrides,
  };
}

describe('aggregateAirportParkingOptions', () => {
  beforeEach(() => {
    resetDefaultParkingProvidersForTests();
    resetParkingSearchCacheForTests();
    jest.restoreAllMocks();
  });

  it('merges provider search results and filters by airport', async () => {
    jest.spyOn(parkingProviderRegistry, 'executeSearchPartial').mockResolvedValueOnce({
      timedOut: false,
      results: [
        {
          providerId: 'inventory',
          options: [baseOption({ id: 'inv-1', name: 'Inventory Lot A' })],
          health: { status: 'healthy', checkedAt: new Date().toISOString() },
        },
        {
          providerId: 'parkwhiz',
          options: [baseOption({ id: 'pw-1', name: 'ParkWhiz Lot B', sourceName: 'ParkWhiz', bookingProvider: 'ParkWhiz' })],
          health: { status: 'healthy', checkedAt: new Date().toISOString() },
        },
      ],
    });

    const options = await aggregateAirportParkingOptions({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport (SEA)',
    });

    expect(options.map((option) => option.id)).toEqual(
      expect.arrayContaining(['pw-1', 'inv-1']),
    );
    expect(options.findIndex((option) => option.id === 'pw-1')).toBeLessThan(
      options.findIndex((option) => option.id === 'inv-1'),
    );
  });

  it('keeps successful airport providers when one provider reports a failure', async () => {
    jest.spyOn(parkingProviderRegistry, 'executeSearchPartial').mockResolvedValueOnce({
      timedOut: false,
      results: [
        {
          providerId: 'google',
          options: [],
          health: {
            status: 'offline',
            message: 'Google provider failed',
            checkedAt: new Date().toISOString(),
          },
          error: 'Google provider failed',
        },
        {
          providerId: 'inventory',
          options: [baseOption({ id: 'inv-available', name: 'Inventory Available Lot' })],
          health: { status: 'healthy', checkedAt: new Date().toISOString() },
        },
        {
          providerId: 'parkwhiz',
          options: [baseOption({ id: 'pw-available', name: 'ParkWhiz Available Lot', sourceName: 'ParkWhiz' })],
          health: { status: 'healthy', checkedAt: new Date().toISOString() },
        },
      ],
    });

    const options = await aggregateAirportParkingOptions({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport (SEA)',
    });

    expect(options.map((option) => option.id)).toContain('inv-available');
    expect(options.map((option) => option.id)).toContain('pw-available');
  });

  it('keeps partial provider results when provider search times out', async () => {
    jest.spyOn(parkingProviderRegistry, 'executeSearchPartial').mockResolvedValueOnce({
      timedOut: true,
      results: [
        {
          providerId: 'parkwhiz',
          options: [
            baseOption({
              id: 'pw-jiffy',
              name: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
              sourceName: 'ParkWhiz',
              bookingProvider: 'ParkWhiz',
              priceDisplay: 'live',
            }),
          ],
          health: { status: 'healthy', checkedAt: new Date().toISOString() },
        },
      ],
    });

    const options = await aggregateAirportParkingOptions({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport (SEA)',
    });

    expect(options.map((option) => option.id)).toContain('pw-jiffy');
  });

  it('does not block provider results on slow snapshot cache reads', async () => {
    const originalTimeout = process.env.PARKING_CRITICAL_SNAPSHOT_TIMEOUT_MS;
    process.env.PARKING_CRITICAL_SNAPSHOT_TIMEOUT_MS = '1';
    (getParkingPriceSnapshotsCached as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 25)),
    );
    jest.spyOn(parkingProviderRegistry, 'executeSearchPartial').mockResolvedValueOnce({
      timedOut: false,
      results: [
        {
          providerId: 'parkwhiz',
          options: [
            baseOption({
              id: 'pw-live',
              name: 'Live ParkWhiz Lot',
              sourceName: 'ParkWhiz',
              bookingProvider: 'ParkWhiz',
            }),
          ],
          health: { status: 'healthy', checkedAt: new Date().toISOString() },
        },
      ],
    });

    const options = await aggregateAirportParkingOptions({
      airportCode: 'SEA',
      destination: 'Seattle-Tacoma International Airport (SEA)',
    });

    expect(options.map((option) => option.id)).toContain('pw-live');
    if (typeof originalTimeout === 'string') {
      process.env.PARKING_CRITICAL_SNAPSHOT_TIMEOUT_MS = originalTimeout;
    } else {
      delete process.env.PARKING_CRITICAL_SNAPSHOT_TIMEOUT_MS;
    }
  });

  it('registers default providers once', () => {
    registerDefaultParkingProviders();
    registerDefaultParkingProviders();

    expect(parkingProviderRegistry.getProvider('inventory')).toBeDefined();
    expect(parkingProviderRegistry.getProvider('google')).toBeDefined();
  });
});

describe('applyLegacyDisplayOrder', () => {
  it('ranks official parking before marketplace options', () => {
    const ordered = applyLegacyDisplayOrder([
      baseOption({ id: 'market', type: 'off-airport', price: 5, sourceName: 'SpotHero' }),
      baseOption({ id: 'official', type: 'official', price: 30, sourceName: 'Airport' }),
    ]);

    expect(ordered.map((option) => option.id)).toEqual(['official', 'market']);
  });
});

describe('mergeLiveParkingSourceResults', () => {
  it('merges provider parts into unified options', async () => {
    const merged = await mergeLiveParkingSourceResults(
      { airportCode: 'SEA' },
      {
        inventoryOptions: [baseOption({ id: 'inv-1', name: 'Inventory Lot A' })],
        parkWhizOptions: [baseOption({ id: 'pw-1', name: 'ParkWhiz Lot B', sourceName: 'ParkWhiz' })],
        aprOptions: [],
        liveGoogleOptions: [],
        snapshotOptions: [],
        marketplaceOptions: [],
        communityOptions: [],
        latestPriceSnapshots: [],
      },
    );

    expect(merged.map((option) => option.id)).toEqual(
      expect.arrayContaining(['pw-1', 'inv-1']),
    );
    expect(merged.findIndex((option) => option.id === 'pw-1')).toBeLessThan(
      merged.findIndex((option) => option.id === 'inv-1'),
    );
  });
});
