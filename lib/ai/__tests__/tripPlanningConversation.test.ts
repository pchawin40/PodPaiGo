import { parseTripTextMock } from '../mockTripParser';
import { parsedTripToSearchParams } from '../parsedTripToSearchParams';

const NOW = new Date('2026-06-05T12:00:00');

describe('AI trip planner clarification flow', () => {
  test('incomplete general trip asks for origin and arrival time', () => {
    const parsed = parseTripTextMock(
      'I am going to Pike Place Market tomorrow. Plan commute for me.',
      NOW,
    );

    expect(parsed.mode).toBe('quick_go');
    expect(parsed.destinationText).toBe('Pike Place Market');
    expect(parsed.departureDate).toBe('2026-06-06');
    expect(parsed.status).toBe('needs_clarification');
    expect(parsed.missingFields).toContain('originText');
    expect(parsed.missingFields).toContain('targetTime');
    expect(parsed.clarificationQuestions?.join(' ')).toMatch(/starting/i);
    expect(parsed.clarificationQuestions?.join(' ')).toMatch(/what time/i);
  });

  test('complete general trip fills review-ready fields and search params', () => {
    const parsed = parseTripTextMock(
      [
        'I am going to Pike Place Market tomorrow. Plan commute for me.',
        'From Monroe, arrive by 9 AM, compare all, park for 8 hours.',
      ].join('\n'),
      NOW,
    );

    expect(parsed.status).toBe('ready_for_review');
    expect(parsed.originText).toBe('Monroe');
    expect(parsed.destinationText).toBe('Pike Place Market');
    expect(parsed.departureDate).toBe('2026-06-06');
    expect(parsed.departureTime).toBe('09:00');
    expect(parsed.transportAvailability).toBe('all');
    expect(parsed.parkingPreference).toBe('nearby');
    expect(parsed.parkingDurationMinutes).toBe(480);

    const params = parsedTripToSearchParams(parsed, { confirmed: true });
    expect(params?.get('type')).toBe('general-trip');
    expect(params?.get('origin')).toBe('Monroe');
    expect(params?.get('destination')).toBe('Pike Place Market');
    expect(params?.get('arrivalDate')).toBe('2026-06-06');
    expect(params?.get('arrivalTime')).toBe('09:00');
    expect(params?.get('transport')).toBe('all');
    expect(params?.get('parkingDuration')).toBe('480');
    expect(params?.get('parkingCheckInDate')).toBe('2026-06-06');
    expect(params?.get('parkingCheckInTime')).toBe('09:00');
    expect(params?.get('parkingCheckOutDate')).toBe('2026-06-06');
    expect(params?.get('parkingCheckOutTime')).toBe('17:00');
  });

  test('Uber and no parking maps to rideshare preference', () => {
    const parsed = parseTripTextMock(
      "I'll Uber to Pike Place tomorrow from Monroe at 9am with no parking.",
      NOW,
    );

    expect(parsed.transportAvailability).toBe('rideshare');
    expect(parsed.parkingPreference).toBe('none');
  });

  test('compare parking and transit maps to compare all', () => {
    const parsed = parseTripTextMock(
      'Compare parking and transit to Bellevue Square tomorrow at 9 from Monroe, park 3 hours.',
      NOW,
    );

    expect(parsed.destinationText).toBe('Bellevue Square');
    expect(parsed.transportAvailability).toBe('all');
    expect(parsed.parkingDurationMinutes).toBe(180);
  });
});

describe('AI trip planner airport and parking modes', () => {
  test('incomplete airport trip asks for missing airport timing fields', () => {
    const parsed = parseTripTextMock('Flying to Vegas Friday night and coming back Sunday.', NOW);

    expect(parsed.mode).toBe('airport_trip');
    expect(parsed.destinationCity).toBe('Las Vegas');
    expect(parsed.status).toBe('needs_clarification');
    expect(parsed.missingFields).toContain('originText');
    expect(parsed.missingFields).toContain('airportCode');
  });

  test('parking-only prompt extracts airport parking window', () => {
    const parsed = parseTripTextMock('Need parking at SEA from Nov 13 6am to Nov 15 8pm.', NOW);

    expect(parsed.mode).toBe('parking_only');
    expect(parsed.status).toBe('ready_for_review');
    expect(parsed.airportCode).toBe('SEA');
    expect(parsed.parkingCheckInDate).toBe('2026-11-13');
    expect(parsed.parkingCheckInTime).toBe('06:00');
    expect(parsed.parkingCheckOutDate).toBe('2026-11-15');
    expect(parsed.parkingCheckOutTime).toBe('20:00');

    const params = parsedTripToSearchParams(parsed, { confirmed: true });
    expect(params?.get('intent')).toBe('parking-trip');
    expect(params?.get('airportCode')).toBe('SEA');
    expect(params?.get('parkingDuration')).toBe('3720');
  });
});
