import { formatParkingPriceLine } from '../../access/pricingLadder';
import {
  compareParkingByCheapest,
  parkingRankExplanation,
} from '../sortParkingOptions';
import {
  getParkingPriceTier,
  qualifiesForCheapestBadge,
} from '../priceReliability';
import type { ParkingOption, TripData } from '../../types';

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

const trip: TripData = {
  type: 'one-way-departure',
  origin: 'Monroe, WA',
  destination: 'SEA',
  airportCode: 'SEA',
  departureDate: '2026-06-01',
  departureTime: '12:00',
  parkingDuration: 7 * 24 * 60,
};

describe('priceReliability and display priority', () => {
  test('price display prefers live exact over estimated range', () => {
    const live = lot({
      price: 53,
      priceUnit: 'total',
      priceDisplay: 'live',
      pricingConfidence: 'live',
      bookingProvider: 'ParkWhiz',
    });
    const estimated = lot({
      price: 20,
      priceUnit: 'per-day',
      priceDisplay: 'estimated',
      priceConfidence: 'low',
    });

    expect(formatParkingPriceLine(live, trip).primary).toBe('Live $53 total');
    expect(formatParkingPriceLine(estimated, trip).primary).toContain('Estimated');
    expect(formatParkingPriceLine(estimated, trip).badge).toBe('Estimated range');
  });

  test('estimated range does not beat exact live in cheapest compare', () => {
    const live = lot({
      id: 'live',
      price: 53,
      priceUnit: 'total',
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 12,
    });
    const estimated = lot({
      id: 'estimated',
      price: 18,
      priceUnit: 'per-day',
      priceDisplay: 'estimated',
      priceConfidence: 'low',
      originToParkingMinutes: 8,
    });

    expect(compareParkingByCheapest(live, estimated, trip)).toBeLessThan(0);
    expect(getParkingPriceTier(live, trip)).toBe('live_exact');
    expect(getParkingPriceTier(estimated, trip)).toBe('estimated_range');
  });

  test('Cheapest badge only on lowest reliable exact/live/official', () => {
    const live = lot({
      id: 'live',
      price: 45,
      priceUnit: 'total',
      priceDisplay: 'live',
      pricingConfidence: 'live',
    });
    const official = lot({
      id: 'official',
      type: 'official',
      price: 50,
      priceUnit: 'total',
      priceDisplay: 'estimated',
      priceSource: 'official-rate',
    });
    const estimated = lot({
      id: 'estimated',
      price: 15,
      priceUnit: 'per-day',
      priceDisplay: 'estimated',
      priceConfidence: 'low',
    });

    const peers = [live, official, estimated];

    expect(qualifiesForCheapestBadge({ option: live, peers, tripData: trip })).toBe(true);
    expect(qualifiesForCheapestBadge({ option: official, peers, tripData: trip })).toBe(false);
    expect(qualifiesForCheapestBadge({ option: estimated, peers, tripData: trip })).toBe(false);
    expect(parkingRankExplanation(live, 'cheapest', trip, peers)).toContain(
      'Lowest reliable live total',
    );
  });

  test('uses explicit total when route flag is unavailable', () => {
    const { parkingTimeBreakdown } = require('../routeDisplay');
    const option = lot({
      routeUnavailable: true,
      duration: 42,
      originToParkingMinutes: 0,
    });

    const breakdown = parkingTimeBreakdown(option);
    expect(breakdown.totalMinutes).toBe(42);
    expect(breakdown.parts[0]?.label).toBe('Total time');
  });
});
