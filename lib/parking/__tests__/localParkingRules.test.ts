import { evaluateLocalStreetParkingRules } from '../localParkingRules';
import { US_CITY_STREET_PARKING_RULE_MODULES } from '../usCityStreetParkingRules';

describe('evaluateLocalStreetParkingRules', () => {
  test('generic U.S. module is registered behind the city-rule framework', () => {
    expect(US_CITY_STREET_PARKING_RULE_MODULES.map((module) => module.cityRuleId)).toContain(
      'generic_us_city',
    );
  });

  test('airport trips are not scored for street parking', () => {
    const result = evaluateLocalStreetParkingRules({
      destination: 'Seattle-Tacoma International Airport',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
      isAirportTrip: true,
    });

    expect(result.penalty).toBeGreaterThanOrEqual(5000);
    expect(result.paidLikely).toBe(false);
    expect(result.freeLikely).toBe(false);
  });

  test('Seattle Sunday maps to likely_free street signal', () => {
    const result = evaluateLocalStreetParkingRules({
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '14:00',
      durationMinutes: 120,
    });

    expect(result.paymentExpectation).toBe('likely_free');
    expect(result.freeLikely).toBe(true);
    expect(result.headline).toBe('Likely free street parking');
    expect(result.rulesSource).toBe('seattle');
    expect(result.cityRuleId).toBe('seattle');
    expect(result.specialSignals).toEqual(
      expect.arrayContaining(['sunday_free', 'verify_signs']),
    );
  });

  test('garage type does not inherit street free rules', () => {
    const result = evaluateLocalStreetParkingRules({
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '14:00',
      durationMinutes: 120,
      parkingType: 'garage',
    });

    expect(result.paymentExpectation).toBe('likely_paid');
    expect(result.paidLikely).toBe(true);
    expect(result.freeLikely).toBe(false);
  });

  test('non-Seattle U.S. Sunday uses conservative city fallback', () => {
    const result = evaluateLocalStreetParkingRules({
      destination: 'Times Square, New York, NY',
      arrivalDate: '2026-06-07',
      arrivalTime: '14:00',
      durationMinutes: 120,
    });

    expect(result.paymentExpectation).toBe('check_signs');
    expect(result.rulesSource).toBe('us_city_fallback');
    expect(result.freeLikely).toBe(false);
    expect(result.paidLikely).toBe(false);
    expect(result.headline).toBe('Check signs / special rules possible');
    expect(result.detail).toMatch(/Sunday street parking payment rules vary/i);
    expect(result.supplementalText).toMatch(/varies by city and block/i);
    expect(result.cityRuleId).toBe('generic_us_city');
    expect(result.specialSignals).toEqual(
      expect.arrayContaining([
        'sunday_free',
        'event_zone_possible',
        'verify_signs',
      ]),
    );
  });

  test('non-Seattle U.S. evening rules stay check-signs instead of Seattle free', () => {
    const result = evaluateLocalStreetParkingRules({
      destination: 'Hollywood, Los Angeles, CA',
      arrivalDate: '2026-06-03',
      arrivalTime: '21:00',
      durationMinutes: 120,
    });

    expect(result.paymentExpectation).toBe('check_signs');
    expect(result.rulesSource).toBe('us_city_fallback');
    expect(result.detail).toMatch(/Evening street parking payment rules vary/i);
    expect(result.specialSignals).toEqual(
      expect.arrayContaining([
        'extended_paid_hours',
        'event_zone_possible',
        'verify_signs',
      ]),
    );
  });

  test('non-Seattle garages stay paid unless provider confirms free', () => {
    const result = evaluateLocalStreetParkingRules({
      destination: 'Downtown Denver, CO',
      arrivalDate: '2026-06-07',
      arrivalTime: '14:00',
      durationMinutes: 120,
      parkingType: 'garage',
    });

    expect(result.paymentExpectation).toBe('likely_paid');
    expect(result.rulesSource).toBe('us_city_fallback');
    expect(result.paidLikely).toBe(true);
    expect(result.freeLikely).toBe(false);
    expect(result.detail).toMatch(/Garages and lots usually charge/i);
    expect(result.specialSignals).toEqual(
      expect.arrayContaining(['garage_or_lot', 'verify_signs']),
    );
  });
});
