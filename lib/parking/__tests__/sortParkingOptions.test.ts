import {
  parkingTotalDoorMinutes,
  sortParkingOptionsForMode,
} from '../sortParkingOptions';
import type { ParkingOption } from '../../types';

function lot(overrides: Partial<ParkingOption>): ParkingOption {
  return {
    id: overrides.id || 'lot',
    name: overrides.name || 'Lot',
    type: 'off-airport',
    price: 0,
    distance: 0,
    availability: 100,
    trustStatus: 'estimated',
    sourceName: 'Test',
    lastUpdated: new Date().toISOString(),
    assumptions: [],
    ...overrides,
  } as ParkingOption;
}

const ids = (options: ParkingOption[]) => options.map((o) => o.id);

describe('sortParkingOptionsForMode', () => {
  test('parkingTotalDoorMinutes sums drive + buffer + walk', () => {
    const option = lot({
      originToParkingMinutes: 10,
      parkingBufferMinutes: 5,
      walkingMinutes: 4,
    });
    expect(parkingTotalDoorMinutes(option)).toBe(19);
  });

  test('cheapest puts free / lowest total cost first', () => {
    const free = lot({ id: 'free', price: 0, validationStatus: 'free', originToParkingMinutes: 20 });
    const cheap = lot({ id: 'cheap', price: 12, originToParkingMinutes: 5 });
    const pricey = lot({ id: 'pricey', price: 40, originToParkingMinutes: 5 });

    const sorted = sortParkingOptionsForMode([pricey, cheap, free], 'cheapest');
    expect(ids(sorted)).toEqual(['free', 'cheap', 'pricey']);
  });

  test('fastest puts lowest total route + transfer time first', () => {
    const slow = lot({ id: 'slow', originToParkingMinutes: 30, walkingMinutes: 10 });
    const fast = lot({ id: 'fast', originToParkingMinutes: 8, walkingMinutes: 3 });
    const mid = lot({ id: 'mid', originToParkingMinutes: 15, walkingMinutes: 5 });

    const sorted = sortParkingOptionsForMode([slow, mid, fast], 'fastest');
    expect(ids(sorted)).toEqual(['fast', 'mid', 'slow']);
  });

  test('a 0-minute / missing drive time does not win fastest', () => {
    const zero = lot({ id: 'zero', originToParkingMinutes: 0, driveMinutes: 0, walkingMinutes: 2 });
    const real = lot({ id: 'real', originToParkingMinutes: 12, walkingMinutes: 4 });

    const sorted = sortParkingOptionsForMode([zero, real], 'fastest');
    expect(ids(sorted)).toEqual(['real', 'zero']);
  });

  test('easiest prioritizes trusted/available then lower total time', () => {
    const trustedFar = lot({
      id: 'trusted',
      trustStatus: 'live',
      originToParkingMinutes: 18,
      walkingMinutes: 6,
    });
    const untrustedClose = lot({
      id: 'untrusted',
      trustStatus: 'estimated',
      originToParkingMinutes: 6,
      walkingMinutes: 3,
    });

    const sorted = sortParkingOptionsForMode([untrustedClose, trustedFar], 'easiest');
    expect(ids(sorted)).toEqual(['trusted', 'untrusted']);
  });

  test('route-unavailable options sink to the bottom in every mode', () => {
    const unavailable = lot({ id: 'unavailable', price: 0, originToParkingMinutes: 2 });
    const available = lot({ id: 'available', price: 25, originToParkingMinutes: 20 });

    const context = { isUnavailable: (o: ParkingOption) => o.id === 'unavailable' };

    for (const mode of ['easiest', 'cheapest', 'fastest'] as const) {
      const sorted = sortParkingOptionsForMode([unavailable, available], mode, context);
      expect(sorted[sorted.length - 1]?.id).toBe('unavailable');
    }
  });

  test('different modes produce different visible orders', () => {
    const a = lot({ id: 'a', price: 0, validationStatus: 'free', originToParkingMinutes: 25, walkingMinutes: 8 });
    const b = lot({ id: 'b', price: 30, trustStatus: 'live', originToParkingMinutes: 6, walkingMinutes: 2 });

    const cheapest = ids(sortParkingOptionsForMode([a, b], 'cheapest'));
    const fastest = ids(sortParkingOptionsForMode([a, b], 'fastest'));

    expect(cheapest).toEqual(['a', 'b']);
    expect(fastest).toEqual(['b', 'a']);
    expect(cheapest).not.toEqual(fastest);
  });
});
