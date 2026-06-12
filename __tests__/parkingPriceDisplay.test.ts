import {
  canDisplayParkingPrice,
  getParkingDailyPrice,
  getParkingTotalPrice,
  parkingPriceLine,
} from '../lib/parking/priceDisplay';
import { ParkingOption, TripData } from '../lib/types';

const sevenDayTrip: TripData = {
  type: 'one-way-departure',
  origin: 'Monroe, WA',
  destination: 'SEA',
  airportCode: 'SEA',
  departureDate: '2026-06-01',
  departureTime: '12:00',
  parkingDuration: 7 * 24 * 60,
};

const threeDayTrip: TripData = {
  ...sevenDayTrip,
  parkingDuration: 3 * 24 * 60,
};

const oneDayTrip: TripData = {
  ...sevenDayTrip,
  parkingDuration: 24 * 60,
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

describe('parking price display', () => {
  test('Google Places fallback shows a dollar range with final-on-provider confidence', () => {
    const option = parkingOption({
      name: 'Extra Car',
      price: 30,
      priceUnit: 'per-day',
      priceDisplay: 'check-live',
      priceSource: 'google-places',
      priceConfidence: 'low',
      sourceName: 'Google Places',
      priceNote: 'Nearby listing found; confirm price with provider.',
    });

    expect(getParkingDailyPrice(option, sevenDayTrip)).toBeGreaterThan(0);
    expect(getParkingTotalPrice(option, sevenDayTrip)).toBeGreaterThan(0);
    expect(canDisplayParkingPrice(option)).toBe(true);

    const line = parkingPriceLine(option, sevenDayTrip);
    expect(line.primary).toMatch(/\$/);
    expect(line.primary).not.toContain('Check live');
    expect(line.confidence).toBe('final_on_provider');
  });

  test('$210 official known total for 7 days displays total primary and daily secondary', () => {
    const option = parkingOption({
      type: 'official',
      price: 210,
      priceUnit: 'total',
      priceDisplay: 'estimated',
      priceConfidence: 'medium',
      priceSource: 'official-rate',
    });

    expect(getParkingDailyPrice(option, sevenDayTrip)).toBe(30);
    expect(getParkingTotalPrice(option, sevenDayTrip)).toBe(210);
    expect(canDisplayParkingPrice(option)).toBe(true);

    const line = parkingPriceLine(option, sevenDayTrip);
    expect(line.primary).toContain('$210 total');
    expect(line.secondary).toContain('Based on $30/day × 7 days');
    expect(line.confidence).toBe('official');
  });

  test('check-live with no price displays check live price without a fake estimate', () => {
    const option = parkingOption({
      price: 0,
      priceDisplay: 'check-live',
      priceUnit: undefined,
      priceNote: 'Open provider to confirm current price.',
    });

    const line = parkingPriceLine(option, sevenDayTrip);
    expect(line.primary).toBe('Check live price');
    expect(line.secondary).toBe('Provider controls final price.');
  });

  test('range headline uses provider rate range copy instead of single daily basis', () => {
    const option = parkingOption({
      name: 'Provider Garage',
      price: 18,
      priceUnit: 'per-day',
      priceDisplay: 'estimated',
      priceSource: 'estimated',
      pricingConfidence: 'estimated',
      priceConfidence: 'medium',
    });

    const line = parkingPriceLine(option, oneDayTrip);
    expect(line.primary).toMatch(/^Estimated \$\d+–\$\d+ total$/);
    expect(line.secondary).toBe(
      'Based on provider rate range for 1 day. Final price controlled by provider.',
    );
    expect(line.secondary).not.toContain('$18/day');
    expect(line.secondary).not.toContain('/day ×');
  });

  test('exact total estimate can show daily price math', () => {
    const option = parkingOption({
      name: 'Exact Estimate Garage',
      price: 54,
      priceUnit: 'total',
      priceDisplay: 'estimated',
      priceSource: 'estimated',
      priceConfidence: 'medium',
    });

    const line = parkingPriceLine(option, threeDayTrip);
    expect(line.primary).toBe('Estimated $54 total');
    expect(line.secondary).toBe(
      'Based on $18/day × 3 days. Final price controlled by provider.',
    );
  });

  test('official price range is explained as an official daily rate range', () => {
    const option = parkingOption({
      name: 'SEA Airport Garage',
      type: 'official',
      price: 0,
      priceMin: 12,
      priceMax: 28,
      priceUnit: 'per-day',
      priceSource: 'official-rate',
    });

    const line = parkingPriceLine(option, sevenDayTrip);
    expect(line.confidence).toBe('official');
    expect(line.primary).toContain('Estimated');
    expect(line.primary).toContain('$84–$196 total');
    expect(line.primary).not.toMatch(/^Official/);
    expect(line.badge).toBe('Official rate range');
    expect(line.secondary).toBe(
      'Based on official daily rate range for 7 days. Final price depends on the garage and rate selected.',
    );
  });

  test('provider-linked explicit range uses provider rate range copy', () => {
    const option = parkingOption({
      name: 'Provider Range Garage',
      price: 18,
      priceMin: 12,
      priceMax: 24,
      priceUnit: 'per-day',
      priceDisplay: 'estimated',
      priceSource: 'estimated',
      pricingConfidence: 'estimated',
    });

    const line = parkingPriceLine(option, oneDayTrip);
    expect(line.primary).toBe('Estimated $12–$24 total');
    expect(line.secondary).toBe(
      'Based on provider rate range for 1 day. Final price controlled by provider.',
    );
    expect(line.secondary).not.toContain('$18/day');
  });

  test('official known daily rate still displays', () => {
    const option = parkingOption({
      name: 'SEA General Parking',
      type: 'official',
      price: 37,
      priceUnit: 'per-day',
      priceDisplay: 'estimated',
      priceSource: 'official-rate',
      priceConfidence: 'medium',
      trustStatus: 'verified-source',
    });

    expect(canDisplayParkingPrice(option)).toBe(true);
    const line = parkingPriceLine(option, sevenDayTrip);
    expect(line.primary).toContain('$259 total');
    expect(line.secondary).toContain('Based on $37/day × 7 days');
    expect(line.confidence).toBe('official');
  });

  test('real ParkWhiz selected-date total still displays', () => {
    const option = parkingOption({
      name: 'ParkWhiz Lot',
      price: 210,
      priceUnit: 'total',
      priceDisplay: 'live',
      priceSource: 'parkwhiz-live',
      bookingProvider: 'ParkWhiz',
      priceConfidence: 'high',
      trustStatus: 'live',
    });

    const line = parkingPriceLine(option, sevenDayTrip);

    expect(canDisplayParkingPrice(option)).toBe(true);
    expect(line.primary).toContain('$');
    expect(line.secondary).not.toContain('$1470');
    expect(line.secondary).toBe('Live price from ParkWhiz. Confirm details before checkout.');
    expect(line.confidence).toBe('live');
  });

  test('real APR selected-date per-day price still displays', () => {
    const option = parkingOption({
      name: 'APR Lot',
      price: 30,
      priceUnit: 'per-day',
      priceDisplay: 'from-per-day',
      priceSource: 'marketplace-link',
      bookingProvider: 'AirportParkingReservations',
      priceConfidence: 'medium',
      trustStatus: 'live',
    });

    expect(canDisplayParkingPrice(option)).toBe(true);
    const line = parkingPriceLine(option, sevenDayTrip);
    expect(line.primary).toBe('From $30/day');
    expect(line.secondary).toBe('Cached/provider-linked price. Confirm final price with provider.');
    expect(line.confidence).toBe('live');
  });
});
