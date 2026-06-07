import { buildParkingOutlook } from '../parkingOutlook';
import { SEATTLE_STREET_PARKING_SUBTEXT } from '../seattleStreetParkingRules';

describe('buildParkingOutlook', () => {
  test('Seattle weekday meter hours use paid street headline and subtext', () => {
    const outlook = buildParkingOutlook({
      destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
    });

    expect(outlook.headline).toBe('Likely paid street parking');
    expect(outlook.source).toBe('city_rule');
    expect(outlook.reason).toContain(SEATTLE_STREET_PARKING_SUBTEXT);
    expect(outlook.reason).toMatch(/during typical meter hours/i);
    expect(outlook.hints).toEqual(
      expect.arrayContaining(['Seattle rule', 'Typical paid hours', 'Verify signs']),
    );
  });

  test('Pike Place Sunday evening is not always likely paid', () => {
    const outlook = buildParkingOutlook({
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '19:30',
    });

    expect(outlook.headline).toBe('Likely free street parking');
    expect(outlook.headline).not.toBe('Likely paid street parking');
    expect(outlook.hints).toEqual(expect.arrayContaining(['Sunday rule', 'Verify signs']));
  });

  test('non-Seattle U.S. city rules use generic check-signs copy', () => {
    const outlook = buildParkingOutlook({
      destination: 'Downtown Manhattan, New York, NY',
      destinationKind: 'downtown',
      arrivalDate: '2026-06-07',
      arrivalTime: '14:00',
    });

    expect(outlook.headline).toBe('Check signs / special rules possible');
    expect(outlook.source).toBe('generic_us_city_rule');
    expect(outlook.reason).toMatch(/Sunday street parking payment rules vary/i);
    expect(outlook.reason).toMatch(/varies by city and block/i);
    expect(outlook.reason).not.toContain(SEATTLE_STREET_PARKING_SUBTEXT);
    expect(outlook.hints).toContain('City estimate');
    expect(outlook.hints).toEqual(
      expect.arrayContaining([
        'Sunday rule',
        'Event zone possible',
        'Verify signs',
      ]),
    );
    expect(outlook.hints).not.toContain('Seattle rule');
  });

  test('generic U.S. street fallback does not hide paid garage signals', () => {
    const outlook = buildParkingOutlook({
      destination: 'Downtown Los Angeles, CA',
      googleParkingOptions: { paidGarageParking: true },
      arrivalDate: '2026-06-07',
      arrivalTime: '14:00',
    });

    expect(outlook.headline).toBe('Likely paid street parking');
    expect(outlook.source).toBe('google_parking_options');
    expect(outlook.reason).toMatch(/paid garage or lot parking/i);
  });

  test('free garage signal stays free instead of inheriting street rules', () => {
    const outlook = buildParkingOutlook({
      destination: 'Downtown Seattle Garage',
      googleParkingOptions: { freeGarageParking: true },
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
    });

    expect(outlook.headline).toBe('Free customer parking likely');
    expect(outlook.reason).toMatch(/free garage parking/i);
    expect(outlook.source).toBe('google_parking_options');
  });

  test('airport trips keep airport outlook', () => {
    const outlook = buildParkingOutlook({
      destination: 'Seattle-Tacoma International Airport',
      destinationKind: 'airport',
      airportCode: 'SEA',
      isAirportTrip: true,
    });

    expect(outlook.headline).toMatch(/Airport parking rules apply/i);
  });
});
