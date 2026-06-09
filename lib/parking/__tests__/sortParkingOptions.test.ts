import {
  compareParkingByCheapest,
  compareParkingByEasiest,
  compareParkingByFastest,
  getParkingComparableCost,
  getParkingTotalTimeMinutes,
  parkingRankExplanation,
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

  test('exported comparable helpers use trip duration and route time', () => {
    const option = lot({
      price: 10,
      priceUnit: 'per-day',
      originToParkingMinutes: 15,
      parkingBufferMinutes: 5,
      walkingMinutes: 5,
    });

    expect(getParkingTotalTimeMinutes(option, null)).toBe(25);
    expect(
      getParkingComparableCost(option, {
        type: 'general-trip',
        origin: 'A',
        destination: 'B',
        arrivalDate: '2026-06-01',
        arrivalTime: '09:00',
        parkingDuration: 8 * 60,
      }),
    ).toBe(10);
  });

  test('cheapest puts free / lowest total cost first', () => {
    const free = lot({ id: 'free', price: 0, validationStatus: 'free', originToParkingMinutes: 20 });
    const cheap = lot({ id: 'cheap', price: 12, originToParkingMinutes: 5 });
    const pricey = lot({ id: 'pricey', price: 40, originToParkingMinutes: 5 });

    const sorted = sortParkingOptionsForMode([pricey, cheap, free], 'cheapest');
    expect(ids(sorted)).toEqual(['free', 'cheap', 'pricey']);
  });

  test('cheapest sorts known $11 before known $13 when timing is equal', () => {
    const eleven = lot({
      id: 'eleven',
      price: 11,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 9,
      walkingMinutes: 2,
    });
    const thirteen = lot({
      id: 'thirteen',
      price: 13,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 9,
      walkingMinutes: 2,
    });

    const sorted = sortParkingOptionsForMode([thirteen, eleven], 'cheapest');
    expect(ids(sorted)).toEqual(['eleven', 'thirteen']);
  });

  test('cheapest sorts same-price lots by shorter total time', () => {
    const slow = lot({
      id: 'slow',
      price: 11,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 14,
      walkingMinutes: 2,
    });
    const fast = lot({
      id: 'fast',
      price: 11,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 7,
      walkingMinutes: 2,
    });

    const sorted = sortParkingOptionsForMode([slow, fast], 'cheapest');
    expect(ids(sorted)).toEqual(['fast', 'slow']);
  });

  test('cheapest uses total time and proximity for close prices within $2', () => {
    const slowerEleven = lot({
      id: 'slower-eleven',
      price: 11,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 14,
      walkingMinutes: 2,
    });
    const fasterThirteen = lot({
      id: 'faster-thirteen',
      price: 13,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 7,
      walkingMinutes: 2,
    });
    const closerTwelve = lot({
      id: 'closer-twelve',
      price: 12,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 7,
      walkingMinutes: 2,
      distanceToAirport: 0.1,
    });
    const fartherTwelve = lot({
      id: 'farther-twelve',
      price: 12,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 7,
      walkingMinutes: 2,
      distanceToAirport: 1.2,
    });

    expect(ids(sortParkingOptionsForMode([slowerEleven, fasterThirteen], 'cheapest'))).toEqual([
      'faster-thirteen',
      'slower-eleven',
    ]);
    expect(ids(sortParkingOptionsForMode([fartherTwelve, closerTwelve], 'cheapest'))).toEqual([
      'closer-twelve',
      'farther-twelve',
    ]);
  });

  test('cheapest keeps actual prices ahead of estimated range and check-live prices', () => {
    const actual = lot({
      id: 'actual',
      price: 20,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 12,
    });
    const estimatedRange = lot({
      id: 'estimated-range',
      price: 10,
      priceMin: 9,
      priceMax: 12,
      priceDisplay: 'estimated',
      priceConfidence: 'low',
      originToParkingMinutes: 4,
    });
    const checkLive = lot({
      id: 'check-live',
      price: 1,
      priceDisplay: 'check-live',
      originToParkingMinutes: 3,
    });

    const sorted = sortParkingOptionsForMode([checkLive, estimatedRange, actual], 'cheapest');
    expect(ids(sorted)).toEqual(['actual', 'estimated-range', 'check-live']);
  });

  test('cheapest does not let missing time beat known short time when price is tied', () => {
    const missingTime = lot({
      id: 'missing-time',
      price: 11,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      walkingMinutes: 1,
      distanceToAirport: 0.1,
    });
    const knownShortTime = lot({
      id: 'known-short-time',
      price: 11,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 7,
      walkingMinutes: 2,
    });

    const sorted = sortParkingOptionsForMode([missingTime, knownShortTime], 'cheapest');
    expect(ids(sorted)).toEqual(['known-short-time', 'missing-time']);
  });

  test('fastest puts lowest totalTimeToTerminalMinutes first, not proximity', () => {
    const slow = lot({
      id: 'slow',
      distance: 1,
      originToParkingMinutes: 30,
      transferType: 'shuttle',
      shuttleWaitMinutes: 8,
      transferToTerminalMinutes: 12,
      walkingMinutes: 3,
      bufferRiskMinutes: 5,
    });
    const fast = lot({
      id: 'fast',
      distance: 12,
      originToParkingMinutes: 20,
      transferType: 'walk',
      transferToTerminalMinutes: 3,
      walkingMinutes: 3,
      parkingBufferMinutes: 5,
    });
    const mid = lot({ id: 'mid', distance: 6, originToParkingMinutes: 15, walkingMinutes: 5 });

    const sorted = sortParkingOptionsForMode([slow, mid, fast], 'fastest');
    expect(ids(sorted)).toEqual(['mid', 'fast', 'slow']);
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

  test('easiest prefers high-confidence live price over close untrusted option', () => {
    const trustedFar = lot({
      id: 'trusted-live',
      trustStatus: 'live',
      priceDisplay: 'live',
      pricingConfidence: 'live',
      sourceLink: 'https://book.example',
      originToParkingMinutes: 18,
      walkingMinutes: 6,
    });
    const untrustedClose = lot({
      id: 'untrusted-close',
      trustStatus: 'estimated',
      priceDisplay: 'estimated',
      priceConfidence: 'low',
      originToParkingMinutes: 6,
      walkingMinutes: 3,
    });

    const sorted = sortParkingOptionsForMode([untrustedClose, trustedFar], 'easiest');
    expect(ids(sorted)).toEqual(['trusted-live', 'untrusted-close']);
  });

  test('cheapest does not award badge to estimated range when live exact exists', () => {
    const liveExact = lot({
      id: 'live',
      price: 30,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      sourceLink: 'https://book.example',
    });
    const estimatedRange = lot({
      id: 'estimated',
      price: 20,
      priceMin: 18,
      priceMax: 28,
      priceDisplay: 'estimated',
      priceConfidence: 'low',
    });

    const sorted = sortParkingOptionsForMode([estimatedRange, liveExact], 'cheapest');
    expect(sorted[0]?.id).toBe('live');
  });

  test('cheapest prefers reliable live price when totals are close', () => {
    const vagueCheap = lot({
      id: 'vague',
      price: 25,
      priceDisplay: 'estimated',
      priceConfidence: 'low',
      originToParkingMinutes: 8,
    });
    const liveClose = lot({
      id: 'live',
      price: 25,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      sourceLink: 'https://book.example',
      originToParkingMinutes: 8,
    });

    expect(compareParkingByCheapest(liveClose, vagueCheap)).toBeLessThan(0);
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

  test('parkingRankExplanation matches sort intent', () => {
    const option = lot({
      id: 'ranked',
      price: 20,
      originToParkingMinutes: 10,
      walkingMinutes: 4,
      trustStatus: 'live',
      priceDisplay: 'live',
      pricingConfidence: 'live',
    });

    expect(parkingRankExplanation(option, 'cheapest')).toContain('Lowest reliable live total');
    expect(parkingRankExplanation(option, 'fastest')).toContain('door-to-terminal');
    expect(parkingRankExplanation(option, 'easiest')).toContain('Lowest-stress');
    expect(parkingRankExplanation(option, 'best')).toContain('Weighted balance');
  });
});
