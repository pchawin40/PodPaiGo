import type { ParkingOption, RideshareOption } from '../../types';
import {
  resolveCustomerParkingTiming,
  resolveCustomerParkingTravelMinutes,
  resolvePaidGarageTiming,
  resolvePaidGarageTravelMinutes,
  resolveRideshareTiming,
  resolveStreetMeterTravelMinutes,
} from '../pointAbModeTiming';

const paidGarage = {
  id: 'garage',
  name: 'Main Street Garage',
  type: 'off-airport' as const,
  price: 18,
  priceUnit: 'total' as const,
  distance: 0.2,
  availability: 80,
  trustStatus: 'estimated' as const,
  sourceName: 'Test',
  lastUpdated: '2026-06-01T00:00:00Z',
  assumptions: [],
  parkingBufferMinutes: 8,
  transferToTerminalMinutes: 5,
} satisfies ParkingOption;

describe('pointAbModeTiming', () => {
  test('customer parking uses small onsite buffer and short walk', () => {
    expect(
      resolveCustomerParkingTravelMinutes({ driveMinutes: 18, confidence: 'Medium' }),
    ).toBe(21);
    expect(
      resolveCustomerParkingTravelMinutes({ driveMinutes: 18, confidence: 'High' }),
    ).toBe(19);
    expect(
      resolveCustomerParkingTiming({ driveMinutes: 12, confidence: 'Medium' }),
    ).toEqual({
      driveMinutes: 12,
      parkingBufferMinutes: 2,
      walkToDestinationMinutes: 1,
      pickupWaitMinutes: null,
      totalOptionMinutes: 15,
    });
  });

  test('paid garage adds parking buffer and walk when route breakdown is missing', () => {
    expect(
      resolvePaidGarageTravelMinutes({
        driveMinutes: 18,
        parkingMinutes: null,
        parking: paidGarage,
      }),
    ).toBe(31);
    expect(
      resolvePaidGarageTiming({
        driveMinutes: 12,
        parkingMinutes: null,
        parking: paidGarage,
      }),
    ).toEqual({
      driveMinutes: 12,
      parkingBufferMinutes: 8,
      walkToDestinationMinutes: 5,
      pickupWaitMinutes: null,
      totalOptionMinutes: 25,
    });
  });

  test('paid garage keeps full breakdown when available', () => {
    expect(
      resolvePaidGarageTravelMinutes({
        driveMinutes: 18,
        parkingMinutes: 36,
        parking: paidGarage,
      }),
    ).toBe(36);
  });

  test('paid garage ignores understated breakdown totals that look drive-only', () => {
    expect(
      resolvePaidGarageTravelMinutes({
        driveMinutes: 24,
        parkingMinutes: 31,
        parking: paidGarage,
      }),
    ).toBe(37);
  });

  test('paid garage with only a local leg returns partial timing, never a fake total', () => {
    const timing = resolvePaidGarageTiming({
      driveMinutes: null,
      parkingMinutes: 12,
      parking: paidGarage,
    });

    expect(timing?.partial).toBe(true);
    expect(timing?.driveMinutes).toBeNull();
    expect(timing?.totalOptionMinutes ?? null).toBeNull();
    expect(
      resolvePaidGarageTravelMinutes({
        driveMinutes: null,
        parkingMinutes: 12,
        parking: paidGarage,
      }),
    ).toBeNull();
  });

  test('missing origin-to-lot leg falls back to the main drive route as an estimate', () => {
    // Bend-style: 6h+ main drive, only a 12-min local parking leg known.
    const timing = resolvePaidGarageTiming({
      driveMinutes: null,
      parkingMinutes: 12,
      parking: paidGarage,
      mainDriveMinutes: 374,
    });

    expect(timing?.driveMinutes).toBe(374);
    expect(timing?.driveSource).toBe('main-drive-estimate');
    // 374 drive + 8 buffer + 5 walk; the 12-min leg cannot understate it.
    expect(timing?.totalOptionMinutes).toBe(387);
  });

  test('an unconfirmed short drive-to-lot leg is re-based on the main drive', () => {
    const timing = resolvePaidGarageTiming({
      driveMinutes: 3,
      parkingMinutes: 12,
      parking: paidGarage,
      mainDriveMinutes: 374,
      driveRouteConfirmed: false,
    });

    expect(timing?.driveMinutes).toBe(374);
    expect(timing?.driveSource).toBe('main-drive-estimate');
    expect(timing?.totalOptionMinutes).toBe(387);
  });

  test('a route-confirmed faster drive-to-lot leg is kept', () => {
    const timing = resolvePaidGarageTiming({
      driveMinutes: 20,
      parkingMinutes: null,
      parking: paidGarage,
      mainDriveMinutes: 40,
      driveRouteConfirmed: true,
    });

    expect(timing?.driveMinutes).toBe(20);
    expect(timing?.driveSource).toBeUndefined();
    expect(timing?.totalOptionMinutes).toBe(33);
  });

  test('a local unconfirmed leg whose chain already covers the main drive is unchanged', () => {
    const timing = resolvePaidGarageTiming({
      driveMinutes: 18,
      parkingMinutes: null,
      parking: paidGarage,
      mainDriveMinutes: 20,
    });

    expect(timing?.driveMinutes).toBe(18);
    expect(timing?.driveSource).toBeUndefined();
    // 18 + 8 + 5 = 31 ≥ 20 main drive, so no re-base is needed.
    expect(timing?.totalOptionMinutes).toBe(31);
  });

  test('street meter uses verify buffer and walk defaults', () => {
    expect(
      resolveStreetMeterTravelMinutes({ driveMinutes: 18, hasDestinationCoords: false }),
    ).toBe(31);
    expect(
      resolveStreetMeterTravelMinutes({ driveMinutes: 18, hasDestinationCoords: true }),
    ).toBe(29);
  });

  describe('resolveRideshareTiming', () => {
    const ride = (overrides: Partial<RideshareOption>): RideshareOption => ({
      id: 'uber',
      name: 'UberX',
      price: 40,
      duration: 23,
      driveMinutes: 18,
      pickupWaitMinutes: 5,
      totalOptionMinutes: 23,
      availability: 85,
      trustStatus: 'estimated',
      sourceName: 'Uber estimate model',
      lastUpdated: '2026-06-01T00:00:00Z',
      assumptions: [],
      ...overrides,
    });

    test('rideshare drive leg can never be faster than the main drive route', () => {
      // Distance-band fallback drive (72) for a 6h+ trip must not win.
      const timing = resolveRideshareTiming({
        driveMinutes: 374,
        rideshare: ride({ driveMinutes: 72, totalOptionMinutes: 77, duration: 77, routeConfirmed: false }),
      });

      expect(timing?.driveMinutes).toBe(374);
      expect(timing?.totalOptionMinutes).toBe(379);
    });

    test('trusts a confirmed option route when no main drive is known', () => {
      const timing = resolveRideshareTiming({
        driveMinutes: null,
        rideshare: ride({ driveMinutes: 18, totalOptionMinutes: 23, duration: 23 }),
      });

      expect(timing?.driveMinutes).toBe(18);
      expect(timing?.totalOptionMinutes).toBe(23);
    });

    test('suppresses duration for an unconfirmed fallback band with no main drive', () => {
      const timing = resolveRideshareTiming({
        driveMinutes: null,
        rideshare: ride({ driveMinutes: 72, totalOptionMinutes: 77, duration: 77, routeConfirmed: false }),
      });

      expect(timing).toBeNull();
    });

    test('keeps a legitimately slower rideshare route over the main drive', () => {
      const timing = resolveRideshareTiming({
        driveMinutes: 20,
        rideshare: ride({ driveMinutes: 26, totalOptionMinutes: 31, duration: 31 }),
      });

      expect(timing?.driveMinutes).toBe(26);
      expect(timing?.totalOptionMinutes).toBe(31);
    });

    test('backs the pickup wait out of an option total with no explicit drive leg', () => {
      const timing = resolveRideshareTiming({
        driveMinutes: null,
        rideshare: ride({ driveMinutes: undefined, totalOptionMinutes: 38, duration: 38 }),
      });

      expect(timing?.driveMinutes).toBe(33);
      expect(timing?.totalOptionMinutes).toBe(38);
    });
  });
});
