import {
  buildRouteLookaheadCacheKey,
  clearRouteLookaheadCacheForTests,
  computeArriveByTiming,
  computeDepartAtTiming,
  resolveRouteLookahead,
  setRouteLookaheadFetcherForTests,
} from '../routeLookahead';
import { isGooglePlacesLiveBlocked } from '../../parking/googlePlacesGuard';

describe('routeLookahead', () => {
  beforeEach(() => {
    clearRouteLookaheadCacheForTests();
    delete process.env.DISABLE_GOOGLE_PLACES;
    delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
  });

  test('depart-at computes arriveAt correctly', () => {
    const timing = computeDepartAtTiming('2026-06-01T10:00:00.000Z', 45);

    expect(timing.leaveAt).toBe('2026-06-01T10:00:00.000Z');
    expect(timing.arriveAt).toBe('2026-06-01T10:45:00.000Z');
  });

  test('arrive-by computes leaveAt correctly', () => {
    const timing = computeArriveByTiming('2026-06-01T12:00:00.000Z', 50);

    expect(timing.arriveAt).toBe('2026-06-01T12:00:00.000Z');
    expect(timing.leaveAt).toBe('2026-06-01T11:10:00.000Z');
  });

  test('route cache hit avoids duplicate fetcher calls', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      route: 'home-airport',
      duration: 42,
      congestion: 'medium',
      trustStatus: 'live',
      sourceName: 'Google Routes API',
      lastUpdated: new Date().toISOString(),
      assumptions: [],
    });
    setRouteLookaheadFetcherForTests(fetcher);

    const request = {
      origin: 'Monroe, WA',
      destination: 'SEA airport',
      mode: 'depart_at' as const,
      targetTime: '2026-06-01T08:00:00.000Z',
    };

    const first = await resolveRouteLookahead(request);
    const second = await resolveRouteLookahead(request);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.source).toBe('google-routes');
    expect(second.source).toBe('cache');
    expect(buildRouteLookaheadCacheKey({
      origin: request.origin,
      destination: request.destination,
      mode: request.mode,
      targetTime: request.targetTime,
    })).toContain('depart_at');
  });

  test('lookahead route does not call Google Places', async () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';

    const fetchMock = jest.spyOn(global, 'fetch');

    setRouteLookaheadFetcherForTests(async () => ({
      route: 'home-airport',
      duration: 30,
      congestion: 'medium',
      trustStatus: 'live',
      sourceName: 'Google Routes API',
      lastUpdated: new Date().toISOString(),
      assumptions: [],
    }));

    const result = await resolveRouteLookahead({
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      mode: 'depart_at',
      targetTime: '2026-06-01T08:00:00.000Z',
      airportCode: 'SEA',
      destinationLatLng: { lat: 47.4439, lng: -122.3023 },
    });

    expect(isGooglePlacesLiveBlocked()).toBe(true);
    expect(result.routeUnavailable).not.toBe(true);
    expect(result.trafficAwareMinutes).toBe(30);
    expect(
      fetchMock.mock.calls.every(([url]) => !String(url).includes('places.googleapis.com')),
    ).toBe(true);

    fetchMock.mockRestore();
  });

  test('disabled Places still allows Routes lookahead', async () => {
    process.env.DISABLE_GOOGLE_PLACES = 'true';

    setRouteLookaheadFetcherForTests(async () => ({
      route: 'home-airport',
      duration: 36,
      congestion: 'medium',
      trustStatus: 'live',
      sourceName: 'Google Routes API',
      lastUpdated: new Date().toISOString(),
      assumptions: [],
    }));

    const result = await resolveRouteLookahead({
      origin: 'Monroe, WA',
      destination: 'SEA',
      mode: 'depart_at',
      targetTime: '2026-06-01T08:00:00.000Z',
      airportCode: 'SEA',
    });

    expect(isGooglePlacesLiveBlocked()).toBe(true);
    expect(result.trafficAwareMinutes).toBe(36);
    expect(result.source).toBe('google-routes');
  });
});
