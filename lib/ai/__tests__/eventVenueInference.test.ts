import { inferEventVenue } from '../eventVenueInference';

describe('inferEventVenue', () => {
  test('resolves "raiders stadium" in Las Vegas to Allegiant Stadium', () => {
    const result = inferEventVenue({
      text: 'get to the raiders stadium if I am staying at bellagio hotel in vegas',
      tripCity: 'Las Vegas',
    });
    expect(result.isEvent).toBe(true);
    expect(result.venueName).toBe('Allegiant Stadium');
  });

  test('resolves an away game (Seahawks @ Raiders) to the home city venue', () => {
    const result = inferEventVenue({
      text: 'seattle seahawks game when they go to vegas',
      tripCity: 'Las Vegas',
    });
    expect(result.isEvent).toBe(true);
    expect(result.venueName).toBe('Allegiant Stadium');
    expect(result.eventLabel).toMatch(/seahawks\/raiders|raiders/i);
  });

  test('uses event label in first-seen team order', () => {
    const result = inferEventVenue({
      text: 'seahawks vs raiders game',
      tripCity: 'Las Vegas',
    });
    expect(result.eventLabel).toBe('Seahawks/Raiders game');
  });

  test('keeps a recognizable destination venue name', () => {
    const result = inferEventVenue({
      text: 'concert at Climate Pledge Arena',
      destinationText: 'Climate Pledge Arena',
    });
    expect(result.isEvent).toBe(true);
    expect(result.venueName).toBe('Climate Pledge Arena');
  });

  test('returns isEvent false for a non-event trip', () => {
    const result = inferEventVenue({ text: 'driving to Fred Meyer in Monroe' });
    expect(result.isEvent).toBe(false);
    expect(result.venueName).toBeNull();
  });
});
