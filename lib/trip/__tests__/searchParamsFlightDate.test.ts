import { parseTripDataFromSearchParams } from '../searchParams';

describe('parseTripDataFromSearchParams flightDate alias', () => {
  test('uses flightDate when departureDate is absent', () => {
    const params = new URLSearchParams({
      type: 'one-way-departure',
      intent: 'flying-out',
      origin: 'Monroe, WA',
      destination: 'SEA Airport',
      airportCode: 'SEA',
      flightDate: '2026-06-02',
      departureTime: '10:30',
    });

    const tripData = parseTripDataFromSearchParams(params);

    expect(tripData).not.toBeNull();
    if (tripData?.type === 'one-way-departure') {
      expect(tripData.departureDate).toBe('2026-06-02');
    }
  });

  test('prefers departureDate over flightDate when both are present', () => {
    const params = new URLSearchParams({
      type: 'one-way-departure',
      intent: 'flying-out',
      origin: 'Monroe, WA',
      destination: 'SEA Airport',
      airportCode: 'SEA',
      departureDate: '2026-07-01',
      flightDate: '2026-06-02',
      departureTime: '10:30',
    });

    const tripData = parseTripDataFromSearchParams(params);

    expect(tripData).not.toBeNull();
    if (tripData?.type === 'one-way-departure') {
      expect(tripData.departureDate).toBe('2026-07-01');
    }
  });
});
