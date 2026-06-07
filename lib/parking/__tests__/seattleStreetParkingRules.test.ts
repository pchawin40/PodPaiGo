import {
  buildTripDateTime,
  evaluateSeattleStreetParkingRules,
  isSeattleParkingHoliday,
  seattleParkingHolidayName,
  seattleStreetParkingExpectationLabel,
} from '../seattleStreetParkingRules';

describe('seattleStreetParkingRules', () => {
  test('Sunday is likely free with time-limit caveat', () => {
    const result = evaluateSeattleStreetParkingRules({
      destination: 'Pike Place Market, Seattle, WA',
      tripDateTime: new Date('2026-06-07T14:00'),
      parkingType: 'street',
    });

    expect(result?.paymentExpectation).toBe('likely_free');
    expect(result?.confidence).toBe('high');
    expect(result?.reason).toBe(
      'Seattle street parking is generally free on Sundays; posted time limits may still apply in some areas.',
    );
    expect(result?.cityRuleId).toBe('seattle');
    expect(result?.specialSignals).toEqual(
      expect.arrayContaining(['sunday_free', 'verify_signs']),
    );
    expect(seattleStreetParkingExpectationLabel('likely_free')).toBe(
      'Likely free street parking',
    );
  });

  test('Seattle parking holidays are likely free', () => {
    const independence = evaluateSeattleStreetParkingRules({
      destinationCity: 'Seattle',
      tripDateTime: new Date('2026-07-04T11:00'),
      parkingType: 'street',
    });

    expect(independence?.paymentExpectation).toBe('likely_free');
    expect(independence?.holidayName).toBe('Independence Day');
    expect(independence?.reason).toBe(
      'Seattle street parking payment is not required on this holiday.',
    );
    expect(independence?.specialSignals).toEqual(
      expect.arrayContaining(['holiday_free', 'verify_signs']),
    );

    const mlk = evaluateSeattleStreetParkingRules({
      destination: 'Downtown Seattle',
      tripDateTime: new Date('2026-01-19T10:00'),
      parkingType: 'street',
    });
    expect(mlk?.paymentExpectation).toBe('likely_free');
    expect(seattleParkingHolidayName(new Date(2026, 0, 19, 10, 0))).toBe(
      'Martin Luther King Jr. Day',
    );
  });

  test('before 8 AM is likely free with start-hours reason', () => {
    const result = evaluateSeattleStreetParkingRules({
      destination: 'Pike Place Market, Seattle, WA',
      tripDateTime: new Date('2026-06-02T07:30'),
      parkingType: 'street',
    });

    expect(result?.paymentExpectation).toBe('likely_free');
    expect(result?.confidence).toBe('medium');
    expect(result?.reason).toBe('Paid parking generally starts around 8 AM.');
    expect(result?.specialSignals).toEqual(
      expect.arrayContaining(['off_hours', 'verify_signs']),
    );
  });

  test('fixed-date holiday on Sunday observes free parking on Monday', () => {
    expect(isSeattleParkingHoliday(new Date('2027-07-05'))).toBe(true);
    const monday = evaluateSeattleStreetParkingRules({
      destinationCity: 'Seattle',
      tripDateTime: new Date('2027-07-05T10:00'),
      parkingType: 'street',
    });
    expect(monday?.paymentExpectation).toBe('likely_free');
    expect(monday?.holidayName).toMatch(/Independence Day \(observed\)/);
  });

  test('weekday 10 AM is likely paid', () => {
    const result = evaluateSeattleStreetParkingRules({
      destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      tripDateTime: new Date('2026-06-02T10:00'),
      parkingType: 'street',
    });

    expect(result?.paymentExpectation).toBe('likely_paid');
    expect(result?.confidence).toBe('high');
    expect(result?.specialSignals).toEqual(
      expect.arrayContaining(['typical_paid_hours', 'verify_signs']),
    );
    expect(seattleStreetParkingExpectationLabel('likely_paid')).toBe(
      'Likely paid street parking',
    );
  });

  test('weekday 9 PM is check_signs for extended neighborhood hours', () => {
    const result = evaluateSeattleStreetParkingRules({
      destination: 'Capitol Hill, Seattle, WA',
      tripDateTime: new Date('2026-06-03T21:00'),
      parkingType: 'street',
    });

    expect(result?.paymentExpectation).toBe('check_signs');
    expect(result?.reason).toMatch(/8 PM and 10 PM/i);
  });

  test('after 10 PM is check_signs with end-hours reason', () => {
    const result = evaluateSeattleStreetParkingRules({
      destination: 'Pike Place Market, Seattle, WA',
      tripDateTime: new Date('2026-06-03T22:30'),
      parkingType: 'street',
    });

    expect(result?.paymentExpectation).toBe('check_signs');
    expect(result?.reason).toBe(
      'Paid parking generally ends by 8 PM or 10 PM depending on neighborhood.',
    );
  });

  test('Uptown / Climate Pledge area is check_signs for events', () => {
    const byText = evaluateSeattleStreetParkingRules({
      destination: 'Climate Pledge Arena, Seattle, WA',
      tripDateTime: new Date('2026-06-02T10:00'),
      parkingType: 'street',
    });
    expect(byText?.paymentExpectation).toBe('check_signs');
    expect(byText?.isUptownEventArea).toBe(true);
    expect(byText?.reason).toContain('Special event parking may apply');
    expect(byText?.specialSignals).toEqual(
      expect.arrayContaining(['event_zone_possible', 'verify_signs']),
    );

    const byCoords = evaluateSeattleStreetParkingRules({
      destinationLat: 47.622,
      destinationLng: -122.338,
      destinationCity: 'Seattle',
      tripDateTime: new Date('2026-06-02T10:00'),
      parkingType: 'street',
    });
    expect(byCoords?.paymentExpectation).toBe('check_signs');
  });

  test('garage parking stays paid regardless of street hours', () => {
    const sundayGarage = evaluateSeattleStreetParkingRules({
      destination: 'Pike Place Market, Seattle, WA',
      tripDateTime: new Date('2026-06-07T14:00'),
      parkingType: 'garage',
    });

    expect(sundayGarage?.paymentExpectation).toBe('likely_paid');
    expect(sundayGarage?.reason).toMatch(/Garages and lots typically charge/i);
    expect(sundayGarage?.specialSignals).toEqual(
      expect.arrayContaining(['garage_or_lot', 'verify_signs']),
    );
  });

  test('buildTripDateTime parses arrival fields', () => {
    expect(buildTripDateTime('2026-06-02', '10:00')?.toISOString()).toContain('2026-06-02');
  });
});
