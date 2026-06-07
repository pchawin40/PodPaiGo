import { isServeableCachedRouteEstimate } from '../providers';
import type { TrafficEstimate } from '../types';

function estimate(partial: Partial<TrafficEstimate>): TrafficEstimate {
  return {
    route: 'custom',
    duration: 4,
    congestion: 'low',
    trustStatus: 'live',
    sourceName: 'Google Routes API',
    lastUpdated: new Date().toISOString(),
    assumptions: [],
    ...partial,
  };
}

describe('isServeableCachedRouteEstimate (cached fallback must not shadow live)', () => {
  test('serves a cached live Google Routes estimate', () => {
    expect(isServeableCachedRouteEstimate(estimate({ sourceName: 'Google Routes API', trustStatus: 'live' }))).toBe(true);
  });

  test('serves a cached route snapshot estimate', () => {
    expect(
      isServeableCachedRouteEstimate(estimate({ sourceName: 'Google Routes snapshot', trustStatus: 'recent' })),
    ).toBe(true);
  });

  test('serves a cached Mapbox Directions route estimate', () => {
    expect(
      isServeableCachedRouteEstimate(estimate({ sourceName: 'Mapbox Directions', trustStatus: 'live' })),
    ).toBe(true);
  });

  test('does NOT serve a cached straight-line coordinate fallback (forces live retry)', () => {
    expect(
      isServeableCachedRouteEstimate(
        estimate({ sourceName: 'Estimated from coordinates', trustStatus: 'estimated', routeUnavailable: false }),
      ),
    ).toBe(false);
  });

  test('does NOT serve a cached unavailable estimate', () => {
    expect(
      isServeableCachedRouteEstimate(
        estimate({ sourceName: 'Google Routes API', trustStatus: 'fallback', routeUnavailable: true }),
      ),
    ).toBe(false);
  });

  test('does NOT serve a cached 35-minute placeholder estimate', () => {
    expect(
      isServeableCachedRouteEstimate(
        estimate({ sourceName: 'Estimated route model', trustStatus: 'estimated', duration: 35 }),
      ),
    ).toBe(false);
  });
});
