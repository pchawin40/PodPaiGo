import {
  formatQuickGoBestWayDisplayLabel,
  formatQuickGoBestWayPriceSuffix,
  resolveQuickGoProviderCta,
} from '../quickGoSummary';
import type { RankedRecommendation } from '../../domain';
import type { ParkingOption, TripData } from '../../types';

const tripData: TripData = {
  type: 'general-trip',
  origin: '123 Main Street, Example City, ST',
  destination: 'Brighton Jones, Seattle, WA',
  destinationName: 'Brighton Jones',
  destinationKind: 'general',
  arrivalDate: '2026-06-01',
  arrivalTime: '10:00',
};

function parkingRanked(option: Partial<ParkingOption> & Pick<ParkingOption, 'id' | 'name'>): RankedRecommendation {
  return {
    type: 'parking',
    option: {
      id: option.id,
      name: option.name,
      type: 'off-airport',
      price: option.price ?? 0,
      availability: 80,
      trustStatus: option.trustStatus ?? 'estimated',
      sourceName: option.sourceName ?? 'ParkWhiz',
      lastUpdated: '2026-06-01T00:00:00.000Z',
      assumptions: [],
      ...option,
    } as ParkingOption,
    score: 80,
    cost: option.price ?? 0,
    duration: 24,
    stressScore: 60,
    reasons: [],
  };
}

describe('quickGoSummary', () => {
  test('formats live parking price in best way label', () => {
    const ranked = parkingRanked({
      id: 'lot-1',
      name: '2120 5th Ave. Lot',
      price: 18,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      priceSource: 'parkwhiz-live',
      bookingProvider: 'ParkWhiz',
      trustStatus: 'live',
    });

    expect(formatQuickGoBestWayPriceSuffix(ranked.option as ParkingOption, tripData)).toBe('$18');
    expect(
      formatQuickGoBestWayDisplayLabel('Drive + park · 2120 5th Ave. Lot', ranked, tripData),
    ).toBe('Drive + park · 2120 5th Ave. Lot · $18');
  });

  test('formats estimated and range parking copy honestly', () => {
    const estimated = parkingRanked({
      id: 'lot-est',
      name: 'Centennial Garage',
      price: 18,
      priceDisplay: 'estimated',
      priceSource: 'google-places',
    });
    expect(formatQuickGoBestWayPriceSuffix(estimated.option as ParkingOption, tripData)).toBe(
      '~$18 est.',
    );

    const ranged = parkingRanked({
      id: 'lot-range',
      name: 'Airport Garage',
      price: 12,
      priceMin: 12,
      priceMax: 28,
      priceDisplay: 'estimated',
      priceSource: 'google-places',
    });
    expect(formatQuickGoBestWayPriceSuffix(ranged.option as ParkingOption, tripData)).toBe(
      '$12–$28 est.',
    );

    const checkLive = parkingRanked({
      id: 'lot-check',
      name: 'Unknown Lot',
      price: 0,
      priceDisplay: 'check-live',
      priceSource: 'marketplace-link',
    });
    expect(formatQuickGoBestWayPriceSuffix(checkLive.option as ParkingOption, tripData)).toBe(
      'Check live price',
    );
  });

  test('resolves provider CTA labels and hides when no source link exists', () => {
    const liveParkWhiz = parkingRanked({
      id: 'pw-live',
      name: '2120 5th Ave. Lot',
      price: 18,
      priceDisplay: 'live',
      pricingConfidence: 'live',
      priceSource: 'parkwhiz-live',
      bookingProvider: 'ParkWhiz',
      sourceLink: 'https://www.parkwhiz.com/lot/123',
      searchQuery: '2120 5th Ave parking Seattle',
      trustStatus: 'live',
    });
    expect(resolveQuickGoProviderCta(liveParkWhiz, tripData)?.label).toBe('Reserve parking');

    const spothero = parkingRanked({
      id: 'sh-1',
      name: 'Nearby lot',
      price: 20,
      bookingProvider: 'SpotHero',
      sourceLink: 'https://spothero.com/search?search=Seattle',
      searchQuery: 'Seattle parking',
    });
    expect(resolveQuickGoProviderCta(spothero, tripData)?.label).toBe('Compare parking');

    const apr = parkingRanked({
      id: 'apr-1',
      name: 'Airport lot',
      price: 42,
      bookingProvider: 'AirportParkingReservations',
      sourceLink: 'https://airportparkingreservations.com/lot',
      priceDisplay: 'from-per-day',
    });
    expect(resolveQuickGoProviderCta(apr, tripData)?.label).toBe('Check provider');

    const noLink = parkingRanked({
      id: 'none',
      name: 'No provider',
      price: 10,
    });
    expect(resolveQuickGoProviderCta(noLink, tripData)).toBeNull();
  });

  test('does not add price suffix for non-parking best options', () => {
    const rideshare: RankedRecommendation = {
      type: 'rideshare',
      option: {
        id: 'ride',
        name: 'UberX',
        duration: 20,
        price: 24,
        availability: 90,
        trustStatus: 'estimated',
        sourceName: 'Uber',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
      score: 70,
      cost: 24,
      duration: 20,
      stressScore: 50,
      reasons: [],
    };

    expect(formatQuickGoBestWayDisplayLabel('Rideshare / taxi', rideshare, tripData)).toBe(
      'Rideshare / taxi',
    );
    expect(resolveQuickGoProviderCta(rideshare, tripData)).toBeNull();
  });
});
