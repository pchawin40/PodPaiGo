import {
  confidenceToScore,
  deriveParkingDailyRange,
  deriveParkingTotalRange,
  formatParkingPriceLine,
  formatPricingConfidenceLabel,
  pricingConfidenceBadgeClass,
  resolvePricingConfidence,
  canDisplayParkingPrice,
  getParkingDailyFromRange,
  getParkingTotalFromRange,
  DEFAULT_UNKNOWN_DAILY_RANGE,
} from '../pricingLadder';
import type { ParkingOption, TripData } from '../../types';
import type { PricingConfidenceLabel } from '../types';

describe('pricingLadder', () => {
  const sevenDayTrip: TripData = {
    type: 'one-way-departure',
    origin: 'Monroe, WA',
    destination: 'SEA',
    airportCode: 'SEA',
    departureDate: '2026-06-01',
    departureTime: '12:00',
    parkingDuration: 7 * 24 * 60,
  };

  function parkingOption(overrides: Partial<ParkingOption>): ParkingOption {
    return {
      id: 'test-parking',
      name: 'Test Parking',
      type: 'off-airport',
      price: 0,
      distance: 10,
      availability: 50,
      trustStatus: 'estimated',
      sourceName: 'Test',
      lastUpdated: '2026-05-13T00:00:00.000Z',
      assumptions: [],
      ...overrides,
    };
  }

  test('Google Places fallback shows estimated dollar range instead of check-live', () => {
    const option = parkingOption({
      name: 'Extra Car',
      price: 30,
      priceUnit: 'per-day',
      priceDisplay: 'check-live',
      priceSource: 'google-places',
      priceConfidence: 'low',
      sourceName: 'Google Places',
    });

    expect(canDisplayParkingPrice(option)).toBe(true);
    expect(resolvePricingConfidence(option)).toBe('final_on_provider');

    const line = formatParkingPriceLine(option, sevenDayTrip);
    expect(line.primary).toMatch(/\$/);
    expect(line.primary).not.toContain('Check live');
    expect(line.confidence).toBe('final_on_provider');
  });

  test('missing price uses default estimated daily band', () => {
    const option = parkingOption({
      price: 0,
      priceDisplay: 'check-live',
    });

    const daily = deriveParkingDailyRange(option);
    expect(daily.min).toBe(DEFAULT_UNKNOWN_DAILY_RANGE.min);
    expect(daily.max).toBe(DEFAULT_UNKNOWN_DAILY_RANGE.max);

    const line = formatParkingPriceLine(option, sevenDayTrip);
    expect(line.primary).toContain('Estimated');
    expect(line.primary).toMatch(/\$/);
  });

  test('official rate maps to Official confidence', () => {
    const option = parkingOption({
      type: 'official',
      price: 37,
      priceUnit: 'per-day',
      priceDisplay: 'estimated',
      priceSource: 'official-rate',
    });

    expect(resolvePricingConfidence(option)).toBe('official');
    expect(formatPricingConfidenceLabel('official')).toBe('Official');
  });

  test('live ParkWhiz quote maps to Live confidence', () => {
    const option = parkingOption({
      price: 210,
      priceUnit: 'total',
      priceDisplay: 'live',
      priceSource: 'parkwhiz-live',
      bookingProvider: 'ParkWhiz',
      trustStatus: 'live',
    });

    expect(resolvePricingConfidence(option)).toBe('live');
    expect(getParkingTotalFromRange(option, sevenDayTrip)).toBe(210);
  });

  test('recent snapshot maps to Recent confidence', () => {
    const option = parkingOption({
      price: 28,
      priceUnit: 'per-day',
      priceDisplay: 'from-per-day',
      priceFreshness: 'recent',
      providerSource: 'snapshot',
      fetchedAt: new Date().toISOString(),
    });

    expect(resolvePricingConfidence(option)).toBe('recent');
  });

  test('confidence badge classes cover all ladder labels', () => {
    const labels: PricingConfidenceLabel[] = [
      'live',
      'recent',
      'official',
      'estimated',
      'final_on_provider',
    ];

    for (const label of labels) {
      expect(pricingConfidenceBadgeClass(label)).toMatch(/border-/);
      expect(formatPricingConfidenceLabel(label).length).toBeGreaterThan(0);
    }
  });

  test('getParkingDailyFromRange returns midpoint for ranged prices', () => {
    const option = parkingOption({
      price: 30,
      priceUnit: 'per-day',
      priceDisplay: 'check-live',
      priceSource: 'google-places',
    });

    expect(getParkingDailyFromRange(option, sevenDayTrip)).toBeGreaterThan(0);
    expect(getParkingTotalFromRange(option, sevenDayTrip)).toBeGreaterThan(0);
  });
});
