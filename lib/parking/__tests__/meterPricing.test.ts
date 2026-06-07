import { estimateSeattleStreetMeterPricing } from '../meterPricing';

describe('estimateSeattleStreetMeterPricing', () => {
  test('weekday paid hours return meter estimate', () => {
    const pricing = estimateSeattleStreetMeterPricing({
      destination: '1st Avenue, Seattle, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
    });

    expect(pricing).not.toBeNull();
    expect(pricing?.total).toBeGreaterThan(0);
    expect(pricing?.pricingKind).toBe('street_meter');
  });

  test('Sunday returns free street estimate', () => {
    const pricing = estimateSeattleStreetMeterPricing({
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '14:00',
      durationMinutes: 120,
    });

    expect(pricing?.costDisplay).toBe('Free');
    expect(pricing?.total).toBe(0);
  });

  test('evening check_signs requires meter/sign verification', () => {
    const pricing = estimateSeattleStreetMeterPricing({
      destination: 'Capitol Hill, Seattle, WA',
      arrivalDate: '2026-06-03',
      arrivalTime: '21:00',
      durationMinutes: 90,
    });

    expect(pricing?.costDisplay).toBe('Check meter');
    expect(pricing?.total).toBeNull();
  });
});
