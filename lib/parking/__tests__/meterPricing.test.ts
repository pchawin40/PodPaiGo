import { estimateSeattleStreetMeterPricing } from '../meterPricing';

describe('meterPricing', () => {
  test('Sunday Seattle street parking is free with source label', () => {
    const estimate = estimateSeattleStreetMeterPricing({
      destination: 'Capitol Hill, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '11:00',
      durationMinutes: 120,
    });

    expect(estimate).not.toBeNull();
    expect(estimate?.pricingKind).toBe('street_meter');
    expect(estimate?.costDisplay).toBe('Free');
    expect(estimate?.sourceLabel).toContain('Seattle');
  });

  test('weekday downtown Seattle returns meter estimate separate from garage', () => {
    const estimate = estimateSeattleStreetMeterPricing({
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
    });

    expect(estimate?.pricingKind).toBe('street_meter');
    expect(estimate?.costDisplay).toMatch(/~\$/);
    expect(estimate?.sourceLabel).toContain('meter estimate');
    expect(estimate?.warnings.some((warning) => /block and zone/i.test(warning))).toBe(true);
  });

  test('non-Seattle destinations return null', () => {
    expect(
      estimateSeattleStreetMeterPricing({
        destination: 'Downtown Monroe, WA',
        arrivalDate: '2026-06-02',
        arrivalTime: '10:00',
        durationMinutes: 120,
      }),
    ).toBeNull();
  });
});
