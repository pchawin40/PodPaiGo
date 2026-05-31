import { rankAccessOptions } from '../rankAccessOptions';
import type { AccessStrategyOption } from '../types';
import type { TripData } from '../../types';

describe('rankAccessOptions', () => {
  const trip: TripData = {
    type: 'one-way-departure',
    origin: 'Seattle, WA',
    destination: 'SEA',
    airportCode: 'SEA',
    departureDate: '2026-06-01',
    departureTime: '08:00',
    parkingDuration: 24 * 60,
  };

  function option(
    id: string,
    totalMin: number,
    totalMax: number,
    minutes: number,
  ): AccessStrategyOption {
    return {
      id,
      airportCode: 'SEA',
      displayName: id,
      strategyType: 'park_and_ride_transit',
      sourceKind: 'curated',
      pricing: {
        total: { min: totalMin, max: totalMax, currency: 'USD' },
        unit: 'trip_total',
        confidence: 'estimated',
        breakdown: {},
        displayPrimary: `Estimated $${totalMin}–$${totalMax} total`,
      },
      timing: {
        terminalReadyMinutes: minutes,
        assumptions: [],
      },
      easeScore: 60,
      stressScore: 40,
      confidenceScore: 55,
      explanation: 'test',
      sourceNotes: 'test',
      isHiddenGem: true,
    };
  }

  test('ranks lower cost options higher', () => {
    const ranked = rankAccessOptions(
      [option('expensive', 40, 50, 70), option('cheap', 6, 12, 80)],
      trip,
    );

    expect(ranked.options[0].id).toBe('cheap');
    expect(ranked.topPickId).toBe('cheap');
  });

  test('downranks overnight caveat options on long trips', () => {
    const overnightTrip: TripData = {
      ...trip,
      parkingDuration: 3 * 24 * 60,
    };

    const withCaveat = {
      ...option('northgate', 6, 12, 80),
      overnightCaveat: 'Verify overnight rules',
    };
    const withoutCaveat = option('official-ish', 25, 30, 50);

    const ranked = rankAccessOptions([withCaveat, withoutCaveat], overnightTrip);
    expect(ranked.options[0].id).toBe('official-ish');
  });
});
