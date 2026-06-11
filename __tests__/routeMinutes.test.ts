import {
  estimateDriveMinutesFromStraightLineMiles,
  firstFiniteNumber,
  getParkingTerminalTimeMinutes,
  haversineMiles,
  resolveParkingDriveOrRouteTimeForDisplay,
  resolveParkingDriveMinutes,
  resolveParkingDriveMinutesWithFallback,
} from '../lib/parking/routeMinutes';
import { parkingTimeBreakdown } from '../lib/parking/routeDisplay';
import type { ParkingOption } from '../lib/types';

describe('routeMinutes', () => {
  it('estimates realistic drive minutes from straight-line distance', () => {
    const minutes = estimateDriveMinutesFromStraightLineMiles(45);
    expect(minutes).toBeGreaterThanOrEqual(60);
  });

  it('ignores placeholder duration when explicit drive minutes exist', () => {
    const minutes = resolveParkingDriveMinutes({
      id: 'test',
      name: 'Test lot',
      type: 'off-airport',
      price: 10,
      availability: 50,
      duration: 12,
      originToParkingMinutes: 68,
      assumptions: [],
    });

    expect(minutes).toBe(68);
  });

  it('picks the first positive finite numeric value', () => {
    expect(firstFiniteNumber(0, '0', undefined, '15')).toBe(15);
    expect(firstFiniteNumber(null, Number.NaN, -2, 'bad')).toBeNull();
  });

  it('computes haversine distance between two coordinates', () => {
    const monroeLat = 47.8554;
    const monroeLng = -121.9709;
    const seatacLat = 47.4502;
    const seatacLng = -122.3088;

    const miles = haversineMiles(monroeLat, monroeLng, seatacLat, seatacLng);
    expect(miles).toBeGreaterThan(30);
    expect(miles).toBeLessThan(55);
  });

  it('uses haversine fallback when live drive minutes are missing', () => {
    const monroeLat = 47.8554;
    const monroeLng = -121.9709;
    const jiffyLat = 47.4305;
    const jiffyLng = -122.2963;

    const minutes = resolveParkingDriveMinutesWithFallback(
      {
        id: 'jiffy',
        name: 'Jiffy Airport Parking',
        type: 'off-airport',
        price: 12,
        availability: 50,
        distance: 10,
        assumptions: [],
        lat: jiffyLat,
        lng: jiffyLng,
      },
      { originLat: monroeLat, originLng: monroeLng },
    );

    expect(minutes).toBeGreaterThan(45);
  });

  it('does not treat 0 minutes as valid drive time unless origin and lot are the same place', () => {
    const notSamePlace = resolveParkingDriveOrRouteTimeForDisplay({
      id: 'lot',
      name: 'Downtown Lot',
      type: 'off-airport',
      price: 12,
      availability: 50,
      trustStatus: 'estimated',
      sourceName: 'Test',
      lastUpdated: '2026-05-30T00:00:00.000Z',
      assumptions: [],
      originToParkingMinutes: 0,
      routeTime: { durationMinutes: '15' },
    } as ParkingOption);

    expect(notSamePlace.minutes).toBe(15);
    expect(notSamePlace.source).toBe('fallback-route-time');

    const samePlace = resolveParkingDriveOrRouteTimeForDisplay(
      {
        id: 'same-place-lot',
        name: 'Same Place Lot',
        type: 'off-airport',
        price: 12,
        availability: 50,
        trustStatus: 'estimated',
        sourceName: 'Test',
        lastUpdated: '2026-05-30T00:00:00.000Z',
        assumptions: [],
        originToParkingMinutes: 0,
        lat: 47.6097,
        lng: -122.3422,
      } as ParkingOption,
      { originLat: 47.6097, originLng: -122.3422 },
    );

    expect(samePlace.minutes).toBe(0);
    expect(samePlace.source).toBe('same-place');
  });
});

