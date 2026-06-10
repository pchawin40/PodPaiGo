import {
  LiveTrafficProvider,
  MockProvider,
  PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE,
} from '../providers';
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

function destinationLot(overrides: Partial<ParkingOption> = {}): ParkingOption {
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
    ...overrides,
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

  it('general-trip enrichment preserves computed destination walk timing', async () => {
    (getDestinationParkingOptions as jest.Mock).mockResolvedValueOnce([
      destinationLot({
        id: 'near-destination-lot',
        name: 'Near Destination Lot',
        distance: 0.12,
        walkingMinutes: 3,
        transferToTerminalMinutes: 3,
        lat: 47.5954,
        lng: -122.3315,
      }),
      destinationLot({
        id: 'far-destination-lot',
        name: 'Far Destination Lot',
        distance: 0.85,
        walkingMinutes: 17,
        transferToTerminalMinutes: 17,
        lat: 47.6075,
        lng: -122.3315,
      }),
    ]);

    const provider = new MockProvider();
    const parking = await provider.getParkingOptions(
      'Monroe, WA',
      'Lumen Field',
      '2026-06-01T18:00:00.000Z',
      180,
      {
        destinationKind: 'stadium',
        destinationLat: 47.5952,
        destinationLng: -122.3316,
      },
    );

    const near = parking.find((option) => option.id === 'near-destination-lot');
    const far = parking.find((option) => option.id === 'far-destination-lot');
    expect(near?.distance).toBe(0.12);
    expect(far?.distance).toBe(0.85);
    expect(near?.walkingMinutes).toBe(3);
    expect(near?.transferToTerminalMinutes).toBe(3);
    expect(far?.walkingMinutes).toBe(17);
    expect(far?.transferToTerminalMinutes).toBe(17);
  });

  it('general-trip enrichment attaches origin-to-lot drive fields for city parking', async () => {
    const originalLimit = process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT;
    process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT = '5';
    (getDestinationParkingOptions as jest.Mock).mockResolvedValueOnce([
      destinationLot({
        id: 'securities-building-garage',
        name: 'Securities Building Garage (Lot #1) - Weekday Evening Rates',
        address: '1922 3rd Ave., Seattle, WA 98101',
        normalizedAddress: '1922 3rd Ave., Seattle, WA 98101',
        routeDestination: '1922 3rd Ave., Seattle, WA 98101',
        lat: 47.6115,
        lng: -122.3406,
        walkingMinutes: 3,
        transferToTerminalMinutes: 3,
      }),
    ]);

    try {
      const liveTraffic = new LiveTrafficProvider();
      jest.spyOn(liveTraffic, 'geocodeAddress').mockImplementation(async (address) => {
        if (address === 'Monroe, WA') return { lat: 47.8554, lng: -121.9709 };
        return null;
      });
      const routeSpy = jest
        .spyOn(liveTraffic, 'getTrafficEstimate')
        .mockImplementation(async (_origin, _destination, _dateTime, destinationLatLng, routeContext) => {
          if (routeContext?.routePurpose === PARKING_ORIGIN_TO_LOT_ROUTE_PURPOSE) {
            expect(destinationLatLng).toEqual({ lat: 47.6115, lng: -122.3406 });
            return {
              route: 'origin-to-lot',
              duration: 14,
              distanceMeters: 3219,
              congestion: 'medium',
              trustStatus: 'live',
              sourceName: 'Google Routes API',
              lastUpdated: '2026-06-01T18:00:00.000Z',
              assumptions: [],
            } satisfies TrafficEstimate;
          }

          return {
            route: 'origin-to-destination',
            duration: 20,
            congestion: 'medium',
            trustStatus: 'live',
            sourceName: 'Google Routes API',
            lastUpdated: '2026-06-01T18:00:00.000Z',
            assumptions: [],
          } satisfies TrafficEstimate;
        });

      const provider = new MockProvider();
      (provider as unknown as { trafficProvider: LiveTrafficProvider }).trafficProvider = liveTraffic;

      const parking = await provider.getParkingOptions(
        'Monroe, WA',
        'Downtown Seattle',
        '2026-06-01T18:00:00.000Z',
        180,
        {
          destinationKind: 'downtown',
          destinationLat: 47.6097,
          destinationLng: -122.3425,
        },
      );

      const lot = parking[0];
      expect(routeSpy).toHaveBeenCalled();
      expect(lot?.originToParkingMinutes).toBe(14);
      expect(lot?.routeToParkingMinutes).toBe(14);
      expect(lot?.driveToLotMinutes).toBe(14);
      expect(lot?.routeLegs?.originToLot?.durationMinutes).toBe(14);
      expect(lot?.routeLegs?.originToLot?.source).toBe('google-routes');
      expect(lot?.routeLegs?.originToLot?.distanceMiles).toBeCloseTo(2, 1);
    } finally {
      if (originalLimit == null) {
        delete process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT;
      } else {
        process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT = originalLimit;
      }
    }
  });

  it('general-trip route enrichment timeout still attaches fallback drive-to-lot fields', async () => {
    const originalLimit = process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT;
    const originalRouteTimeout = process.env.PARKING_ROUTE_ENRICH_TIMEOUT_MS;
    process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT = '5';
    process.env.PARKING_ROUTE_ENRICH_TIMEOUT_MS = '1';
    (getDestinationParkingOptions as jest.Mock).mockResolvedValueOnce([
      destinationLot({
        id: 'securities-building-garage',
        name: 'Securities Building Garage (Lot #1) - Weekday Evening Rates',
        address: '1922 3rd Ave., Seattle, WA 98101',
        normalizedAddress: '1922 3rd Ave., Seattle, WA 98101',
        routeDestination: '1922 3rd Ave., Seattle, WA 98101',
        lat: 47.6115,
        lng: -122.3406,
        walkingMinutes: 3,
        transferToTerminalMinutes: 3,
      }),
    ]);

    try {
      const liveTraffic = new LiveTrafficProvider();
      jest.spyOn(liveTraffic, 'geocodeAddress').mockImplementation(async (address) => {
        if (address === 'Monroe, WA') return { lat: 47.8554, lng: -121.9709 };
        return null;
      });
      jest
        .spyOn(liveTraffic, 'getTrafficEstimate')
        .mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return {
            route: 'late-origin-to-lot',
            duration: 14,
            distanceMeters: 3219,
            congestion: 'medium',
            trustStatus: 'live',
            sourceName: 'Google Routes API',
            lastUpdated: '2026-06-01T18:00:00.000Z',
            assumptions: [],
          } satisfies TrafficEstimate;
        });

      const provider = new MockProvider();
      (provider as unknown as { trafficProvider: LiveTrafficProvider }).trafficProvider = liveTraffic;

      const parking = await provider.getParkingOptions(
        'Monroe, WA',
        'Downtown Seattle',
        '2026-06-01T18:00:00.000Z',
        180,
        {
          destinationKind: 'downtown',
          destinationLat: 47.6097,
          destinationLng: -122.3425,
        },
      );

      const lot = parking[0];
      expect(lot?.driveToLotMinutes).toBeGreaterThan(0);
      expect(lot?.routeLegs?.originToLot?.durationMinutes).toBe(lot?.driveToLotMinutes);
      expect(lot?.routeLegs?.originToLot?.source).toBe('fallback');
      expect(lot?.originDriveSource).toBe('haversine-estimated');

      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      if (originalLimit == null) {
        delete process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT;
      } else {
        process.env.PARKING_INITIAL_LIVE_ROUTE_LIMIT = originalLimit;
      }
      if (originalRouteTimeout == null) {
        delete process.env.PARKING_ROUTE_ENRICH_TIMEOUT_MS;
      } else {
        process.env.PARKING_ROUTE_ENRICH_TIMEOUT_MS = originalRouteTimeout;
      }
    }
  });

  it('general-trip enrichment does not add airport transfer defaults when destination walk is unknown', async () => {
    (getDestinationParkingOptions as jest.Mock).mockResolvedValueOnce([
      destinationLot({
        id: 'unknown-off-airport-lot',
        name: 'Unknown Off Airport Lot',
        type: 'off-airport',
        distance: undefined,
        walkingMinutes: undefined,
        transferToTerminalMinutes: undefined,
        transferType: 'walk',
      }),
      destinationLot({
        id: 'unknown-official-garage',
        name: 'Unknown Official Garage',
        type: 'official',
        distance: undefined,
        walkingMinutes: undefined,
        transferToTerminalMinutes: undefined,
        transferType: 'walk',
      }),
    ]);

    const provider = new MockProvider();
    const parking = await provider.getParkingOptions(
      'Monroe, WA',
      'Seattle Stadium, Occidental Avenue South, Seattle, WA',
      '2026-06-01T18:00:00.000Z',
      180,
      {
        destinationKind: 'stadium',
      },
    );

    expect(parking).toHaveLength(2);
    for (const option of parking) {
      expect(option.distance).toBeUndefined();
      expect(option.walkingMinutes).toBeUndefined();
      expect(option.transferToTerminalMinutes).toBeUndefined();
      expect(option.transferToTerminalMinutes).not.toBe(5);
      expect(option.transferToTerminalMinutes).not.toBe(12);
    }
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
