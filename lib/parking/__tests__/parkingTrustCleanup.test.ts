import { calculateParkingDuration } from '../../domain';
import { normalizeParkingLotName } from '../googlePlaceMatchUtils';
import { validateParkingInventoryOption } from '../inventoryValidation';
import { buildParkingProviderHandoff } from '../providerHandoff';
import { resolveParkingPriceTrust } from '../priceTrust';
import { parkingPriceLine } from '../priceDisplay';
import type { ParkingOption, TripData } from '../../types';

function baseParking(overrides: Partial<ParkingOption> = {}): ParkingOption {
  return {
    id: 'lot',
    name: 'Park N Jet Lot 1',
    type: 'off-airport',
    price: 22,
    priceDisplay: 'check-live',
    priceUnit: 'per-day',
    priceSource: 'direct-lot-rate',
    priceConfidence: 'medium',
    distance: 12,
    availability: 70,
    trustStatus: 'estimated',
    sourceName: 'Inventory',
    sourceLink: 'https://airportparkingreservations.com/example-lot',
    address: '18220 International Blvd, SeaTac, WA',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    assumptions: [],
    ...overrides,
  };
}

const ROUND_TRIP: TripData = {
  type: 'round-trip',
  origin: 'Monroe, WA',
  destination: 'Seattle-Tacoma International Airport',
  destinationKind: 'airport',
  airportCode: 'SEA',
  departureDate: '2026-11-13',
  departureTime: '06:00',
  returnDate: '2026-11-15',
  returnTime: '20:00',
  parkingCheckInDate: '2026-11-13',
  parkingCheckInTime: '06:00',
  parkingCheckOutDate: '2026-11-15',
  parkingCheckOutTime: '20:00',
};

describe('parking trust cleanup helpers', () => {
  test('estimated range is labeled as estimated and tells user to confirm provider', () => {
    const option = baseParking({
      priceDisplay: 'estimated',
      priceMin: 24,
      priceMax: 56,
      priceUnit: 'total',
    });

    const line = parkingPriceLine(option, ROUND_TRIP);
    const trust = resolveParkingPriceTrust(option, ROUND_TRIP);

    expect(line.primary).toMatch(/^Estimated/);
    expect(line.secondary).toMatch(/provider rate range/);
    expect(line.secondary).toMatch(/Final price controlled by provider/);
    expect(trust.kind).toBe('estimated_range');
    expect(trust.disclosure).toMatch(/Confirm at provider/);
  });

  test('live ParkWhiz total is a live marketplace price, not an estimate', () => {
    const option = baseParking({
      sourceName: 'ParkWhiz',
      bookingProvider: 'ParkWhiz',
      price: 112.48,
      priceDisplay: 'live',
      priceUnit: 'total',
      pricingConfidence: 'live',
      trustStatus: 'live',
    });

    expect(resolveParkingPriceTrust(option, ROUND_TRIP).kind).toBe('live_marketplace_price');
  });

  test('6 AM to 8 PM parking window preserves selected duration and APR dates', () => {
    expect(calculateParkingDuration(ROUND_TRIP)).toBe(62 * 60);

    const handoff = buildParkingProviderHandoff(baseParking(), ROUND_TRIP);

    expect(handoff.window).toMatchObject({
      checkInDate: '2026-11-13',
      checkInTime: '06:00',
      checkOutDate: '2026-11-15',
      checkOutTime: '20:00',
      durationMinutes: 62 * 60,
    });
    expect(handoff.copySummary).toContain('Check-in: 2026-11-13 06:00');
    expect(handoff.copySummary).toContain('Check-out: 2026-11-15 20:00');
    expect(handoff.providerUrl).toContain('checkindate=November+13%2C+2026');
    expect(handoff.providerUrl).toContain('checkoutdate=November+15%2C+2026');
  });

  test('filters generic marketplace and pickup rows but keeps real SEA lots', () => {
    expect(
      validateParkingInventoryOption(
        baseParking({
          id: 'sea-spothero',
          name: 'SpotHero SEA Parking',
          sourceName: 'SpotHero',
          bookingProvider: 'SpotHero',
          sourceLink: 'https://spothero.com/airport-parking/',
          address: undefined,
        }),
      ),
    ).toMatchObject({ valid: false, reason: 'filtered_generic_marketplace' });

    expect(
      validateParkingInventoryOption(
        baseParking({
          id: 'pickup',
          name: 'SeaTac/Airport Station Passenger Pick-Up',
          address: 'SeaTac Airport Station',
        }),
      ),
    ).toMatchObject({ valid: false, reason: 'filtered_pickup_dropoff' });

    expect(validateParkingInventoryOption(baseParking({ name: 'ShuttlePark2' })).valid).toBe(true);
    expect(validateParkingInventoryOption(baseParking({ name: 'Park N Jet Lot 1' })).valid).toBe(true);
  });

  test('ShuttlePark2 normalizes for Google review matching', () => {
    expect(normalizeParkingLotName('ShuttlePark2')).toBe('shuttlepark 2');
    expect(normalizeParkingLotName('ShuttlePark 2')).toBe('shuttlepark 2');
  });
});
