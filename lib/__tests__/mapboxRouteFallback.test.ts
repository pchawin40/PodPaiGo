import { LiveTrafficProvider } from '../providers';
import { resetApiUsageStateForTests } from '../apiUsage/guard';
import { resetSearchBudgetForTests } from '../apiUsage/searchBudget';

const ORIGIN = { lat: 47.8508, lng: -121.987 };

// Distinct destination per test so the module-level route cache doesn't bleed across tests.
function destFor(n: number): { lat: number; lng: number } {
  return { lat: 47.86 + n * 0.001, lng: -121.972 };
}

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

function mapboxOk(durationSeconds: number, distance = 3000): MockResponse {
  return {
    ok: true,
    status: 200,
    json: async () => ({ routes: [{ duration: durationSeconds, distance }] }),
    text: async () => '',
  };
}

function googleMatrixOk(): MockResponse {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify([
        {
          originIndex: 0,
          destinationIndex: 0,
          duration: '210s',
          condition: 'ROUTE_EXISTS',
          distanceMeters: 3000,
        },
      ]),
    json: async () => ({}),
  };
}

function googleMatrixNoRoute(): MockResponse {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify([
        {
          originIndex: 0,
          destinationIndex: 0,
          condition: 'ROUTE_NOT_FOUND',
          status: { code: 5, message: 'not found' },
        },
      ]),
    json: async () => ({}),
  };
}

function installFetch(handler: (url: string, init?: RequestInit) => MockResponse | Promise<MockResponse>) {
  const calls: string[] = [];
  const mock = jest.fn(async (url: unknown, init?: RequestInit) => {
    calls.push(String(url));
    return await handler(String(url), init) as unknown as Response;
  });
  global.fetch = mock as unknown as typeof fetch;
  return { calls };
}

