import {
  deriveQuickGoRouteSource,
  isQuickGoRouteLoading,
  resolveQuickGoDriveTime,
  resolveQuickGoRouteStatus,
} from '../quickGo';

describe('resolveQuickGoDriveTime', () => {
  test('treats a positive duration as a valid drive time', () => {
    expect(resolveQuickGoDriveTime({ duration: 25, trustStatus: 'estimated' })).toEqual({
      minutes: 25,
      unavailable: false,
      loading: false,
      refreshing: false,
      routeStatus: 'ready',
      routeSource: null,
    });
  });

  test('marks route-unavailable estimates as unavailable (never 0 min)', () => {
    expect(
      resolveQuickGoDriveTime({ duration: 0, routeUnavailable: true, trustStatus: 'fallback' }),
    ).toEqual({
      minutes: null,
      unavailable: true,
      loading: false,
      refreshing: false,
      routeStatus: 'unavailable',
      routeSource: 'unavailable',
    });
  });

  test('marks fallback duration <= 0 as unavailable', () => {
    expect(resolveQuickGoDriveTime({ duration: 0, trustStatus: 'fallback' })).toEqual({
      minutes: null,
      unavailable: true,
      loading: false,
      refreshing: false,
      routeStatus: 'unavailable',
      routeSource: null,
    });
  });

  test('treats a bare duration of 0 (no same-place signal) as unavailable', () => {
    expect(resolveQuickGoDriveTime({ duration: 0, trustStatus: 'estimated' })).toEqual({
      minutes: null,
      unavailable: true,
      loading: false,
      refreshing: false,
      routeStatus: 'unavailable',
      routeSource: null,
    });
  });

  test('allows 0 min only with an explicit same-place signal (zero distance, real route)', () => {
    expect(
      resolveQuickGoDriveTime({ duration: 0, distanceMeters: 0, trustStatus: 'live' }),
    ).toEqual({
      minutes: 0,
      unavailable: false,
      loading: false,
      refreshing: false,
      routeStatus: 'ready',
      routeSource: null,
    });
  });

  test('treats missing traffic estimate as unavailable when not loading', () => {
    expect(resolveQuickGoDriveTime(null)).toEqual({
      minutes: null,
      unavailable: true,
      loading: false,
      refreshing: false,
      routeStatus: 'unavailable',
      routeSource: null,
    });
    expect(resolveQuickGoDriveTime(undefined)).toEqual({
      minutes: null,
      unavailable: true,
      loading: false,
      refreshing: false,
      routeStatus: 'unavailable',
      routeSource: null,
    });
  });

  test('loading pending never collapses into unavailable', () => {
    expect(
      resolveQuickGoDriveTime({
        traffic: null,
        routeLoading: true,
      }),
    ).toEqual({
      minutes: null,
      unavailable: false,
      loading: true,
      refreshing: false,
      routeStatus: 'google_loading',
      routeSource: null,
    });
  });

  test('google to mapbox transition stays loading, not unavailable', () => {
    expect(
      resolveQuickGoRouteStatus({
        traffic: { routeStatus: 'mapbox_loading' },
        routeLoading: true,
      }),
    ).toBe('mapbox_loading');
    expect(isQuickGoRouteLoading('mapbox_loading')).toBe(true);
  });

  test('mapbox success resolves to ready with mapbox source', () => {
    const driveTime = resolveQuickGoDriveTime({
      duration: 4,
      trustStatus: 'live',
      sourceName: 'Mapbox Directions',
      routeSource: 'mapbox',
      routeStatus: 'ready',
    });

    expect(driveTime.routeStatus).toBe('ready');
    expect(driveTime.routeSource).toBe('mapbox');
    expect(driveTime.unavailable).toBe(false);
  });

  test('coordinate fallback resolves to ready with coordinate source', () => {
    const driveTime = resolveQuickGoDriveTime({
      duration: 6,
      trustStatus: 'estimated',
      sourceName: 'Estimated from coordinates',
      routeSource: 'coordinate_fallback',
      routeStatus: 'ready',
    });

    expect(driveTime.routeSource).toBe('coordinate_fallback');
    expect(driveTime.unavailable).toBe(false);
  });

  test('unavailable only after all providers fail', () => {
    expect(
      resolveQuickGoDriveTime({
        duration: 0,
        routeUnavailable: true,
        trustStatus: 'fallback',
        routeSource: 'unavailable',
        routeStatus: 'unavailable',
      }).unavailable,
    ).toBe(true);
    expect(
      resolveQuickGoDriveTime({
        traffic: { routeStatus: 'fallback_loading' },
        routeLoading: true,
      }).unavailable,
    ).toBe(false);
  });

  test('refresh keeps prior route minutes without flashing unavailable', () => {
    expect(
      resolveQuickGoDriveTime({
        traffic: {
          duration: 12,
          trustStatus: 'live',
          sourceName: 'Google Routes API',
        },
        routeRefreshing: true,
        priorMinutes: 12,
      }),
    ).toEqual({
      minutes: 12,
      unavailable: false,
      loading: true,
      refreshing: true,
      routeStatus: 'google_loading',
      routeSource: 'google_live',
    });
  });

  test('deriveQuickGoRouteSource maps provider names', () => {
    expect(
      deriveQuickGoRouteSource({
        duration: 4,
        trustStatus: 'live',
        sourceName: 'Mapbox Directions',
      }),
    ).toBe('mapbox');
    expect(
      deriveQuickGoRouteSource({
        duration: 4,
        trustStatus: 'live',
        sourceName: 'Google Routes API',
      }),
    ).toBe('google_live');
    expect(
      deriveQuickGoRouteSource({
        duration: 4,
        trustStatus: 'estimated',
        sourceName: 'Cached route snapshot (SEA)',
      }),
    ).toBe('google_cached');
  });
});
