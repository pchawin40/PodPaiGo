import {
  buildSeaOfficialParkingOptions,
  BROKEN_SEA_OFFICIAL_SOURCE_URL,
  SEA_GENERAL_PARKING_INFO_URL,
  SEA_RESERVED_BOOKING_URL,
  SEA_RESERVED_INFO_URL,
} from '../lib/parking/seaOfficialParking';
import { resolveOfficialSeaGarageCtas } from '../lib/parking/officialAirportGarageGroup';
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

  test('official SEA URLs are canonical and never use the broken flysea path', () => {
    const options = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    });

    const urls = options.flatMap((option) => [
      option.sourceLink,
      ...(option.rateRules || []).map((rule) => rule.sourceUrl),
      option.activeRate?.sourceUrl,
    ]);

    for (const url of urls) {
      if (!url) continue;
      expect(url).not.toContain('/sea/sea-tac/parking/parking-information');
      expect(url).not.toBe(BROKEN_SEA_OFFICIAL_SOURCE_URL);
    }

    const general = options.find((option) => option.id === 'sea-general');
    const reserved = options.find((option) => option.id === 'sea-reserved');

    expect(general?.sourceLink).toBe(SEA_GENERAL_PARKING_INFO_URL);
    expect(reserved?.sourceLink).toBe(SEA_RESERVED_BOOKING_URL);
    expect(reserved?.activeRate?.sourceUrl).toBe(SEA_RESERVED_INFO_URL);
  });

  test('SEA Reserved CTA opens ReserveSEA booking URL', () => {
    const reserved = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    }).find((option) => option.id === 'sea-reserved');

    const ctas = resolveOfficialSeaGarageCtas(reserved!);
    expect(ctas.reserveLabel).toBe('Reserve official parking');
    expect(ctas.bookingUrl).toBe(SEA_RESERVED_BOOKING_URL);
    expect(ctas.isInfoOnly).toBe(false);
  });

  test('SEA General CTA uses Check official parking and Port info URL', () => {
    const general = buildSeaOfficialParkingOptions({
      airportCode: 'SEA',
      checkInAt: '2026-06-01T09:00',
      checkOutAt: '2026-06-03T09:00',
    }).find((option) => option.id === 'sea-general');

    const ctas = resolveOfficialSeaGarageCtas(general!);
    expect(ctas.reserveLabel).toBe('Check official parking');
    expect(ctas.bookingUrl).toBe(SEA_GENERAL_PARKING_INFO_URL);
    expect(ctas.isInfoOnly).toBe(true);
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