describe('Mapbox backup route timing', () => {
  const ORIGINAL_ENV = { ...process.env };
  const ORIGINAL_FETCH = global.fetch;
  let provider: LiveTrafficProvider;

  beforeEach(() => {
    resetApiUsageStateForTests();
    resetSearchBudgetForTests();
    process.env.GOOGLE_MAPS_SERVER_API_KEY = 'test-google-key';
    delete process.env.DISABLE_GOOGLE_ROUTES;
    process.env.GOOGLE_ROUTES_DAILY_LIMIT = '100';
    process.env.GOOGLE_ROUTES_MONTHLY_LIMIT = '100';
    process.env.GEOCODING_DAILY_LIMIT = '100';
    process.env.GEOCODING_MONTHLY_LIMIT = '100';
    delete process.env.GOOGLE_ROUTE_TIMEOUT_MS;
    delete process.env.MAPBOX_ROUTE_TIMEOUT_MS;
    process.env.MAPBOX_ACCESS_TOKEN = 'test-mapbox-token';
    // Construct after env is set (serverKey is read in the constructor).
    provider = new LiveTrafficProvider();
  });

  afterEach(() => {
    resetApiUsageStateForTests();
    resetSearchBudgetForTests();
    process.env = { ...ORIGINAL_ENV };
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  test('Google live success does not call Mapbox', async () => {
    const { calls } = installFetch((url) =>
      url.includes('routes.googleapis.com') ? googleMatrixOk() : mapboxOk(210),
    );

    const estimate = await provider.getTrafficEstimate(
      'Monroe, WA',
      'Fred Meyer, Monroe, WA',
      new Date().toISOString(),
      destFor(1),
      { routePurpose: 'main_to_destination', originLatLng: ORIGIN },
    );

    expect(estimate.sourceName).toBe('Google Routes API');
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
  });

  test('Google unavailable (kill switch) calls Mapbox and Mapbox wins over coordinate fallback', async () => {
    process.env.DISABLE_GOOGLE_ROUTES = 'true';
    const { calls } = installFetch(() => mapboxOk(210));

    const estimate = await provider.getTrafficEstimate(
      'Monroe, WA',
      'Fred Meyer, Monroe, WA',
      new Date().toISOString(),
      destFor(2),
      { routePurpose: 'main_to_destination', originLatLng: ORIGIN },
    );

    expect(estimate.sourceName).toBe('Mapbox Directions');
    expect(estimate.trustStatus).toBe('live');
    expect(estimate.routeUnavailable).not.toBe(true);
    // 210s -> ~3.5 -> 4 min; Monroe -> Fred Meyer style local route, not 8.
    expect(estimate.duration).toBeGreaterThanOrEqual(3);
    expect(estimate.duration).toBeLessThanOrEqual(4);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(true);
    expect(calls.some((u) => u.includes('routes.googleapis.com'))).toBe(false);
  });

  test('Google coordinate/no-route fallback does not prevent Mapbox attempt', async () => {
    const { calls } = installFetch((url) =>
      url.includes('routes.googleapis.com') ? googleMatrixNoRoute() : mapboxOk(210),
    );

    const estimate = await provider.getTrafficEstimate(
      'Monroe, WA',
      'Fred Meyer, Monroe, WA',
      new Date().toISOString(),
      destFor(7),
      { routePurpose: 'main_to_destination', originLatLng: ORIGIN, tripMode: 'quick-go' },
    );

    expect(estimate.sourceName).toBe('Mapbox Directions');
    expect(estimate.duration).toBeGreaterThanOrEqual(3);
    expect(estimate.duration).toBeLessThanOrEqual(4);
    expect(calls.some((u) => u.includes('routes.googleapis.com'))).toBe(true);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(true);
  });

  test('Google timeout aborts into Mapbox before coordinate fallback', async () => {
    process.env.GOOGLE_ROUTE_TIMEOUT_MS = '5';
    process.env.MAPBOX_ROUTE_TIMEOUT_MS = '200';
    const calls: string[] = [];
    global.fetch = jest.fn((url: unknown, init?: RequestInit) => {
      const requestUrl = String(url);
      calls.push(requestUrl);

      if (requestUrl.includes('routes.googleapis.com')) {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          const rejectAbort = () => {
            const error = new Error('Google route request aborted');
            error.name = 'AbortError';
            reject(error);
          };

          if (signal?.aborted) {
            rejectAbort();
            return;
          }

          signal?.addEventListener('abort', rejectAbort, { once: true });
        });
      }

      return Promise.resolve(mapboxOk(210) as unknown as Response);
    }) as unknown as typeof fetch;

    const estimate = await provider.getTrafficEstimate(
      'Monroe, WA',
      'Fred Meyer, Monroe, WA',
      new Date().toISOString(),
      destFor(8),
      { routePurpose: 'main_to_destination', originLatLng: ORIGIN, tripMode: 'quick-go' },
    );

    expect(estimate.sourceName).toBe('Mapbox Directions');
    expect(estimate.duration).toBeGreaterThanOrEqual(3);
    expect(estimate.duration).toBeLessThanOrEqual(4);
    expect(calls.some((u) => u.includes('routes.googleapis.com'))).toBe(true);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(true);
  });

  test('missing MAPBOX_ACCESS_TOKEN skips Mapbox and uses coordinate fallback', async () => {
    process.env.DISABLE_GOOGLE_ROUTES = 'true';
    delete process.env.MAPBOX_ACCESS_TOKEN;
    const { calls } = installFetch(() => mapboxOk(210));

    const estimate = await provider.getTrafficEstimate(
      'Monroe, WA',
      'Fred Meyer, Monroe, WA',
      new Date().toISOString(),
      destFor(3),
      { routePurpose: 'main_to_destination', originLatLng: ORIGIN },
    );

    expect(estimate.sourceName).toBe('Estimated from coordinates');
    expect(estimate.routeUnavailable).not.toBe(true);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(false);
  });

  test('Mapbox error uses coordinate fallback', async () => {
    process.env.DISABLE_GOOGLE_ROUTES = 'true';
    installFetch((url) =>
      url.includes('api.mapbox.com')
        ? { ok: false, status: 500, json: async () => ({}), text: async () => '' }
        : mapboxOk(210),
    );

    const estimate = await provider.getTrafficEstimate(
      'Monroe, WA',
      'Fred Meyer, Monroe, WA',
      new Date().toISOString(),
      destFor(4),
      { routePurpose: 'main_to_destination', originLatLng: ORIGIN },
    );

    expect(estimate.sourceName).toBe('Estimated from coordinates');
    expect(estimate.routeUnavailable).not.toBe(true);
  });

  test('successful Mapbox result is cached as serveable (no refetch on second call)', async () => {
    // Budget-exceeded (not kill switch) so the route cache IS consulted on the second call.
    process.env.GOOGLE_ROUTES_DAILY_LIMIT = '0';
    const dest = destFor(5);
    const dateTime = '2026-06-01T10:00:00.000Z';
    const { calls } = installFetch(() => mapboxOk(210));

    const first = await provider.getTrafficEstimate('Monroe, WA', 'Fred Meyer, Monroe, WA', dateTime, dest, {
      routePurpose: 'main_to_destination',
      originLatLng: ORIGIN,
    });
    expect(first.sourceName).toBe('Mapbox Directions');
    const mapboxCallsAfterFirst = calls.filter((u) => u.includes('api.mapbox.com')).length;
    expect(mapboxCallsAfterFirst).toBeGreaterThan(0);

    const second = await provider.getTrafficEstimate('Monroe, WA', 'Fred Meyer, Monroe, WA', dateTime, dest, {
      routePurpose: 'main_to_destination',
      originLatLng: ORIGIN,
    });
    expect(second.sourceName).toBe('Mapbox Directions');
    const mapboxCallsAfterSecond = calls.filter((u) => u.includes('api.mapbox.com')).length;
    // Served from the route cache: no additional Mapbox call.
    expect(mapboxCallsAfterSecond).toBe(mapboxCallsAfterFirst);
  });

  test('cached coordinate fallback does not prevent a later Mapbox retry', async () => {
    process.env.GOOGLE_ROUTES_DAILY_LIMIT = '0';
    delete process.env.MAPBOX_ACCESS_TOKEN;
    const dest = destFor(9);
    const dateTime = '2026-06-01T10:10:00.000Z';
    const { calls } = installFetch(() => mapboxOk(210));

    const first = await provider.getTrafficEstimate('Monroe, WA', 'Fred Meyer, Monroe, WA', dateTime, dest, {
      routePurpose: 'main_to_destination',
      originLatLng: ORIGIN,
      tripMode: 'quick-go',
    });
    expect(first.sourceName).toBe('Estimated from coordinates');
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(false);

    process.env.MAPBOX_ACCESS_TOKEN = 'test-mapbox-token';
    const second = await provider.getTrafficEstimate('Monroe, WA', 'Fred Meyer, Monroe, WA', dateTime, dest, {
      routePurpose: 'main_to_destination',
      originLatLng: ORIGIN,
      tripMode: 'quick-go',
    });

    expect(second.sourceName).toBe('Mapbox Directions');
    expect(second.duration).toBeGreaterThanOrEqual(3);
    expect(second.duration).toBeLessThanOrEqual(4);
    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(true);
  });

  test('Mapbox can back up parking origin-to-lot routes when Google is unavailable', async () => {
    process.env.DISABLE_GOOGLE_ROUTES = 'true';
    const { calls } = installFetch(() => mapboxOk(3300));

    const estimate = await provider.getTrafficEstimate(
      'Monroe, WA',
      'Some Parking Lot',
      new Date().toISOString(),
      destFor(6),
      { routePurpose: 'parking_origin_to_lot', lotId: 'lot-123', originLatLng: ORIGIN },
    );

    expect(calls.some((u) => u.includes('api.mapbox.com'))).toBe(true);
    expect(estimate.sourceName).toBe('Mapbox Directions');
    expect(estimate.duration).toBe(55);
  });
});
