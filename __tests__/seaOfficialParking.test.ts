import { buildSeaOfficialParkingOptions } from '../lib/parking/seaOfficialParking';
import { sortParkingOptionsForMode } from '../lib/parking/sortParkingOptions';
import type { ParkingOption, TripData } from '../lib/types';

const seaTrip: TripData = {
  type: 'round-trip',
  origin: 'Seattle, WA',
  destination: 'SEA Airport',
  destinationKind: 'airport',
  airportCode: 'SEA',
  departureDate: '2026-06-01',
  departureTime: '09:00',
  returnDate: '2026-06-03',
  returnTime: '09:00',
  parkingDuration: 2 * 24 * 60,
};

function offSiteLot(overrides: Partial<ParkingOption> = {}): ParkingOption {
  return {
    id: 'offsite',
    name: 'Budget Shuttle Lot',
    serviceAirportCode: 'SEA',
    type: 'off-airport',
    price: 24,
    priceUnit: 'total',
    priceDisplay: 'live',
    pricingConfidence: 'live',
    distance: 12,
    availability: 90,
    trustStatus: 'live',
    sourceName: 'Test lot',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    assumptions: [],
    originToParkingMinutes: 10,
    parkingBufferMinutes: 6,
    shuttleWaitMinutes: 8,
    transferToTerminalMinutes: 12,
    transferType: 'shuttle',
    walkingMinutes: 3,
    ...overrides,
  };
}

describe('SEA official parking', () => {
  test('includes official General and Reserved garage products with published-rate totals', () => {
    const options = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    });

    expect(options.map((option) => option.name)).toEqual([
      'SEA General Parking',
      'SEA Reserved Parking / Terminal Direct',
    ]);
    expect(options.map((option) => option.price)).toEqual([74, 94]);
    expect(options.every((option) => option.priceSource === 'official-rate')).toBe(true);
    expect(options.every((option) => option.priceUnit === 'total')).toBe(true);
    expect(options.every((option) => option.activeRate?.sourceName === 'Port of Seattle')).toBe(true);
  });

  test('fastest sorting can rank official terminal parking ahead of a cheaper shuttle lot', () => {
    const official = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    }).map((option) => ({
      ...option,
      originToParkingMinutes: 12,
      routeToParkingMinutes: 12,
    }));

    const sorted = sortParkingOptionsForMode([...official, offSiteLot()], 'fastest', {
      tripData: seaTrip,
    });

    expect(sorted[0]?.name).toBe('SEA Reserved Parking / Terminal Direct');
    expect(sorted[0]?.type).toBe('official');
    expect(sorted[sorted.length - 1]?.name).toBe('Budget Shuttle Lot');
  });
});
