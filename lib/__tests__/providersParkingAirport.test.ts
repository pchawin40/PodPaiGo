import { LiveTrafficProvider, MockProvider } from '../providers';
import { mockParkingOptions } from '../../data/mockData';
import { ParkingOption, TrafficEstimate } from '../types';
import { aggregateAirportParkingOptions } from '../providers/parking/aggregator';
import {
  getDestinationParkingOptions,
  getLiveParkingOptions,
} from '../providers/parkingAggregator';
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

function destinationLot(): ParkingOption {
  return {
    id: 'destination-lot',
    name: 'Downtown Destination Garage',
    type: 'official',
    price: 18,
    distance: 10,
    availability: 50,
    trustStatus: 'estimated',
    sourceName: 'Destination parking fixture',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    assumptions: [],
    parkingBufferMinutes: 8,
    transferToTerminalMinutes: 6,
    transferType: 'walk',
    routeDestination: '100 Pike St, Seattle, WA',
    address: '100 Pike St, Seattle, WA',
    lat: 47.609,
    lng: -122.34,
  };
}

describe('MockProvider airport parking pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty parking for PAE when live discovery is empty (no SEA mock injection)', async () => {
    const provider = new MockProvider();

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

  it('general-trip destination parking uses getDestinationParkingOptions instead of early returning empty', async () => {
    (getDestinationParkingOptions as jest.Mock).mockResolvedValueOnce([destinationLot()]);

    const provider = new MockProvider();
    const parking = await provider.getParkingOptions(
      'Monroe, WA',
      'Pike Place Market',
      '2026-06-01T10:00:00.000Z',
      180,
      {
        destinationKind: 'downtown',
        destinationLat: 47.6097,
        destinationLng: -122.3425,
      },
    );

    expect(getDestinationParkingOptions).toHaveBeenCalledTimes(1);
    expect(getDestinationParkingOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'Monroe, WA',
        destination: 'Pike Place Market',
        parkingDurationMinutes: 180,
        destinationLat: 47.6097,
        destinationLng: -122.3425,
      }),
    );
    expect(getLiveParkingOptions).not.toHaveBeenCalled();
    expect(parking).toHaveLength(1);
    expect(parking[0]?.name).toBe('Downtown Destination Garage');
  });

  it('general-trip geocodes destination once for destination parking bias when coordinates are missing', async () => {
    (getDestinationParkingOptions as jest.Mock).mockResolvedValueOnce([destinationLot()]);

    const liveTraffic = new LiveTrafficProvider();
    const geocodeSpy = jest.spyOn(liveTraffic, 'geocodeAddress').mockImplementation(async (address) => {
      if (address === 'Pike Place Market') return { lat: 47.6097, lng: -122.3425 };
      if (address === 'Monroe, WA') return { lat: 47.8554, lng: -121.9709 };
      return null;
    });
    jest.spyOn(liveTraffic, 'getTrafficEstimate').mockResolvedValue({
      route: 'fixture',
      duration: 30,
      congestion: 'medium',
      trustStatus: 'live',
      sourceName: 'Google Routes API',
      lastUpdated: '2026-06-01T00:00:00.000Z',
      assumptions: [],
    } satisfies TrafficEstimate);

    const provider = new MockProvider();
    (provider as unknown as { trafficProvider: LiveTrafficProvider }).trafficProvider = liveTraffic;

    await provider.getParkingOptions(
      'Monroe, WA',
      'Pike Place Market',
      '2026-06-01T10:00:00.000Z',
      180,
      {
        destinationKind: 'downtown',
      },
    );

    expect(geocodeSpy.mock.calls.filter(([address]) => address === 'Pike Place Market')).toHaveLength(1);
    expect(getDestinationParkingOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: 'Pike Place Market',
        destinationLat: 47.6097,
        destinationLng: -122.3425,
      }),
    );
    expect(getLiveParkingOptions).not.toHaveBeenCalled();
  });

  it('airport trips still use getLiveParkingOptions', async () => {
    (getLiveParkingOptions as jest.Mock).mockResolvedValueOnce([]);

    const provider = new MockProvider();
    await provider.getParkingOptions(
      'Monroe, WA',
      'Seattle-Tacoma International Airport',
      '2026-06-01T10:00:00.000Z',
      24 * 60,
      {
        destinationKind: 'airport',
        airportCode: 'SEA',
      },
    );

    expect(getLiveParkingOptions).toHaveBeenCalledTimes(1);
    expect(getLiveParkingOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        airportCode: 'SEA',
        destination: 'Seattle-Tacoma International Airport',
      }),
    );
    expect(getDestinationParkingOptions).not.toHaveBeenCalled();
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
