import {
  deriveQuickGoRouteSource,
  deriveQuickGoDisplayRouteState,
  hasReliableQuickGoRoute,
  isQuickGoRouteLoading,
  isProvisionalQuickGoRouteUnavailable,
  quickGoRouteHydrationStateForFinalResult,
  resolveQuickGoDriveTime,
  resolveQuickGoRouteStatus,
  shouldStartQuickGoRouteRefresh,
  shouldForceInitialQuickGoRoutePending,
  shouldSuppressStaleRouteUnavailable,
  classifyQuickGoServerRouteState,
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
    expect(isQuickGoRouteLoading('google_failed_trying_mapbox')).toBe(true);
    expect(
      resolveQuickGoRouteStatus({
        traffic: { routeStatus: 'google_failed_trying_mapbox' },
        routeLoading: true,
      }),
    ).toBe('google_failed_trying_mapbox');
  });

  test('stale server unavailable is suppressed while client refresh is pending', () => {
    expect(
      shouldSuppressStaleRouteUnavailable({
        traffic: {
          duration: 0,
          routeUnavailable: true,
          routeStatus: 'unavailable',
        },
        routeLoading: true,
      }),
    ).toBe(true);
    expect(
      resolveQuickGoDriveTime({
        traffic: {
          duration: 0,
          routeUnavailable: true,
          routeStatus: 'unavailable',
        },
        routeLoading: true,
      }),
    ).toEqual({
      minutes: null,
      unavailable: false,
      loading: true,
      refreshing: false,
      routeStatus: 'google_loading',
      routeSource: 'unavailable',
    });
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

  test('stale unavailable flag does not override Mapbox backup duration', () => {
    const traffic = {
      duration: 4,
      routeUnavailable: true,
      trustStatus: 'live',
      sourceName: 'Mapbox Directions',
      routeStatus: 'ready' as const,
    };

    expect(classifyQuickGoServerRouteState(traffic)).toEqual({
      serverRouteUnavailable: false,
      latestRouteFinalStatus: 'ready',
    });

    expect(resolveQuickGoDriveTime(traffic)).toEqual({
      minutes: 4,
      unavailable: false,
      loading: false,
      refreshing: false,
      routeStatus: 'ready',
      routeSource: 'mapbox',
    });
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

  test('stale unavailable flag does not override coordinate fallback duration', () => {
    expect(
      resolveQuickGoDriveTime({
        duration: 6,
        routeUnavailable: true,
        trustStatus: 'estimated',
        sourceName: 'Estimated from coordinates',
        routeStatus: 'ready',
      }),
    ).toMatchObject({
      minutes: 6,
      unavailable: false,
      routeStatus: 'ready',
      routeSource: 'coordinate_fallback',
    });
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

  test('initial stale unavailable stays loading when client refresh is pending', () => {
    expect(
      resolveQuickGoDriveTime({
        traffic: {
          duration: 0,
          routeUnavailable: true,
          routeStatus: 'unavailable',
        },
        clientRouteRefreshPending: true,
      }),
    ).toEqual({
      minutes: null,
      unavailable: false,
      loading: true,
      refreshing: false,
      routeStatus: 'google_loading',
      routeSource: 'unavailable',
    });
  });

  test('provisional unavailable stays pending until final status', () => {
    expect(
      classifyQuickGoServerRouteState({
        duration: 0,
        routeUnavailable: true,
        routeStatus: 'provisional_unavailable',
      }),
    ).toEqual({
      serverRouteUnavailable: true,
      latestRouteFinalStatus: 'pending',
    });
    expect(
      resolveQuickGoDriveTime({
        traffic: {
          duration: 0,
          routeUnavailable: true,
          routeStatus: 'provisional_unavailable',
        },
      }).loading,
    ).toBe(true);
  });

  test('shouldStartQuickGoRouteRefresh is true for routable trips without reliable route', () => {
    expect(
      shouldStartQuickGoRouteRefresh(
        { origin: '123 Main St', destination: 'Fred Meyer', destinationName: 'Fred Meyer' },
        { duration: 0, routeUnavailable: true, routeStatus: 'unavailable' },
      ),
    ).toBe(true);
    expect(
      shouldStartQuickGoRouteRefresh(
        { origin: '123 Main St', destination: 'Fred Meyer', destinationName: 'Fred Meyer' },
        null,
      ),
    ).toBe(true);
    expect(
      shouldStartQuickGoRouteRefresh(
        { origin: '123 Main St', destination: 'Fred Meyer', destinationName: 'Fred Meyer' },
        { duration: 4, trustStatus: 'live', sourceName: 'Google Routes API' },
      ),
    ).toBe(false);
  });

  test('rapid refresh changes keep pending state until latest request completes', () => {
    const first = resolveQuickGoDriveTime({
      traffic: { duration: 0, routeUnavailable: true, routeStatus: 'unavailable' },
      routeLoading: true,
    });
    const second = resolveQuickGoDriveTime({
      traffic: { duration: 4, trustStatus: 'live', sourceName: 'Google Routes API' },
      routeLoading: false,
      clientRouteRefreshPending: false,
    });

    expect(first.loading).toBe(true);
    expect(first.unavailable).toBe(false);
    expect(second.unavailable).toBe(false);
    expect(second.minutes).toBe(4);
  });

  test('hasReliableQuickGoRoute distinguishes final and provisional unavailable', () => {
    expect(
      hasReliableQuickGoRoute({
        duration: 0,
        routeUnavailable: true,
        routeStatus: 'unavailable',
        routeSource: 'unavailable',
      }),
    ).toBe(false);
    expect(
      hasReliableQuickGoRoute({
        duration: 0,
        routeUnavailable: true,
        routeStatus: 'provisional_unavailable',
      }),
    ).toBe(false);
  });

  test('forces initial pending for routable Quick Go with server unavailable', () => {
    const tripData = {
      type: 'general-trip' as const,
      origin: '123 Main St',
      destination: 'Dairy Queen, Monroe, WA',
      destinationName: 'Dairy Queen',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
    };

    expect(
      shouldForceInitialQuickGoRoutePending({
        isQuickGo: true,
        tripData,
        trafficEstimate: { duration: 0, routeUnavailable: true, routeStatus: 'unavailable' },
        routeHydrationState: 'not_started',
        hasReliableRoute: false,
      }),
    ).toBe(true);
  });

  test('deriveQuickGoDisplayRouteState keeps unavailable behind final state invariant', () => {
    const tripData = {
      type: 'general-trip' as const,
      origin: '123 Main St',
      destination: 'Fred Meyer',
      destinationName: 'Fred Meyer',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
    };

    const pending = deriveQuickGoDisplayRouteState({
      isQuickGo: true,
      tripData,
      trafficEstimate: { duration: 0, routeUnavailable: true, routeStatus: 'unavailable' },
      routeHydrationState: 'not_started',
    });
    expect(pending.displayRouteState).toBe('calculating');

    const unavailable = deriveQuickGoDisplayRouteState({
      isQuickGo: true,
      tripData,
      trafficEstimate: { duration: 0, routeUnavailable: true, routeStatus: 'unavailable' },
      routeHydrationState: 'final_unavailable',
    });
    expect(unavailable.displayRouteState).toBe('unavailable');
    expect(unavailable.reason).toBe('client_route_final_unavailable');
  });

  test('route hydration derives final ready for Mapbox and resolving for pending backup', () => {
    const tripData = {
      type: 'general-trip' as const,
      origin: '123 Main St',
      destination: 'Fred Meyer',
      destinationName: 'Fred Meyer',
      arrivalDate: '2026-06-01',
      arrivalTime: '10:00',
    };

    expect(
      quickGoRouteHydrationStateForFinalResult({
        isQuickGo: true,
        tripData,
        trafficEstimate: {
          duration: 4,
          trustStatus: 'live',
          sourceName: 'Mapbox Directions',
          routeStatus: 'ready',
          routeSource: 'mapbox',
        },
      }),
    ).toBe('final_ready');

    expect(
      quickGoRouteHydrationStateForFinalResult({
        isQuickGo: true,
        tripData,
        trafficEstimate: {
          duration: 0,
          routeUnavailable: true,
          routeStatus: 'google_failed_trying_mapbox',
        },
      }),
    ).toBe('resolving');
  });
});
