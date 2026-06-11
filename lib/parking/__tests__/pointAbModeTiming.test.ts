import type { ParkingOption } from '../../types';
import {
  resolveCustomerParkingTiming,
  resolveCustomerParkingTravelMinutes,
  resolvePaidGarageTiming,
  resolvePaidGarageTravelMinutes,
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

  test('street meter uses verify buffer and walk defaults', () => {
    expect(
      resolveStreetMeterTravelMinutes({ driveMinutes: 18, hasDestinationCoords: false }),
    ).toBe(31);
    expect(
      resolveStreetMeterTravelMinutes({ driveMinutes: 18, hasDestinationCoords: true }),
    ).toBe(29);
  });
});
