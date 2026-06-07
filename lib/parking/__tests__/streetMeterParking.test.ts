import { buildStreetMeterParkingOption } from '../streetMeterParking';

describe('buildStreetMeterParkingOption', () => {
  test('returns Seattle street meter option during paid hours', () => {
    const option = buildStreetMeterParkingOption({
      destination: '1st Avenue, Seattle, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
      driveMinutes: 18,
    });

    expect(option?.applicable).toBe(true);
    expect(option?.label).toBe('Street / meter parking');
    expect(option?.cost).toBeGreaterThan(0);
  });

  test('skips airport trips', () => {
    const option = buildStreetMeterParkingOption({
      destination: 'Seattle-Tacoma International Airport',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
      isAirportTrip: true,
    });

    expect(option).toBeNull();
  });

  test('Uptown event area still surfaces check_signs street option', () => {
    const option = buildStreetMeterParkingOption({
      destination: 'Climate Pledge Arena, Seattle, WA',
      arrivalDate: '2026-06-02',
      arrivalTime: '10:00',
      durationMinutes: 120,
    });

    expect(option?.applicable).toBe(true);
    expect(option?.name).toMatch(/Check signs|special rules|On-street/i);
  });

  test('Seattle Sunday street option explains why payment may be free', () => {
    const option = buildStreetMeterParkingOption({
      destination: 'Pike Place Market, Seattle, WA',
      arrivalDate: '2026-06-07',
      arrivalTime: '14:00',
      durationMinutes: 120,
    });

    expect(option?.costDisplay).toBe('Free');
    expect(option?.pros).toEqual(
      expect.arrayContaining([
        'Likely free now because Seattle street parking is generally free on Sundays',
      ]),
    );
  });
});
