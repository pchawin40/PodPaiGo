import { isEventVenueDestination } from '../eventVenueDetection';

describe('isEventVenueDestination', () => {
  test.each([
    'Lumen Field, Seattle, WA',
    'T-Mobile Park, Seattle, WA',
    'Climate Pledge Arena, Seattle, WA',
  ])('detects %s as an event venue', (destination) => {
    expect(isEventVenueDestination({ destination })).toBe(true);
  });

  test('does not flag normal city destinations as event venues', () => {
    expect(
      isEventVenueDestination({
        destination: 'Pike Place Market, Seattle, WA',
        destinationKind: 'downtown',
      }),
    ).toBe(false);
  });

  test('keeps airport trips separate from event venue logic', () => {
    expect(
      isEventVenueDestination({
        destination: 'Seattle-Tacoma International Airport',
        destinationKind: 'airport',
        airportCode: 'SEA',
      }),
    ).toBe(false);
  });
});
