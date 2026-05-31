import { MockProvider } from '../providers';
import { mockParkingOptions } from '../../data/mockData';
import { ParkingOption } from '../types';
import { aggregateAirportParkingOptions } from '../providers/parking/aggregator';
import { parkingProviderRegistry } from '../providers/parking/registry';
import { resetDefaultParkingProvidersForTests } from '../providers/parking/registerDefaults';

jest.mock('../providers/parkingAggregator', () => ({
  getLiveParkingOptions: jest.fn(async () => []),
  getDestinationParkingOptions: jest.fn(async () => []),
}));

function wrongAirportLot(serviceAirportCode: string): ParkingOption {
  return {
    ...mockParkingOptions[0],
    id: `wrong-${serviceAirportCode.toLowerCase()}`,
    name: `${serviceAirportCode} lot`,
    serviceAirportCode,
  };
}

describe('MockProvider airport parking pipeline', () => {
  const provider = new MockProvider();

  it('returns empty parking for PAE when live discovery is empty (no SEA mock injection)', async () => {
    const parking = await provider.getParkingOptions(
      'Everett, WA',
      'Paine Field (PAE)',
      '2024-07-01T12:00',
      24 * 60,
      {
        destinationKind: 'airport',
        airportCode: 'PAE',
      },
    );

    expect(parking).toEqual([]);
    expect(parking.some((p) => p.serviceAirportCode === 'SEA')).toBe(false);
  });
});

describe('aggregateAirportParkingOptions airport filtering', () => {
  beforeEach(() => {
    resetDefaultParkingProvidersForTests();
    jest.restoreAllMocks();
  });

  it('filters injected wrong-airport lots when providers return them', async () => {
    jest.spyOn(parkingProviderRegistry, 'executeSearch').mockResolvedValueOnce([
      {
        providerId: 'inventory',
        options: [wrongAirportLot('SEA'), wrongAirportLot('PAE')],
        health: { status: 'healthy', checkedAt: new Date().toISOString() },
      },
    ]);

    const parking = await aggregateAirportParkingOptions({
      airportCode: 'PAE',
      destination: 'Paine Field (PAE)',
    });

    expect(parking.every((p) => p.serviceAirportCode === 'PAE')).toBe(true);
    expect(parking.some((p) => p.serviceAirportCode === 'SEA')).toBe(false);
  });
});
