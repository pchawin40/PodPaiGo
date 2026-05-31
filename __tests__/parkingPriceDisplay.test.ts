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
    expect(line.secondary).toContain('$30/day for 7 days');
    expect(line.confidence).toBe('official');
  });

  test('check-live with no price displays estimated total and daily band', () => {
    const option = parkingOption({
      price: 0,
      priceDisplay: 'check-live',
      priceUnit: undefined,
      priceNote: 'Open provider to confirm current price.',
    });

    const line = parkingPriceLine(option, sevenDayTrip);
    expect(line.primary).toContain('Estimated');
    expect(line.primary).toContain('total');
    expect(line.primary).toMatch(/\$/);
    expect(line.secondary).toContain('/day for 7 days');
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
    expect(line.secondary).toContain('$37/day for 7 days');
    expect(line.confidence).toBe('official');
  });

  test('real ParkWhiz selected-date total still displays', () => {
    const option = parkingOption({
      name: 'ParkWhiz Lot',
      price: 210,
      priceUnit: 'total',
      priceDisplay: 'live',
      priceSource: 'marketplace-link',
      bookingProvider: 'ParkWhiz',
      priceConfidence: 'high',
      trustStatus: 'live',
    });

    const line = parkingPriceLine(option, sevenDayTrip);

    expect(canDisplayParkingPrice(option)).toBe(true);
    expect(line.primary).toContain('$');
    expect(line.secondary).not.toContain('$1470');
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
    expect(line.primary).toContain('$');
    expect(line.confidence).toBe('live');
  });
});
