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
  test('Google Places fallback placeholder price does not display a dollar amount', () => {
    const option = parkingOption({
      name: 'Extra Car',
      price: 30,
      priceUnit: 'per-day',
      priceDisplay: 'from-per-day',
      priceSource: 'google-places',
      priceConfidence: 'low',
      sourceName: 'Google Places',
      priceNote: 'Nearby listing found; confirm price with provider.',
    });

    expect(getParkingDailyPrice(option, sevenDayTrip)).toBe(30);
    expect(getParkingTotalPrice(option, sevenDayTrip)).toBe(210);
    expect(canDisplayParkingPrice(option)).toBe(false);
    expect(parkingPriceLine(option, sevenDayTrip)).toEqual({
      primary: 'Check live price',
      secondary: 'Nearby listing found; confirm price with provider.',
    });
  });

  test('$210 official known total for 7 days displays daily equivalent and $210 total', () => {
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
    expect(parkingPriceLine(option, sevenDayTrip)).toEqual({
      primary: 'Est. $30/day',
      secondary: 'Est. total: $210 for 7 day(s)',
    });
  });

  test('check-live with no price displays check live price', () => {
    const option = parkingOption({
      price: 0,
      priceDisplay: 'check-live',
      priceUnit: undefined,
      priceNote: 'Open provider to confirm current price.',
    });

    expect(parkingPriceLine(option, sevenDayTrip)).toEqual({
      primary: 'Check live price',
      secondary: 'Open provider to confirm current price.',
    });
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
    expect(parkingPriceLine(option, sevenDayTrip)).toEqual({
      primary: 'Est. $37/day',
      secondary: 'Est. total: $259 for 7 day(s)',
    });
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
    expect(line.primary).toBe('$30/day');
    expect(line.secondary).toBe('Total: $210 for 7 day(s)');
    expect(line.secondary).not.toContain('$1470');
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
    expect(parkingPriceLine(option, sevenDayTrip)).toEqual({
      primary: 'From $30/day',
      secondary: 'Est. total: $210 for 7 day(s)',
    });
  });
});