describe('parkingTimeBreakdown drive display', () => {
  const monroeOrigin = { originLat: 47.8554, originLng: -121.9709 };

  function jiffyLot(overrides: Partial<ParkingOption> = {}): ParkingOption {
    return {
      id: 'jiffy-sea',
      name: 'Jiffy Airport Parking',
      type: 'off-airport',
      transferType: 'shuttle',
      price: 12,
      availability: 50,
      distance: 10,
      lat: 47.4305,
      lng: -122.2963,
      parkingBufferMinutes: 15,
      transferToTerminalMinutes: 5,
      walkingMinutes: 5,
      shuttleWaitMinutes: 8,
      bufferRiskMinutes: 5,
      trustStatus: 'estimated',
      sourceName: 'Test',
      lastUpdated: '2026-05-30T00:00:00.000Z',
      assumptions: [],
      ...overrides,
    };
  }

  it('includes Drive to lot over 45m for Monroe to SeaTac lot', () => {
    const breakdown = parkingTimeBreakdown(jiffyLot(), monroeOrigin);
    const drive = breakdown.parts.find((part) => part.label === 'Drive to lot');

    expect(drive).toBeDefined();
    expect(drive!.minutes).toBeGreaterThan(45);
  });

  it('totals drive + park/check-in + terminal transfer + walk inside + buffer', () => {
    const option = jiffyLot();
    const breakdown = parkingTimeBreakdown(option, monroeOrigin);

    expect(breakdown.parts.map((part) => part.label)).toEqual(
      expect.arrayContaining([
        'Drive to lot',
        'Park/check-in',
        'Shuttle wait',
        'Shuttle',
        'Walk inside airport',
        'Buffer/risk',
      ]),
    );

    expect(breakdown.totalMinutes).toBe(
      breakdown.parts.reduce((sum, part) => sum + part.minutes, 0),
    );
    expect(breakdown.totalMinutes).toBeGreaterThan(60);
    expect(getParkingTerminalTimeMinutes(option, monroeOrigin)).toBe(breakdown.totalMinutes);
  });

  it('shows fallback route timing instead of a blank drive row when only route duration exists', () => {
    const breakdown = parkingTimeBreakdown(
      jiffyLot({
        originToParkingMinutes: undefined,
        routeToParkingMinutes: undefined,
        driveMinutes: undefined,
        routeTime: { durationMinutes: '15' },
        lat: undefined,
        lng: undefined,
      } as Partial<ParkingOption>),
      {},
      'city_destination_trip',
    );

    expect(breakdown.parts).toEqual([
      expect.objectContaining({
        label: 'Fallback route time',
        minutes: 15,
        display: '15m route',
      }),
    ]);
    expect(breakdown.totalMinutes).toBe(15);
  });

  it('uses driveToLotMinutes for city parking drive-to-lot display', () => {
    const breakdown = parkingTimeBreakdown(
      jiffyLot({
        transferType: 'walk',
        parkingBufferMinutes: 8,
        transferToTerminalMinutes: 3,
        walkingMinutes: 3,
        originToParkingMinutes: undefined,
        routeToParkingMinutes: undefined,
        driveToLotMinutes: 14,
        routeLegs: {
          originToLot: {
            durationMinutes: 14,
            distanceMiles: 2,
            source: 'google-routes',
          },
        },
        lat: undefined,
        lng: undefined,
      }),
      {},
      'city_destination_trip',
    );

    expect(breakdown.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Drive to lot',
          minutes: 14,
          display: '14m',
        }),
      ]),
    );
    expect(breakdown.totalMinutes).toBe(25);
    expect(breakdown.isPartial).toBe(false);
  });

  it('marks city parking totals partial when drive-to-lot is missing', () => {
    const breakdown = parkingTimeBreakdown(
      jiffyLot({
        transferType: 'walk',
        parkingBufferMinutes: 8,
        transferToTerminalMinutes: 3,
        walkingMinutes: 3,
        originToParkingMinutes: undefined,
        routeToParkingMinutes: undefined,
        driveToLotMinutes: undefined,
        driveMinutes: undefined,
        duration: undefined,
        lat: undefined,
        lng: undefined,
      }),
      {},
      'city_destination_trip',
    );

    expect(breakdown.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Drive to lot',
          minutes: 0,
          display: 'Check route',
        }),
      ]),
    );
    expect(breakdown.totalMinutes).toBe(11);
    expect(breakdown.isPartial).toBe(true);
    expect(breakdown.totalLabel).toBe('11 min partial');
  });

  it('does not treat zero minutes as valid city drive time unless origin and lot match', () => {
    const breakdown = parkingTimeBreakdown(
      jiffyLot({
        transferType: 'walk',
        parkingBufferMinutes: 8,
        transferToTerminalMinutes: 3,
        walkingMinutes: 3,
        originToParkingMinutes: 0,
        routeToParkingMinutes: 0,
        driveToLotMinutes: 0,
        lat: undefined,
        lng: undefined,
      }),
      {},
      'city_destination_trip',
    );

    const drive = breakdown.parts.find((part) => part.label === 'Drive to lot');
    expect(drive?.display).toBe('Check route');
    expect(breakdown.isPartial).toBe(true);
  });
});
