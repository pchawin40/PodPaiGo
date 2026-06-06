import { resolveDestinationParkingRate } from '../lib/parking/destinationParkingRates';
import type { ParkingRateRule } from '../lib/types';

const hourlyRule: ParkingRateRule = {
  id: 'weekday-hourly',
  label: 'Weekday hourly',
  kind: 'hourly',
  amount: 6,
  hourlyRate: 6,
  dailyMax: 30,
  priority: 10,
  sourceName: 'Test garage',
  confidence: 'medium',
};

describe('destination parking rate rules', () => {
  test('selects weekday hourly pricing by arrival duration', () => {
    const resolved = resolveDestinationParkingRate({
      rateRules: [hourlyRule],
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
      durationMinutes: 130,
    });

    expect(resolved.total).toBe(18);
    expect(resolved.rateType).toBe('hourly');
    expect(resolved.label).toContain('$18');
  });

  test('selects a weekend special when the arrival day matches', () => {
    const resolved = resolveDestinationParkingRate({
      rateRules: [
        hourlyRule,
        {
          id: 'weekend-special',
          label: 'Weekend daily special',
          kind: 'weekend',
          amount: 12,
          appliesOnDays: [0, 6],
          priority: 50,
          sourceName: 'Test garage',
          confidence: 'medium',
          estimated: true,
        },
      ],
      arrivalDate: '2026-06-06',
      arrivalTime: '12:00',
      durationMinutes: 4 * 60,
    });

    expect(resolved.total).toBe(12);
    expect(resolved.rateType).toBe('weekend');
    expect(resolved.confidence).toBe('medium');
  });

  test('selects early bird only when entry and exit rules match', () => {
    const resolved = resolveDestinationParkingRate({
      rateRules: [
        hourlyRule,
        {
          id: 'early-bird',
          label: 'Early bird',
          kind: 'early_bird',
          amount: 17,
          entryWindow: { start: '05:00', end: '08:59' },
          exitBy: '21:00',
          priority: 70,
          sourceName: 'Test garage',
          confidence: 'high',
        },
      ],
      arrivalDate: '2026-06-01',
      arrivalTime: '08:30',
      durationMinutes: 8 * 60,
    });

    expect(resolved.total).toBe(17);
    expect(resolved.rateType).toBe('early_bird');
    expect(resolved.warnings.join(' ')).toMatch(/entry and exit/i);
  });

  test('lets event pricing override normal pricing when flagged', () => {
    const resolved = resolveDestinationParkingRate({
      rateRules: [
        hourlyRule,
        {
          id: 'event-rate',
          label: 'Event rate',
          kind: 'event',
          amount: 45,
          priority: 100,
          sourceName: 'Event estimate',
          confidence: 'low',
          estimated: true,
        },
      ],
      arrivalDate: '2026-06-01',
      arrivalTime: '18:00',
      durationMinutes: 3 * 60,
      eventLikely: true,
    });

    expect(resolved.total).toBe(45);
    expect(resolved.rateType).toBe('event');
    expect(resolved.warnings.join(' ')).toMatch(/Event pricing/i);
  });

  test('falls back with verification warnings when no reliable rule is available', () => {
    const resolved = resolveDestinationParkingRate({
      rateRules: [],
      fallbackPrice: 22,
      arrivalDate: '2026-06-01',
      arrivalTime: '14:00',
      durationMinutes: 2 * 60,
    });

    expect(resolved.total).toBe(22);
    expect(resolved.rateType).toBe('fallback');
    expect(resolved.confidence).toBe('low');
    expect(resolved.warnings).toEqual(
      expect.arrayContaining([
        'Check posted garage rules before parking.',
        'Special rate may apply.',
      ]),
    );
  });
});
