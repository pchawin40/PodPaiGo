import { buildParkingPriorityBadges } from '../priorityBadges';
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

describe('priorityBadges', () => {
  test('shows Cheapest only for lowest reliable live total', () => {
    const liveCheap = lot({
      id: 'live-cheap',
      price: 40,
      priceUnit: 'total',
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 10,
    });
    const liveHigher = lot({
      id: 'live-higher',
      price: 55,
      priceUnit: 'total',
      priceDisplay: 'live',
      pricingConfidence: 'live',
      originToParkingMinutes: 8,
    });
    const estimatedLower = lot({
      id: 'estimated',
      price: 20,
      priceUnit: 'per-day',
      priceDisplay: 'estimated',
      priceConfidence: 'low',
      originToParkingMinutes: 6,
    });

    const peers = [liveCheap, liveHigher, estimatedLower];

    expect(
      buildParkingPriorityBadges({
        option: liveCheap,
        mode: 'cheapest',
        peers,
      }).some((badge) => badge.label === 'Cheapest'),
    ).toBe(true);

    expect(
      buildParkingPriorityBadges({
        option: estimatedLower,
        mode: 'cheapest',
        peers,
      }).some((badge) => badge.label === 'Cheapest'),
    ).toBe(false);

    expect(
      buildParkingPriorityBadges({
        option: estimatedLower,
        mode: 'cheapest',
        peers,
      }).some((badge) => badge.label === 'Estimated range'),
    ).toBe(true);
  });

  test('limits visible badges to four', () => {
    const option = lot({
      price: 0,
      validationStatus: 'free',
      trustStatus: 'live',
      priceDisplay: 'live',
      pricingConfidence: 'live',
      reviewScore: 4.8,
      reviewCount: 120,
      walkingMinutes: 4,
      transferType: 'walk',
      originToParkingMinutes: 8,
    });

    expect(
      buildParkingPriorityBadges({
        option,
        mode: 'easiest',
        peers: [option],
        maxBadges: 4,
      }).length,
    ).toBeLessThanOrEqual(4);
  });
});
