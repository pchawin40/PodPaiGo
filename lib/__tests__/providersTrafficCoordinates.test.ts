import { resetApiUsageStateForTests } from '../apiUsage/guard';
import { resetSearchBudgetForTests } from '../apiUsage/searchBudget';
import { LiveTrafficProvider } from '../providers';

const ORIGINAL_ENV = process.env;

function routesResponse(element: unknown): Response {
  return {
    status: 200,
    text: async () => JSON.stringify([element]),
  } as Response;
}

describe('LiveTrafficProvider coordinate routing', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    resetApiUsageStateForTests();
    resetSearchBudgetForTests();
    process.env = {
      ...ORIGINAL_ENV,
      GOOGLE_MAPS_SERVER_API_KEY: 'test-key',
      DISABLE_PARKING_DB_CACHE: 'true',
      GOOGLE_ROUTES_DAILY_LIMIT: '100',
      GOOGLE_ROUTES_MONTHLY_LIMIT: '100',
      GEOCODING_DAILY_LIMIT: '100',
      GEOCODING_MONTHLY_LIMIT: '100',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetApiUsageStateForTests();
    resetSearchBudgetForTests();
    process.env = ORIGINAL_ENV;
  });

  test('uses coordinate origin and destination waypoints without geocoding text', async () => {
    const provider = new LiveTrafficProvider();
    const geocodeSpy = jest.spyOn(provider, 'geocodeAddress');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      routesResponse({
        condition: 'ROUTE_EXISTS',
        status: {},
        duration: '900s',
        staticDuration: '780s',
        distanceMeters: 12_345,
      }),
    );

    const estimate = await provider.getTrafficEstimate(
      'Current location',
      'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      '2026-06-01T10:00:00.000Z',
      { lat: 47.6062, lng: -122.3377 },
      {
        lotId: 'coordinate-waypoint-test',
        routePurpose: 'main_to_destination',
        originLatLng: { lat: 47.855, lng: -121.97 },
      },
    );

    expect(estimate.trustStatus).toBe('live');
    expect(estimate.duration).toBe(15);
    expect(geocodeSpy).not.toHaveBeenCalled();

    const routeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('routes.googleapis.com'),
    );
    expect(routeCall).toBeDefined();
    const body = JSON.parse(String(routeCall?.[1]?.body));
    expect(body.origins[0].waypoint.location.latLng).toEqual({
      latitude: 47.855,
      longitude: -121.97,
    });
    expect(body.destinations[0].waypoint.location.latLng).toEqual({
      latitude: 47.6062,
      longitude: -122.3377,
    });
  });

  test('returns estimated coordinate fallback when Google Routes reports no route', async () => {
    const provider = new LiveTrafficProvider();
    jest.spyOn(global, 'fetch').mockResolvedValue(
      routesResponse({
        condition: 'ROUTE_NOT_FOUND',
        status: { code: 5, message: 'not found' },
      }),
    );

    const estimate = await provider.getTrafficEstimate(
      'Current location',
      'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      '2026-06-01T10:05:00.000Z',
      { lat: 47.6062, lng: -122.3377 },
      {
        lotId: 'coordinate-fallback-test',
        routePurpose: 'main_to_destination',
        originLatLng: { lat: 47.855, lng: -121.97 },
      },
    );

    expect(estimate.routeUnavailable).toBe(false);
    expect(estimate.duration).toBeGreaterThan(0);
    expect(estimate.trustStatus).toBe('estimated');
    expect(estimate.sourceName).toBe('Estimated from coordinates');
    expect(estimate.assumptions).toContain(
      'Estimated from straight-line distance; open directions to confirm.',
    );
  });

  test('uses one geocode pass for coordinate fallback when input coordinates are missing', async () => {
    const provider = new LiveTrafficProvider();
    jest.spyOn(provider, 'geocodeAddress').mockImplementation(async (address) => {
      if (address === 'Monroe, WA') return { lat: 47.855, lng: -121.97 };
      if (address === 'Brighton Jones, 1st Avenue, Seattle, WA, USA') {
        return { lat: 47.6062, lng: -122.3377 };
      }
      return null;
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(
      routesResponse({
        condition: 'ROUTE_NOT_FOUND',
        status: { code: 5, message: 'not found' },
      }),
    );

    const estimate = await provider.getTrafficEstimate(
      'Monroe, WA',
      'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      '2026-06-01T10:10:00.000Z',
      null,
      { lotId: 'geocoded-coordinate-fallback-test', routePurpose: 'main_to_destination' },
    );

    expect(provider.geocodeAddress).toHaveBeenCalledTimes(2);
    expect(estimate.routeUnavailable).toBe(false);
    expect(estimate.duration).toBeGreaterThan(0);
    expect(estimate.sourceName).toBe('Estimated from coordinates');
  });

  test('missing coordinates and failed route remains unavailable without airport copy', async () => {
    const provider = new LiveTrafficProvider();
    jest.spyOn(provider, 'geocodeAddress').mockResolvedValue(null);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      routesResponse({
        condition: 'ROUTE_NOT_FOUND',
        status: { code: 5, message: 'not found' },
      }),
    );

    const estimate = await provider.getTrafficEstimate(
      'Monroe, WA',
      'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      '2026-06-01T10:15:00.000Z',
      null,
      { lotId: 'missing-coordinate-unavailable-test', routePurpose: 'main_to_destination' },
    );

    expect(estimate.routeUnavailable).toBe(true);
    expect(estimate.duration).toBe(0);
    expect(estimate.routeUnavailableReason).not.toMatch(/airport area/i);
  });
});
