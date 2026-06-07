import {
  getSeasonalClimateGuidance,
  seasonalClimateSummary,
} from '../seasonalClimate';

describe('seasonalClimate', () => {
  test('returns SEA November rainy guidance for far-future dates', () => {
    const guidance = getSeasonalClimateGuidance({
      airportCode: 'SEA',
      targetDate: '2026-11-15',
    });

    expect(guidance).not.toBeNull();
    expect(guidance?.title).toContain('Typical November weather near SEA');
    expect(guidance?.historicalLabel).toBe('Historical / seasonal');
    expect(guidance?.raininess.toLowerCase()).toContain('rain');
    expect(guidance?.disclaimer).toContain('Seasonal guidance only');
    expect(guidance?.weatherImpact.parkingScoreAdjustments.coveredBonus).toBeGreaterThan(0);
  });

  test('returns summer drier guidance for July trips', () => {
    const guidance = getSeasonalClimateGuidance({
      airportCode: 'SEA',
      targetDate: '2026-07-10',
    });

    expect(guidance?.raininess.toLowerCase()).toContain('driest');
    expect(seasonalClimateSummary(guidance!)).toContain('°F');
  });

  test('returns null for unsupported airports', () => {
    expect(
      getSeasonalClimateGuidance({ airportCode: 'LAX', targetDate: '2026-11-15' }),
    ).toBeNull();
  });
});
