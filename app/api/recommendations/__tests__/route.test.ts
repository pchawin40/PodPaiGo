import { NextRequest } from 'next/server';

const generateRecommendations = jest.fn();
const trackServerEvent = jest.fn();

jest.mock('@/lib/recommendationEngine', () => ({
  RecommendationEngine: {
    generateRecommendations: (...args: unknown[]) => generateRecommendations(...args),
  },
}));

jest.mock('@/lib/analytics/serverTrackEvent', () => ({
  trackServerEvent: (...args: unknown[]) => trackServerEvent(...args),
}));

jest.mock('@/lib/apiUsage/searchBudget', () => ({
  runWithSearchBudget: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

jest.mock('@/lib/apiUsage/placesRequestBudget', () => ({
  runWithPlacesRequestBudget: (_key: string, fn: () => Promise<unknown>) => fn(),
}));

const tripData = {
  type: 'general-trip',
  origin: '123 Main St, Seattle, WA',
  destination: 'Downtown Seattle',
  destinationKind: 'downtown',
  arrivalDate: '2026-06-01',
  arrivalTime: '18:00',
};

const recommendation = {
  parking: [],
  rideshare: [],
  transit: [],
  tsaEstimate: {
    destination: 'General',
    waitTime: 0,
    status: 'estimated',
    trustStatus: 'estimated',
    sourceName: 'Test',
    assumptions: [],
  },
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.10',
    },
    body: JSON.stringify(body),
  });
}

describe('/api/recommendations guardrails', () => {
  beforeEach(() => {
    jest.resetModules();
    generateRecommendations.mockReset();
    trackServerEvent.mockReset();
    process.env.RECOMMENDATIONS_CACHE_TTL_SECONDS = '0';
    process.env.RECOMMENDATIONS_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.RECOMMENDATIONS_RATE_LIMIT_MAX = '300';
    delete process.env.RECOMMENDATIONS_CACHE_MAX_ENTRIES;
    delete process.env.RECOMMENDATIONS_RATE_LIMIT_MAX_ENTRIES;
  });

  afterEach(() => {
    delete process.env.RECOMMENDATIONS_CACHE_TTL_SECONDS;
    delete process.env.RECOMMENDATIONS_RATE_LIMIT_WINDOW_MS;
    delete process.env.RECOMMENDATIONS_RATE_LIMIT_MAX;
    delete process.env.RECOMMENDATIONS_CACHE_MAX_ENTRIES;
    delete process.env.RECOMMENDATIONS_RATE_LIMIT_MAX_ENTRIES;
  });

  test('returns friendly rate limit response', async () => {
    process.env.RECOMMENDATIONS_RATE_LIMIT_MAX = '1';
    generateRecommendations.mockResolvedValue(recommendation);

    const { POST } = await import('../route');

    const first = await POST(request(tripData));
    expect(first.status).toBe(200);

    const second = await POST(
      request({
        ...tripData,
        arrivalTime: '19:00',
      }),
    );
    const json = await second.json();

    expect(second.status).toBe(429);
    expect(json).toEqual({
      error: 'rate_limited',
      message: 'Too many searches at once. Please wait a moment and try again.',
    });
    expect(trackServerEvent).toHaveBeenCalledWith(
      'rate_limit_hit',
      expect.objectContaining({
        tripType: 'general-trip',
        sourcePage: 'api_recommendations',
      }),
      expect.anything(),
    );
  });

  test('serves cached repeated recommendations without changing response shape', async () => {
    process.env.RECOMMENDATIONS_CACHE_TTL_SECONDS = '60';
    generateRecommendations.mockResolvedValue(recommendation);

    const { POST } = await import('../route');

    const first = await POST(request(tripData));
    const firstJson = await first.json();
    const second = await POST(request(tripData));
    const secondJson = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(secondJson).toEqual(firstJson);
    expect(generateRecommendations).toHaveBeenCalledTimes(1);
    expect(trackServerEvent).toHaveBeenCalledWith(
      'cache_hit',
      expect.objectContaining({
        cacheStatus: 'recommendation_cache',
        sourcePage: 'api_recommendations',
      }),
      expect.anything(),
    );
  });

  test('caps the in-memory recommendation response cache', async () => {
    process.env.RECOMMENDATIONS_CACHE_TTL_SECONDS = '60';
    process.env.RECOMMENDATIONS_CACHE_MAX_ENTRIES = '1';
    generateRecommendations.mockResolvedValue(recommendation);

    const route = await import('../route');

    const first = await route.POST(request({ ...tripData, destination: 'Downtown Seattle' }));
    const second = await route.POST(request({ ...tripData, destination: 'Capitol Hill Seattle' }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(route.getRecommendationCacheSizeForTests()).toBeLessThanOrEqual(1);
  });

  test('caps the in-memory recommendation rate-limit map', async () => {
    process.env.RECOMMENDATIONS_RATE_LIMIT_MAX_ENTRIES = '1';
    const guard = await import('../../../../lib/apiUsage/recommendationsGuard');

    guard.checkRecommendationsRateLimit(
      new NextRequest('http://localhost/api/recommendations', {
        headers: { 'x-forwarded-for': '203.0.113.20' },
      }),
    );
    guard.checkRecommendationsRateLimit(
      new NextRequest('http://localhost/api/recommendations', {
        headers: { 'x-forwarded-for': '203.0.113.21' },
      }),
    );

    expect(guard.getRecommendationsRateLimitEntryCountForTests()).toBeLessThanOrEqual(1);
  });
});
