import { buildRouteEstimateCacheKey } from '../routeCacheKey';

describe('buildRouteEstimateCacheKey', () => {
  test('separates Quick Go local routes from airport routes even when timing bucket matches', () => {
    const dateTime = '2026-06-01T10:00:00.000Z';

    const localKey = buildRouteEstimateCacheKey({
      origin: '47.8508,-121.987',
      destination: '47.859,-121.972',
      dateTime,
      mode: 'DRIVE',
      routePurpose: 'main_to_destination',
      tripType: 'general-trip',
    });
    const airportKey = buildRouteEstimateCacheKey({
      origin: '47.8508,-121.987',
      destination: 'SEA',
      dateTime,
      mode: 'DRIVE',
      routePurpose: 'main_to_destination',
      tripType: 'one-way-departure',
      airportCode: 'SEA',
    });

    expect(localKey).not.toBe(airportKey);
    expect(localKey).toContain('main_to_destination');
    expect(localKey).toContain('general-trip');
    expect(airportKey).toContain('one-way-departure');
    expect(airportKey).toContain('SEA');
  });

  test('separates main destination timing from origin-to-parking timing', () => {
    const base = {
      origin: 'Monroe, WA',
      destination: 'Pike Place Market Parking Garage',
      dateTime: '2026-06-01T10:00:00.000Z',
      mode: 'DRIVE',
    };

    expect(
      buildRouteEstimateCacheKey({
        ...base,
        routePurpose: 'main_to_destination',
        tripType: 'general-trip',
      }),
    ).not.toBe(
      buildRouteEstimateCacheKey({
        ...base,
        routePurpose: 'origin_to_parking',
        tripType: 'general-trip',
        lotId: 'pike-place-garage',
      }),
    );
  });
});
