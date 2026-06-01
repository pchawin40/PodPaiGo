import {
  estimateDriveMinutesFromStraightLineMiles,
  getParkingTerminalTimeMinutes,
  haversineMiles,
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

  it('prefers originToParkingMinutes over placeholder distance', () => {
    const minutes = resolveParkingDriveMinutes({
      id: 'test',
      name: 'Test lot',
      type: 'off-airport',
      price: 10,
      availability: 50,
      distance: 5,
      originToParkingMinutes: 68,
      assumptions: [],
    });

    expect(minutes).toBe(68);
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

  it('includes Drive to parking over 45m for Monroe to SeaTac lot', () => {
    const breakdown = parkingTimeBreakdown(jiffyLot(), monroeOrigin);
    const drive = breakdown.parts.find((part) => part.label === 'Drive to parking');

    expect(drive).toBeDefined();
    expect(drive!.minutes).toBeGreaterThan(45);
  });

  it('totals drive + park/check-in + terminal transfer + walk inside + buffer', () => {
    const option = jiffyLot();
    const breakdown = parkingTimeBreakdown(option, monroeOrigin);

    expect(breakdown.parts.map((part) => part.label)).toEqual(
      expect.arrayContaining([
        'Drive to parking',
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
});
