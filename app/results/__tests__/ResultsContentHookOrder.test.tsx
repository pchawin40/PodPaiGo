/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ResultsContent, {
  buildRecommendationProviderRequestKey,
  buildRecommendationRequestKey,
  buildParkingTripIdentityKey,
} from '../ResultsContent';
import type { OptionScoreBreakdown, Recommendation, TripData } from '@/lib/types';
import { TRAVEL_PREFERENCES_STORAGE_KEY } from '@/lib/trip/travelPreferences';

const mockRouterReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockRouterReplace,
  }),
  usePathname: () => '/results',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/app/components/AuthProvider', () => ({
  useAuth: () => ({ session: null }),
}));

let mockResultsIsAdmin = false;

jest.mock('@/app/components/useAdminStatus', () => ({
  useAdminStatus: () => ({
    configured: true,
    loading: false,
    signedIn: mockResultsIsAdmin,
    isAdmin: mockResultsIsAdmin,
    accessToken: mockResultsIsAdmin ? 'admin-token' : null,
    statusCode: mockResultsIsAdmin ? 200 : 403,
  }),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function cityTripSearchParams(overrides?: Record<string, string>): string {
  const params = new URLSearchParams({
    type: 'general-trip',
    origin: 'Monroe, WA',
    destination: 'Pike Place Market, Seattle, WA',
    destinationName: 'Pike Place Market',
    destinationKind: 'downtown',
    arrivalDate: '2026-06-07',
    arrivalTime: '19:30',
    parkingDuration: '120',
    parkingPreference: 'nearby',
    transport: 'all',
    transitPayment: 'normal',
    ...overrides,
  });
  return params.toString();
}

function quickGoCityTripSearchParams(overrides?: Record<string, string>): string {
  return cityTripSearchParams({
    type: 'quick-go',
    tripMode: 'quick-go',
    quickGoConfirmed: '1',
    destination: 'Fred Meyer Monroe WA',
    destinationName: 'Fred Meyer Monroe WA',
    destinationKind: 'general',
    originLat: '47.8554',
    originLng: '-121.9709',
    destinationLat: '47.8550',
    destinationLng: '-121.9700',
    ...overrides,
  });
}

function fullDetailsFromQuickGoSearchParams(overrides?: Record<string, string>): string {
  return cityTripSearchParams({
    quickGoConfirmed: '1',
    destination: 'Fred Meyer Monroe WA',
    destinationName: 'Fred Meyer Monroe WA',
    destinationKind: 'general',
    originLat: '47.8554',
    originLng: '-121.9709',
    destinationLat: '47.8550',
    destinationLng: '-121.9700',
    ...overrides,
  });
}

function getQuickGoSnapshotSessionStorageKey(): string {
  const keys = Array.from({ length: window.sessionStorage.length }, (_, index) =>
    window.sessionStorage.key(index),
  ).filter((key): key is string => Boolean(key));
  const key = keys.find((value) => value.startsWith('podpaigo-quickgo-recommendation:'));
  expect(key).toBeTruthy();
  return key as string;
}

function cityTripRecommendation(): Recommendation {
  return {
    parking: [],
    rideshare: [
      {
        id: 'rideshare',
        name: 'Rideshare',
        price: 24,
        duration: 22,
        availability: 80,
        trustStatus: 'estimated',
        sourceName: 'Test rideshare',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    ],
    transit: [
      {
        id: 'transit',
        name: 'Transit',
        price: 3,
        duration: 45,
        frequency: 15,
        availability: 70,
        trustStatus: 'estimated',
        sourceName: 'Test transit',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    ],
    tsaEstimate: {
      destination: 'Pike Place Market',
      waitTime: 0,
      status: 'estimated',
      trustStatus: 'estimated',
      sourceName: 'Test',
      assumptions: [],
    },
    trafficEstimate: {
      route: 'origin-to-destination',
      duration: 28,
      congestion: 'low',
      trustStatus: 'estimated',
      sourceName: 'Test traffic',
      lastUpdated: '2026-06-01T00:00:00.000Z',
      assumptions: [],
    },
    parkingDataStatus: 'empty',
  };
}

function cityTripRecommendationWithParking(): Recommendation {
  return {
    ...cityTripRecommendation(),
    parkingDataStatus: 'available',
    parking: [
      {
        id: 'test-garage-one',
        name: 'Test Garage One',
        type: 'off-airport',
        price: 12,
        distance: 4,
        duration: 20,
        routeToParkingMinutes: 15,
        parkingBufferMinutes: 4,
        walkToDestinationMinutes: 1,
        availability: 90,
        trustStatus: 'estimated',
        sourceName: 'Test parking',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
      {
        id: 'test-garage-two',
        name: 'Test Garage Two',
        type: 'off-airport',
        price: 18,
        distance: 6,
        duration: 25,
        routeToParkingMinutes: 18,
        parkingBufferMinutes: 5,
        walkToDestinationMinutes: 2,
        availability: 85,
        trustStatus: 'estimated',
        sourceName: 'Test parking',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    ],
  };
}

function cityTripRecommendationWithEstimatedParking(): Recommendation {
  const recommendation = cityTripRecommendationWithParking();
  return {
    ...recommendation,
    parking: [
      {
        ...recommendation.parking[0],
        id: 'estimated-garage-placeholder',
        name: 'Estimated Garage Placeholder',
        price: 12,
        priceMin: 10,
        priceMax: 18,
        priceDisplay: 'estimated',
        priceSource: 'estimated',
        pricingConfidence: 'estimated',
        priceConfidence: 'medium',
        trustStatus: 'estimated',
        sourceName: 'Estimated parking',
        priceNote: 'Estimated nearby garage range. Confirm live price before parking.',
      },
    ],
  };
}

function namedParkingOption(name: string, id: string) {
  return {
    id,
    name,
    type: 'off-airport' as const,
    price: 14,
    distance: 5,
    duration: 22,
    routeToParkingMinutes: 16,
    parkingBufferMinutes: 4,
    walkToDestinationMinutes: 2,
    availability: 88,
    trustStatus: 'estimated' as const,
    sourceName: 'Test parking',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    assumptions: [],
  };
}

function cityTripRecommendationWithNamedParking(name: string, id: string): Recommendation {
  return {
    ...cityTripRecommendationWithParking(),
    parkingDataStatus: 'available',
    parking: [namedParkingOption(name, id)],
  };
}

function cityTripRecommendationWithActualParking(): Recommendation {
  const recommendation = cityTripRecommendationWithParking();
  return {
    ...recommendation,
    parking: [
      {
        ...recommendation.parking[0],
        id: 'actual-live-garage',
        name: 'Actual Live Garage',
        price: 11,
        priceDisplay: 'live',
        priceUnit: 'total',
        priceSource: 'marketplace-link',
        pricingConfidence: 'live',
        priceConfidence: 'high',
        trustStatus: 'live',
        sourceName: 'ParkWhiz',
        bookingProvider: 'ParkWhiz',
        sourceLink: 'https://example.test/actual-live-garage',
        priceNote: 'Live marketplace quote for this parking window.',
      },
    ],
  };
}

function scoreBreakdown(
  overrides: Partial<OptionScoreBreakdown> & Pick<OptionScoreBreakdown, 'optionId' | 'mode'>,
): OptionScoreBreakdown {
  return {
    totalCostCents: null,
    totalTimeMinutes: null,
    confidenceScore: 70,
    frictionScore: 30,
    walkMinutes: null,
    waitMinutes: null,
    driveMinutes: null,
    parkingBufferMinutes: null,
    sourceFreshnessScore: 70,
    easiestScore: 50,
    cheapestScore: 50,
    fastestScore: 50,
    reasons: [],
    penalties: [],
    ...overrides,
  };
}

function cityTripRecommendationForPreferenceToggle(
  trafficOverride?: Partial<NonNullable<Recommendation['trafficEstimate']>>,
): Recommendation {
  return {
    ...cityTripRecommendationWithParking(),
    trafficEstimate: {
      route: 'origin-to-destination',
      duration: 28,
      congestion: 'low',
      trustStatus: 'estimated',
      sourceName: 'Test traffic',
      lastUpdated: '2026-06-01T00:00:00.000Z',
      assumptions: [],
      ...trafficOverride,
    },
    rideshare: [
      {
        id: 'rideshare',
        name: 'Rideshare',
        priceDisplay: 'check-live',
        duration: 31,
        totalOptionMinutes: 31,
        pickupWaitMinutes: 3,
        availability: 80,
        trustStatus: 'estimated',
        rideshareEstimateConfidence: 'unavailable',
        sourceName: 'Test rideshare',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    ],
    transit: [
      {
        id: 'transit',
        name: 'Transit',
        price: 3,
        duration: 52,
        frequency: 15,
        availability: 70,
        trustStatus: 'estimated',
        sourceName: 'Test transit',
        lastUpdated: '2026-06-01T00:00:00.000Z',
        assumptions: [],
      },
    ],
    optionScoreBreakdowns: [
      scoreBreakdown({
        optionId: 'customer',
        mode: 'customer_parking',
        totalCostCents: 0,
        totalTimeMinutes: 30,
        driveMinutes: 28,
        parkingBufferMinutes: 2,
        easiestScore: 92,
        cheapestScore: 95,
        fastestScore: 88,
        bestOverallScore: 92,
      }),
      scoreBreakdown({
        optionId: 'test-garage-one',
        mode: 'parking',
        totalCostCents: 1200,
        totalTimeMinutes: 34,
        driveMinutes: 29,
        parkingBufferMinutes: 4,
        walkMinutes: 1,
        easiestScore: 72,
        cheapestScore: 65,
        fastestScore: 74,
        bestOverallScore: 72,
      }),
      scoreBreakdown({
        optionId: 'rideshare',
        mode: 'rideshare',
        totalCostCents: null,
        totalTimeMinutes: 31,
        driveMinutes: 28,
        waitMinutes: 3,
        easiestScore: 84,
        cheapestScore: 40,
        fastestScore: 84,
        bestOverallScore: 84,
      }),
      scoreBreakdown({
        optionId: 'transit',
        mode: 'transit',
        totalCostCents: 300,
        totalTimeMinutes: 52,
        waitMinutes: 10,
        walkMinutes: 8,
        easiestScore: 58,
        cheapestScore: 90,
        fastestScore: 55,
        bestOverallScore: 58,
      }),
    ],
  };
}

function installResultsFetchMock(recommendation: Recommendation) {
  const fetchMock = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/recommendations') {
      return Promise.resolve({
        ok: true,
        text: async () => JSON.stringify(recommendation),
        json: async () => recommendation,
      });
    }
    return Promise.resolve({
      ok: true,
      text: async () => '{}',
      json: async () => ({ context: 'unavailable', weatherImpact: null }),
    });
  });

  Object.defineProperty(global, 'fetch', {
    configurable: true,
    writable: true,
    value: fetchMock,
  });

  return fetchMock;
}

function getParkingPlanCard(sectionId = 'paid-parking-details'): HTMLElement {
  const detailsSection = document.getElementById(sectionId);
  expect(detailsSection).toBeInTheDocument();
  const heading = within(detailsSection as HTMLElement).getByRole('heading', {
    name: 'Parking plan',
  });
  const planCard = heading.closest('section');
  expect(planCard).toBeInTheDocument();
  return planCard as HTMLElement;
}

function getRouteTimeCard(): HTMLElement {
  const label = screen.getByText('Route time');
  const card = label.parentElement;
  expect(card).toBeInTheDocument();
  return card as HTMLElement;
}

function searchParamsFromResultsPath(path: string): URLSearchParams {
  const query = path.split('?')[1];
  if (query) return new URLSearchParams(query);

  const match = path.match(/\/results\/([^/?#]+)/);
  expect(match?.[1]).toBeTruthy();

  const raw = window.localStorage.getItem(`podpaigo-trip-${decodeURIComponent(match![1])}`);
  expect(raw).toBeTruthy();
  const payload = JSON.parse(raw as string) as { query?: string };
  expect(payload.query).toBeTruthy();
  return new URLSearchParams(payload.query);
}

function restoreEnvVar(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe('ResultsContent hook order', () => {
  const originalLiveRefresh = process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH;
  const originalDebugLogs = process.env.DEBUG_LOGS;
  const originalDebugUi = process.env.NEXT_PUBLIC_DEBUG_UI;
  const originalAdminDebug = process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG;
  const originalAllowLocalAdmin = process.env.ALLOW_LOCAL_ADMIN;

  afterEach(() => {
    restoreEnvVar('NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH', originalLiveRefresh);
    restoreEnvVar('DEBUG_LOGS', originalDebugLogs);
    restoreEnvVar('NEXT_PUBLIC_DEBUG_UI', originalDebugUi);
    restoreEnvVar('NEXT_PUBLIC_ENABLE_ADMIN_DEBUG', originalAdminDebug);
    restoreEnvVar('ALLOW_LOCAL_ADMIN', originalAllowLocalAdmin);
    mockResultsIsAdmin = false;
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockRouterReplace.mockClear();
    jest.restoreAllMocks();
  });

  test('provider recommendation key ignores sort while display key can change by sort', () => {
    const baseTrip: TripData = {
      type: 'general-trip',
      origin: 'La Quinta Inn & Suites by Wyndham Austin Airport',
      destination: 'Franklin Barbecue, 900 E 11th St, Austin TX',
      destinationName: 'Franklin Barbecue',
      destinationKind: 'restaurant',
      originLat: 30.2141,
      originLng: -97.6663,
      destinationLat: 30.2701,
      destinationLng: -97.7313,
      arrivalDate: '2026-06-07',
      arrivalTime: '12:00',
      parkingDuration: 90,
      parkingPreference: 'nearby',
      transportAvailability: 'all',
    };
    const preferences = {
      businessTravelMode: 'standard' as const,
      parkingFilters: {},
    };

    const austinKey = buildRecommendationRequestKey({
      tripData: baseTrip,
      searchParams: new URLSearchParams('tripId=austin&sort=easiest'),
      sort: 'easiest',
      travelPreferences: preferences,
      showParkingAnyway: false,
    });
    const austinProviderKey = buildRecommendationProviderRequestKey({
      tripData: baseTrip,
      searchParams: new URLSearchParams('tripId=austin&sort=easiest'),
    });
    const monroeKey = buildRecommendationRequestKey({
      tripData: {
        ...baseTrip,
        origin: 'Monroe, WA',
        destination: 'Brighton Jones, Seattle, WA',
        destinationName: 'Brighton Jones',
        destinationKind: 'office',
        originLat: 47.8554,
        originLng: -121.9709,
        destinationLat: 47.6097,
        destinationLng: -122.3341,
      },
      searchParams: new URLSearchParams('tripId=monroe&sort=easiest'),
      sort: 'easiest',
      travelPreferences: preferences,
      showParkingAnyway: false,
    });
    const monroeProviderKey = buildRecommendationProviderRequestKey({
      tripData: {
        ...baseTrip,
        origin: 'Monroe, WA',
        destination: 'Brighton Jones, Seattle, WA',
        destinationName: 'Brighton Jones',
        destinationKind: 'office',
        originLat: 47.8554,
        originLng: -121.9709,
        destinationLat: 47.6097,
        destinationLng: -122.3341,
      },
      searchParams: new URLSearchParams('tripId=monroe&sort=easiest'),
    });
    const fastestKey = buildRecommendationRequestKey({
      tripData: baseTrip,
      searchParams: new URLSearchParams('tripId=austin&sort=fastest'),
      sort: 'fastest',
      travelPreferences: preferences,
      showParkingAnyway: false,
    });
    const fastestProviderKey = buildRecommendationProviderRequestKey({
      tripData: baseTrip,
      searchParams: new URLSearchParams('tripId=austin&sort=fastest'),
    });
    const noParkingKey = buildRecommendationRequestKey({
      tripData: baseTrip,
      searchParams: new URLSearchParams('tripId=austin&sort=easiest&parkingPreference=none'),
      sort: 'easiest',
      travelPreferences: {
        businessTravelMode: 'no_parking',
        parkingFilters: {},
      },
      showParkingAnyway: false,
    });
    const noParkingProviderKey = buildRecommendationProviderRequestKey({
      tripData: baseTrip,
      searchParams: new URLSearchParams('tripId=austin&sort=easiest&parkingPreference=none'),
    });

    expect(new Set([austinKey, monroeKey, fastestKey, noParkingKey]).size).toBe(4);
    expect(fastestProviderKey).toBe(austinProviderKey);
    expect(new Set([austinProviderKey, monroeProviderKey, noParkingProviderKey]).size).toBe(3);
  });

  test('transitions from loading to city trip results without adding hooks', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendationResponse = deferred<{
      ok: boolean;
      text: () => Promise<string>;
      json: () => Promise<unknown>;
    }>();
    const recommendation = cityTripRecommendation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          return recommendationResponse.promise;
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    expect(screen.getByText('Finding nearby parking…')).toBeInTheDocument();

    await act(async () => {
      recommendationResponse.resolve({
        ok: true,
        text: async () => JSON.stringify(recommendation),
        json: async () => recommendation,
      });
      await recommendationResponse.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('General trip')).toBeInTheDocument();
    });

    const hookOrderErrors = consoleErrorSpy.mock.calls.filter((call) =>
      call.some((value) =>
        String(value).includes('Rendered more hooks than during the previous render'),
      ),
    );
    expect(hookOrderErrors).toHaveLength(0);
  });

  test('city trip loading without prior parking shows staged parking loading copy', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendationResponse = deferred<{
      ok: boolean;
      text: () => Promise<string>;
      json: () => Promise<unknown>;
    }>();
    const recommendation = cityTripRecommendation();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          return recommendationResponse.promise;
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    expect(screen.getByText('Finding nearby parking…')).toBeInTheDocument();
    expect(screen.getByText('Checking garages, lots, and street rules.')).toBeInTheDocument();

    await act(async () => {
      recommendationResponse.resolve({
        ok: true,
        text: async () => JSON.stringify(recommendation),
        json: async () => recommendation,
      });
      await recommendationResponse.promise;
    });
  });

  test('sort-only changes rerank locally without refetching recommendations', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const firstRecommendation = cityTripRecommendationWithActualParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    let recommendationCalls = 0;

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          recommendationCalls += 1;
          if (recommendationCalls === 1) {
            return Promise.resolve({
              ok: true,
              text: async () => JSON.stringify(firstRecommendation),
              json: async () => firstRecommendation,
            });
          }
          return Promise.resolve({
            ok: true,
            text: async () => {
              throw new Error('sort-only change should not refetch recommendations');
            },
            json: async () => {
              throw new Error('sort-only change should not refetch recommendations');
            },
          });
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getAllByText('Actual Live Garage').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /Cheapest/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Actual Live Garage').length).toBeGreaterThan(0);
    });
    expect(recommendationCalls).toBe(1);
    expect(screen.getAllByText('Actual Live Garage').length).toBeGreaterThan(0);
    expect(screen.queryByText('Parking search unavailable')).not.toBeInTheDocument();
  });

  test('Quick Go full details hydrates from a fresh session snapshot without refetching', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithActualParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    let recommendationCalls = 0;

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          recommendationCalls += 1;
          if (recommendationCalls > 1) {
            return Promise.resolve({
              ok: false,
              text: async () => 'unexpected duplicate recommendation fetch',
              json: async () => ({}),
            });
          }
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify(recommendation),
            json: async () => recommendation,
          });
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    const quickGoRender = render(
      <ResultsContent storedSearchParams={quickGoCityTripSearchParams()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Quick Go')).toBeInTheDocument();
      expect(recommendationCalls).toBe(1);
    });
    expect(getQuickGoSnapshotSessionStorageKey()).toBeTruthy();

    quickGoRender.unmount();

    render(<ResultsContent storedSearchParams={fullDetailsFromQuickGoSearchParams()} />);

    await waitFor(() => {
      expect(screen.getByText('General trip')).toBeInTheDocument();
      expect(screen.getAllByText('Actual Live Garage').length).toBeGreaterThan(0);
    });
    expect(recommendationCalls).toBe(1);
  });

  test('full details direct load without a Quick Go snapshot fetches normally', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithActualParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const fetchMock = installResultsFetchMock(recommendation);

    render(<ResultsContent storedSearchParams={fullDetailsFromQuickGoSearchParams()} />);

    await waitFor(() => {
      expect(screen.getAllByText('Actual Live Garage').length).toBeGreaterThan(0);
    });
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/recommendations'),
    ).toHaveLength(1);
  });

  test('expired Quick Go session snapshot is ignored and full details refetches', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithActualParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    let recommendationCalls = 0;

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          recommendationCalls += 1;
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify(recommendation),
            json: async () => recommendation,
          });
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    const quickGoRender = render(
      <ResultsContent storedSearchParams={quickGoCityTripSearchParams()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Quick Go')).toBeInTheDocument();
      expect(recommendationCalls).toBe(1);
    });

    const snapshotKey = getQuickGoSnapshotSessionStorageKey();
    const snapshot = JSON.parse(window.sessionStorage.getItem(snapshotKey) as string) as {
      createdAt: number;
    };
    window.sessionStorage.setItem(
      snapshotKey,
      JSON.stringify({
        ...snapshot,
        createdAt: Date.now() - 5 * 60 * 1000 - 1,
      }),
    );

    quickGoRender.unmount();
    render(<ResultsContent storedSearchParams={fullDetailsFromQuickGoSearchParams()} />);

    await waitFor(() => {
      expect(recommendationCalls).toBe(2);
      expect(screen.getAllByText('Actual Live Garage').length).toBeGreaterThan(0);
    });
  });

  test('Quick Go snapshot is rejected when trip timing identity changes', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithActualParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    let recommendationCalls = 0;

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          recommendationCalls += 1;
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify(recommendation),
            json: async () => recommendation,
          });
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    const quickGoRender = render(
      <ResultsContent storedSearchParams={quickGoCityTripSearchParams()} />,
    );

    await waitFor(() => {
      expect(screen.getByText('Quick Go')).toBeInTheDocument();
      expect(recommendationCalls).toBe(1);
    });

    quickGoRender.unmount();
    render(
      <ResultsContent
        storedSearchParams={fullDetailsFromQuickGoSearchParams({
          arrivalTime: '20:30',
          parkingCheckInTime: '20:30',
          parkingCheckOutTime: '22:30',
        })}
      />,
    );

    await waitFor(() => {
      expect(recommendationCalls).toBe(2);
      expect(screen.getAllByText('Actual Live Garage').length).toBeGreaterThan(0);
    });
  });

  test('customer-parking Quick Go skips parking live refresh follow-up', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'true';
    const recommendation: Recommendation = {
      ...cityTripRecommendation(),
      parkingDataStatus: 'not_requested',
      parkingDataMessage: 'Customer parking likely — verify signs.',
    };
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const fetchMock = installResultsFetchMock(recommendation);

    render(<ResultsContent storedSearchParams={quickGoCityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getByText('Quick Go')).toBeInTheDocument();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/recommendations'),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/parking/live-refresh'),
    ).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input) === '/api/google-place-match'),
    ).toHaveLength(0);
  });

  test('parking trip identity key is stable for sort-only changes but changes on trip identity', () => {
    const baseTrip: TripData = {
      type: 'general-trip',
      origin: 'Monroe, WA',
      destination: 'Pike Place Market, Seattle, WA',
      destinationName: 'Pike Place Market',
      destinationKind: 'downtown',
      arrivalDate: '2026-06-07',
      arrivalTime: '19:30',
      parkingDuration: 120,
      parkingCheckInDate: '2026-06-07',
      parkingCheckInTime: '19:30',
      parkingCheckOutDate: '2026-06-07',
      parkingCheckOutTime: '21:30',
      transportAvailability: 'all',
    };

    const keyOf = (trip: TripData, params = new URLSearchParams()) =>
      buildParkingTripIdentityKey({ tripData: trip, searchParams: params });

    const baseKey = keyOf(baseTrip);

    // Sort/control changes are not part of the parking identity key.
    expect(keyOf(baseTrip, new URLSearchParams('sort=cheapest'))).toBe(
      keyOf(baseTrip, new URLSearchParams('sort=fastest')),
    );
    expect(keyOf(baseTrip, new URLSearchParams('sort=cheapest'))).toBe(baseKey);

    // Any identity / timing / window change must change the key.
    expect(keyOf({ ...baseTrip, destination: 'Lumen Field, Seattle, WA' })).not.toBe(baseKey);
    expect(keyOf({ ...baseTrip, destinationName: 'Lumen Field' })).not.toBe(baseKey);
    expect(keyOf({ ...baseTrip, destinationKind: 'stadium' })).not.toBe(baseKey);
    expect(keyOf({ ...baseTrip, destinationLat: 47.5952, destinationLng: -122.3316 })).not.toBe(baseKey);
    expect(
      keyOf({ ...(baseTrip as TripData), destinationPlaceId: 'place-123' } as TripData),
    ).not.toBe(baseKey);
    expect(keyOf({ ...baseTrip, origin: 'Bellevue, WA' })).not.toBe(baseKey);
    expect(keyOf({ ...baseTrip, arrivalDate: '2026-06-08' })).not.toBe(baseKey);
    expect(keyOf({ ...baseTrip, arrivalTime: '20:30' })).not.toBe(baseKey);
    expect(keyOf({ ...baseTrip, parkingCheckOutTime: '23:30' })).not.toBe(baseKey);
    expect(keyOf({ ...baseTrip, parkingDuration: 240 })).not.toBe(baseKey);
    expect(keyOf(baseTrip, new URLSearchParams('tripId=different'))).not.toBe(baseKey);
  });

  test('changing destination clears previous parking and never renders the old lot', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);

    const downtownRec = cityTripRecommendationWithNamedParking('Pier 66 Surface Lot', 'pier-66');
    const stadiumRec = cityTripRecommendationWithNamedParking('Lumen Field Garage', 'lumen-garage');

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          const body = JSON.parse(String(init?.body ?? '{}')) as TripData;
          const rec = body.destination.includes('Lumen Field') ? stadiumRec : downtownRec;
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify(rec),
            json: async () => rec,
          });
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    const { rerender } = render(
      <ResultsContent storedSearchParams={cityTripSearchParams()} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Pier 66 Surface Lot').length).toBeGreaterThan(0);
    });

    rerender(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          destination: 'Lumen Field, Seattle, WA',
          destinationName: 'Lumen Field',
          destinationKind: 'stadium',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Lumen Field Garage').length).toBeGreaterThan(0);
    });

    // The previous destination's lot must not survive into the new trip.
    expect(screen.queryByText('Pier 66 Surface Lot')).not.toBeInTheDocument();
  });

  test('stale live-refresh response cannot merge parking into a newer destination', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'true';
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const downtownRec = cityTripRecommendationWithNamedParking('Downtown Garage', 'downtown-garage');
    const stadiumRec = cityTripRecommendationWithNamedParking('Lumen Field Garage', 'lumen-garage');

    const downtownRefresh = deferred<{ ok: boolean; json: () => Promise<unknown> }>();

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body ? (JSON.parse(String(init.body)) as { destination?: string }) : {};

        if (url === '/api/recommendations') {
          const rec = String(body.destination).includes('Lumen Field') ? stadiumRec : downtownRec;
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify(rec),
            json: async () => rec,
          });
        }

        if (url === '/api/parking/live-refresh') {
          // The previous (downtown) refresh resolves late with a foreign lot.
          if (String(body.destination).includes('Lumen Field')) {
            return Promise.resolve({ ok: true, json: async () => ({ parking: [] }) });
          }
          return downtownRefresh.promise;
        }

        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    const { rerender } = render(
      <ResultsContent storedSearchParams={cityTripSearchParams()} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Downtown Garage').length).toBeGreaterThan(0);
    });

    // Switch to the stadium destination before the downtown refresh resolves.
    rerender(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          destination: 'Lumen Field, Seattle, WA',
          destinationName: 'Lumen Field',
          destinationKind: 'stadium',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Lumen Field Garage').length).toBeGreaterThan(0);
    });

    // Now the stale downtown live-refresh arrives with "Pier 66 Surface Lot".
    await act(async () => {
      downtownRefresh.resolve({
        ok: true,
        json: async () => ({ parking: [namedParkingOption('Pier 66 Surface Lot', 'pier-66')] }),
      });
      await downtownRefresh.promise;
    });

    expect(screen.queryByText('Pier 66 Surface Lot')).not.toBeInTheDocument();
    expect(screen.getAllByText('Lumen Field Garage').length).toBeGreaterThan(0);
  });

  test('estimated parking placeholder is labeled estimated, not confirmed', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithEstimatedParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getByText('Estimated parking nearby')).toBeInTheDocument();
    });

    const planCard = getParkingPlanCard();
    expect(within(planCard).getByText('Estimated Garage Placeholder')).toBeInTheDocument();
    expect(
      within(planCard).getAllByText('Nearby garages or lots may be available. Confirm live price and rules before parking.').length,
    ).toBeGreaterThan(0);
    expect(within(planCard).queryByText('Best confirmed paid option')).not.toBeInTheDocument();
    expect(within(planCard).queryByText('Confirmed paid parking option')).not.toBeInTheDocument();
  });

  test('actual priced lots replace estimated placeholder when returned', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const secondRecommendationResponse = deferred<{
      ok: boolean;
      text: () => Promise<string>;
      json: () => Promise<unknown>;
    }>();
    const estimatedRecommendation = cityTripRecommendationWithEstimatedParking();
    const actualRecommendation = cityTripRecommendationWithActualParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    let recommendationCalls = 0;

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          recommendationCalls += 1;
          if (recommendationCalls === 1) {
            return Promise.resolve({
              ok: true,
              text: async () => JSON.stringify(estimatedRecommendation),
              json: async () => estimatedRecommendation,
            });
          }
          return secondRecommendationResponse.promise;
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    const { rerender } = render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getAllByText('Estimated Garage Placeholder').length).toBeGreaterThan(0);
    });

    rerender(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          arrivalTime: '20:30',
          parkingCheckInTime: '20:30',
          parkingCheckOutTime: '22:30',
        })}
      />,
    );

    await waitFor(() => {
      expect(recommendationCalls).toBe(2);
    });

    await act(async () => {
      secondRecommendationResponse.resolve({
        ok: true,
        text: async () => JSON.stringify(actualRecommendation),
        json: async () => actualRecommendation,
      });
      await secondRecommendationResponse.promise;
    });

    await waitFor(() => {
      expect(screen.getAllByText('Actual Live Garage').length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('Estimated Garage Placeholder')).not.toBeInTheDocument();
    expect(screen.getByText('Nearby parking options')).toBeInTheDocument();
  });

  test('general-trip edit panel has one clean heading and renders prefilled origin and destination inputs', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          arrivalDate: '2027-06-07',
          destination: 'Pike Place Market, Seattle, WA',
          destinationName: 'Pike Place Market',
          destinationKind: 'downtown',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit trip' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit trip' }));

    const panel = document.getElementById('edit-trip-panel');
    expect(panel).toBeInTheDocument();
    expect(within(panel as HTMLElement).getAllByRole('heading', { name: 'Edit trip details' })).toHaveLength(1);
    expect(within(panel as HTMLElement).queryByRole('heading', { name: 'Edit trip' })).not.toBeInTheDocument();
    expect(
      within(panel as HTMLElement).getByText('Adjust your timing, origin, or destination. We’ll recalculate instantly.'),
    ).toBeInTheDocument();

    const inputs = within(panel as HTMLElement).getAllByRole('combobox') as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toHaveValue('Monroe, WA');
    expect(inputs[1]).toHaveValue('Pike Place Market');
  });

  test('changing general-trip destination updates recalculation params and clears stale destination coordinates', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          arrivalDate: '2027-06-07',
          destination: 'Pike Place Market, Seattle, WA',
          destinationName: 'Pike Place Market',
          destinationKind: 'downtown',
          destinationLat: '47.6091',
          destinationLng: '-122.3421',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit trip' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit trip' }));
    const panel = document.getElementById('edit-trip-panel') as HTMLElement;
    const inputs = within(panel).getAllByRole('combobox') as HTMLInputElement[];
    const destinationInput = inputs[1];

    fireEvent.change(destinationInput, {
      target: { value: 'Brighton Jones, Seattle, WA' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Recalculate' }));

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalled();
    });

    const path = String(mockRouterReplace.mock.calls.at(-1)?.[0] || '');
    const params = searchParamsFromResultsPath(path);
    expect(params.get('destination')).toBe('Brighton Jones, Seattle, WA');
    expect(params.get('destinationName')).toBe('Brighton Jones, Seattle, WA');
    expect(params.get('destinationKind')).toBe('downtown');
    expect(params.get('destinationLat')).toBeNull();
    expect(params.get('destinationLng')).toBeNull();
  });

  test('airport trip edit form still only renders the origin address input', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendation();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);
    const params = new URLSearchParams({
      type: 'one-way-departure',
      intent: 'flying-out',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      airportCode: 'SEA',
      departureDate: '2027-06-07',
      departureTime: '10:00',
      transport: 'all',
      transitPayment: 'normal',
      parkingPreference: 'nearby',
    });

    render(<ResultsContent storedSearchParams={params.toString()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit trip' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Edit trip' }));
    const panel = document.getElementById('edit-trip-panel');
    expect(panel).toBeInTheDocument();
    const addressInputs = within(panel as HTMLElement).getAllByRole('combobox') as HTMLInputElement[];
    expect(addressInputs).toHaveLength(1);
    expect(addressInputs[0]).toHaveValue('Monroe, WA');
    expect(within(panel as HTMLElement).queryByText(/^Destination$/)).not.toBeInTheDocument();
  });

  test('non-admin airport results do not render SEA curated access diagnostic even when debug flag is enabled', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG = 'true';
    mockResultsIsAdmin = false;
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(cityTripRecommendation());

    const params = new URLSearchParams({
      type: 'one-way-departure',
      intent: 'flying-out',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      airportCode: 'SEA',
      departureDate: '2027-06-07',
      departureTime: '10:00',
      transport: 'all',
      transitPayment: 'normal',
      parkingPreference: 'nearby',
    });

    render(<ResultsContent storedSearchParams={params.toString()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit trip' })).toBeInTheDocument();
    });

    expect(screen.queryByText('SEA curated access diagnostic')).not.toBeInTheDocument();
    expect(screen.queryByText('SEA_CURATED_ACCESS=1')).not.toBeInTheDocument();
  });

  test('admin debug airport results can render SEA curated access diagnostic intentionally', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG = 'true';
    mockResultsIsAdmin = true;
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(cityTripRecommendation());

    const params = new URLSearchParams({
      type: 'one-way-departure',
      intent: 'flying-out',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      airportCode: 'SEA',
      departureDate: '2027-06-07',
      departureTime: '10:00',
      transport: 'all',
      transitPayment: 'normal',
      parkingPreference: 'nearby',
    });

    render(<ResultsContent storedSearchParams={params.toString()} />);

    await waitFor(() => {
      expect(screen.getByText('SEA curated access diagnostic')).toBeInTheDocument();
    });
    expect(screen.getByText('SEA_CURATED_ACCESS=1')).toBeInTheDocument();
  });

  test('airport results render one clear recommended plan summary with caveat and CTAs', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(cityTripRecommendationWithParking());

    const params = new URLSearchParams({
      type: 'one-way-departure',
      intent: 'flying-out',
      origin: 'Monroe, WA',
      destination: 'Seattle-Tacoma International Airport',
      airportCode: 'SEA',
      departureDate: '2027-06-07',
      departureTime: '10:00',
      transport: 'all',
      transitPayment: 'normal',
      parkingPreference: 'nearby',
    });

    render(<ResultsContent storedSearchParams={params.toString()} />);

    await waitFor(() => {
      expect(screen.getByText('Recommended plan')).toBeInTheDocument();
    });

    expect(screen.queryByText('Smart recommendation')).not.toBeInTheDocument();
    expect(screen.getAllByText('Recommended plan')).toHaveLength(1);

    const summary = screen.getByTestId('recommended-plan-summary');
    expect(within(summary).getByText(/Recommended:/)).toBeInTheDocument();
    expect(within(summary).getByTestId('recommended-plan-inline-metrics')).toHaveTextContent(
      /Medium confidence/,
    );
    expect(within(summary).getByTestId('recommended-plan-why')).toHaveTextContent(
      /Can cost more than transit/,
    );
    expect(
      within(summary).getByRole('button', { name: 'Compare options' }),
    ).toBeInTheDocument();
    expect(within(summary).queryByText('Main caveat')).not.toBeInTheDocument();

    expect(document.getElementById('compare-options-grid')).toBeInTheDocument();
  });

  test('hides more parking options while no-parking preference is active', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify(recommendation),
            json: async () => recommendation,
          });
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({ parkingPreference: 'none' })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No parking needed / rideshare strategy')).toBeInTheDocument();
    });

    expect(screen.queryByText('Car and parking preference')).not.toBeInTheDocument();
    const routeTimeCard = getRouteTimeCard();
    expect(within(routeTimeCard).getAllByText('28 min').length).toBeGreaterThan(0);
    expect(within(routeTimeCard).getByText('Origin to destination')).toBeInTheDocument();
    expect(screen.getAllByText('Drive route').length).toBeGreaterThan(0);
    expect(screen.getAllByText('28 min').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pickup wait').length).toBeGreaterThan(0);
    expect(screen.getByText('Check app')).toBeInTheDocument();
    expect(screen.queryByText('Filter parking')).not.toBeInTheDocument();
    expect(screen.queryByText('More parking options')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Garage One')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Garage Two')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show parking anyway/i }));

    await waitFor(() => {
      expect(screen.getByText('Parking is visible for comparison.')).toBeInTheDocument();
      expect(screen.getByText('More parking options')).toBeInTheDocument();
      expect(screen.getByText('Filter parking')).toBeInTheDocument();
    });
    expect(screen.queryByText(/inferred claims/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/strict filters/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/provider-claimed/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Test Garage Two').length).toBeGreaterThan(0);
    expect(screen.queryByText('Car and parking preference')).not.toBeInTheDocument();
    expect(screen.queryByText('Travel preferences')).not.toBeInTheDocument();
  });

  test('deduplicates Google rating chip on city parking cards', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithParking();
    recommendation.parking = [
      recommendation.parking[0],
      {
        ...recommendation.parking[1],
        name: 'Pike Place MarketFront Parking Garage',
        googlePlaceId: 'places/marketfront',
        googleMapsUri: 'https://maps.google.com/?cid=marketfront',
        reviewScore: 4.5,
        reviewCount: 332,
      },
    ];
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === '/api/recommendations') {
          return Promise.resolve({
            ok: true,
            text: async () => JSON.stringify(recommendation),
            json: async () => recommendation,
          });
        }
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({ context: 'unavailable', weatherImpact: null }),
        });
      }),
    });

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getAllByText('Pike Place MarketFront Parking Garage').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('★ 4.5 · 332 reviews')).toHaveLength(1);
  });

  test('switching stored travel mode to driving refreshes hero winner and preserves route timing', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const firstRecommendation = cityTripRecommendationForPreferenceToggle();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    let recommendationCalls = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/recommendations') {
        recommendationCalls += 1;
        const body = firstRecommendation;
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify(body),
          json: async () => body,
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => '{}',
        json: async () => ({ context: 'unavailable', weatherImpact: null }),
      });
    });

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const drivingTripParams = cityTripSearchParams({
      destination: 'Neighborhood Cafe, Seattle, WA',
      destinationName: 'Neighborhood Cafe',
      destinationKind: 'restaurant',
      parkingPreference: 'nearby',
      originLat: '47.8554',
      originLng: '-121.9709',
      destinationLat: '47.6250',
      destinationLng: '-122.3450',
    });

    window.localStorage.setItem(
      TRAVEL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ businessTravelMode: 'no_parking', parkingFilters: {} }),
    );

    const { unmount } = render(
      <ResultsContent storedSearchParams={drivingTripParams} />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Take Rideshare').length).toBeGreaterThan(0);
    });
    const firstRouteTimeCard = getRouteTimeCard();
    expect(within(firstRouteTimeCard).getAllByText('28 min').length).toBeGreaterThan(0);
    expect(screen.getAllByText('28 min').length).toBeGreaterThan(0);

    unmount();
    window.localStorage.setItem(
      TRAVEL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ businessTravelMode: 'standard', parkingFilters: {} }),
    );

    render(<ResultsContent storedSearchParams={drivingTripParams} />);

    await waitFor(() => {
      expect(screen.getAllByText('Check customer parking first').length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input) === '/api/recommendations'),
      ).toHaveLength(2);
    });
    expect(screen.getAllByText('28 min').length).toBeGreaterThan(0);
    expect(screen.queryByText('Drive time couldn’t be confirmed')).not.toBeInTheDocument();
    expect(screen.getByText('Filter parking')).toBeInTheDocument();
    expect(screen.getByText('Filter parking').closest('details')).not.toBeInTheDocument();
    expect(
      screen.getByText('Narrow lots by features. Always confirm details with the provider.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Covered')).toBeInTheDocument();
    expect(screen.getByText('Secured')).toBeInTheDocument();
    expect(screen.getByText('Shuttle')).toBeInTheDocument();
    expect(screen.getByText('EV charging')).toBeInTheDocument();
    expect(screen.getByText('Valet')).toBeInTheDocument();
    expect(screen.getByText('Self-park')).toBeInTheDocument();
    expect(screen.queryByText(/inferred claims/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/strict filters/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/provider-claimed/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Car and parking preference')).not.toBeInTheDocument();
  });

  test('general-trip View links target lower option detail sections', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationForPreferenceToggle();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);
    const scrollIntoView = jest.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          destination: 'Neighborhood Cafe, Seattle, WA',
          destinationName: 'Neighborhood Cafe',
          destinationKind: 'restaurant',
          originLat: '47.8554',
          originLng: '-121.9709',
          destinationLat: '47.6250',
          destinationLng: '-122.3450',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Check customer parking first').length).toBeGreaterThan(0);
    });

    const detailsLinks = screen.getAllByRole('link', { name: 'View' });
    const hrefs = detailsLinks.map((link) => link.getAttribute('href'));

    expect(hrefs).toContain('#customer-parking-details');
    expect(hrefs).toContain('#paid-parking-details');
    expect(hrefs).toContain('#rideshare-details');
    expect(hrefs).toContain('#transit-details');
    expect(hrefs).toContain('#park-ride-details');

    for (const id of [
      'customer-parking-details',
      'paid-parking-details',
      'rideshare-details',
      'transit-details',
      'park-ride-details',
    ]) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }

    fireEvent.click(detailsLinks.find((link) => link.getAttribute('href') === '#customer-parking-details')!);
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled();
    });
  });

  test('general-trip Park & Ride details show estimated rules, adult fare, and selected timing basis', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationForPreferenceToggle();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          origin: 'Lynnwood, WA',
          originLat: '47.8209',
          originLng: '-122.2931',
          destination: 'Downtown Seattle, WA',
          destinationName: 'Downtown Seattle',
          destinationLat: '47.6062',
          destinationLng: '-122.3321',
          arrivalDate: '2027-06-07',
          arrivalTime: '19:30',
        })}
      />,
    );

    await waitFor(() => {
      expect(document.getElementById('park-ride-details')).toBeInTheDocument();
    });

    const section = document.getElementById('park-ride-details') as HTMLElement;

    expect(within(section).getAllByText('$0–$5 est.').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('Verify overnight rules.').length).toBeGreaterThan(0);
    expect(within(section).queryByText(/Overnight rules vary by lot/i)).not.toBeInTheDocument();
    expect(within(section).getAllByText('$3 one-way adult est.').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('Timed for arrival around 7:30 PM').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('Schedule not confirmed — compare route.').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('Medium confidence').length).toBeGreaterThan(0);
    expect(within(section).getAllByText('Timing estimate; verify lot rules').length).toBeGreaterThan(0);
    expect(within(section).queryByText('High confidence')).not.toBeInTheDocument();
  });

  test('customer parking card is compact and details section keeps arrival checklist warnings', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationForPreferenceToggle();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          destination: 'Neighborhood Cafe, Seattle, WA',
          destinationName: 'Neighborhood Cafe',
          destinationKind: 'restaurant',
          originLat: '47.8554',
          originLng: '-121.9709',
          destinationLat: '47.6250',
          destinationLng: '-122.3450',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Check customer parking first').length).toBeGreaterThan(0);
    });

    const customerDetailsLink = screen
      .getAllByRole('link', { name: 'View' })
      .find((link) => link.getAttribute('href') === '#customer-parking-details');
    expect(customerDetailsLink).toBeDefined();

    const customerCard = screen.getByRole('group', { name: 'Customer parking recommendation' });
    expect(within(customerCard).getByText('Customer parking')).toBeInTheDocument();
    expect(within(customerCard).getAllByText('Free? Verify').length).toBeGreaterThan(0);
    expect(within(customerCard).getByText('Verify signs before parking.')).toBeInTheDocument();
    expect(
      within(customerCard).queryByText('Check signs, validation, time limits, and towing rules'),
    ).not.toBeInTheDocument();
    expect(within(customerCard).queryByText('Validation rules')).not.toBeInTheDocument();
    expect(within(customerCard).queryByText('Towing/private lot warning')).not.toBeInTheDocument();

    const detailsSection = document.getElementById('customer-parking-details');
    expect(detailsSection).toBeInTheDocument();
    expect(within(detailsSection as HTMLElement).getByRole('heading', { name: 'Parking plan' })).toBeInTheDocument();
    expect(within(detailsSection as HTMLElement).getByText('Recommended parking')).toBeInTheDocument();
    expect(within(detailsSection as HTMLElement).getByText('Before you park')).toBeInTheDocument();
    expect(within(detailsSection as HTMLElement).getByText('Check customer-only signs')).toBeInTheDocument();
    expect(within(detailsSection as HTMLElement).getByText('Confirm validation rules')).toBeInTheDocument();
    expect(within(detailsSection as HTMLElement).getByText('Check time limits')).toBeInTheDocument();
    expect(within(detailsSection as HTMLElement).getByText('Watch for towing/private lot restrictions')).toBeInTheDocument();
    expect(within(detailsSection as HTMLElement).getByText('This is not a reserved space')).toBeInTheDocument();

    expect(screen.getAllByRole('heading', { name: 'Parking plan' })).toHaveLength(1);
    expect(within(detailsSection as HTMLElement).getByText('Customer parking')).toBeInTheDocument();
    const paidParkingSection = document.getElementById('paid-parking-details');
    expect(paidParkingSection).toBeInTheDocument();
    expect(
      within(paidParkingSection as HTMLElement).queryByRole('heading', { name: 'Parking plan' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Best confirmed paid option')).not.toBeInTheDocument();
    expect(screen.getAllByText('Test Garage One').length).toBeGreaterThan(0);
  });

  test('paid parking details render a parking plan with recommendation, reasons, checklist, timing, and street note', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          destinationName: 'Pike Place Market, Seattle, WA',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Test Garage One').length).toBeGreaterThan(0);
    });

    const planCard = getParkingPlanCard();

    expect(within(planCard).getByRole('heading', { name: 'Parking plan' })).toBeInTheDocument();
    expect(within(planCard).queryByText('Parking options')).not.toBeInTheDocument();
    expect(within(planCard).getByText('Nearby parking options')).toBeInTheDocument();
    expect(within(planCard).getByText('Why this option')).toBeInTheDocument();
    expect(within(planCard).getByText('Before you park')).toBeInTheDocument();
    expect(within(planCard).getByText('Timing')).toBeInTheDocument();
    expect(within(planCard).getByText('Test Garage One')).toBeInTheDocument();
    expect(within(planCard).getAllByText('Best confirmed paid option').length).toBeGreaterThan(0);
    expect(within(planCard).getByText('Confirmed paid parking option')).toBeInTheDocument();
    expect(within(planCard).getByText('More reliable than guessing street parking')).toBeInTheDocument();
    expect(within(planCard).getByText('Confirm final price')).toBeInTheDocument();
    expect(within(planCard).getByText('Check hours')).toBeInTheDocument();
    expect(within(planCard).getByText('Check event or validation rules')).toBeInTheDocument();
    expect(within(planCard).getByText('Check towing/private lot signs')).toBeInTheDocument();
    expect(within(planCard).getByText('Drive to lot')).toBeInTheDocument();
    expect(within(planCard).getByText('Park/check-in buffer')).toBeInTheDocument();
    expect(within(planCard).getByText('Walk to destination')).toBeInTheDocument();
    expect(within(planCard).getByRole('link', { name: 'Route to parking' })).toBeInTheDocument();
    expect(within(planCard).getByText('Street parking note')).toBeInTheDocument();
    expect(
      within(planCard).getByText(
        'Street/meter parking may exist nearby, but availability and rules can vary. Check posted signs, meters, loading zones, time limits, and event restrictions before leaving your car.',
      ),
    ).toBeInTheDocument();
  });

  test('stadium parking plan labels street parking as a warning, not recommended parking', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          destination: 'Lumen Field, Seattle, WA',
          destinationName: 'Lumen Field',
          destinationKind: 'stadium',
          originLat: '47.8554',
          originLng: '-121.9709',
          destinationLat: '47.5952',
          destinationLng: '-122.3316',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Test Garage One').length).toBeGreaterThan(0);
    });

    const planCard = getParkingPlanCard();

    expect(within(planCard).getByText('Nearby parking options')).toBeInTheDocument();
    expect(within(planCard).getByText('Street parking warning')).toBeInTheDocument();
    expect(
      within(planCard).getByText(
        'Street/meter parking near event venues may be restricted, full, time-limited, or tow-enforced during games and events.',
      ),
    ).toBeInTheDocument();
    expect(within(planCard).queryByText('Street / meter parking')).not.toBeInTheDocument();
    expect(within(planCard).queryByText('Street parking note')).not.toBeInTheDocument();
  });

  test('parking plan shows estimated drive-to-lot timing from the main route when lot route timing is missing', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithParking();
    recommendation.parking = [
      {
        ...recommendation.parking[0],
        routeUnavailable: true,
        routeUnavailableReason: 'Route unavailable in test',
        routeToParkingMinutes: undefined,
        originToParkingMinutes: undefined,
        driveMinutes: undefined,
        duration: undefined,
        totalOptionMinutes: undefined,
        timingBreakdown: undefined,
      },
    ];
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getAllByText('Test Garage One').length).toBeGreaterThan(0);
    });

    const planCard = getParkingPlanCard();

    expect(within(planCard).getByText('Nearby parking options')).toBeInTheDocument();
    // The main origin→destination drive exists, so the missing origin→lot leg
    // falls back to an honest estimate labeled est. instead of disappearing.
    expect(within(planCard).getByText('Timing')).toBeInTheDocument();
    expect(within(planCard).getByText('Drive to lot')).toBeInTheDocument();
    const driveToLotValue = within(planCard)
      .getByText('Drive to lot')
      .closest('div')
      ?.querySelector('dd')?.textContent;
    expect(driveToLotValue).toMatch(/est\./);
  });

  test('route time card shows unavailable timing without directions link or debug warning copy', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithParking();
    recommendation.trafficEstimate = {
      ...recommendation.trafficEstimate!,
      duration: 0,
      routeUnavailable: true,
      routeUnavailableReason: 'Route budget exceeded; open map directions to confirm drive time.',
      trustStatus: 'unavailable',
    };
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getAllByText('Test Garage One').length).toBeGreaterThan(0);
    });

    const routeTimeCard = getRouteTimeCard();
    expect(within(routeTimeCard).getByText('Couldn’t confirm')).toBeInTheDocument();
    expect(within(routeTimeCard).getByText('Drive time unavailable')).toBeInTheDocument();
    expect(within(routeTimeCard).queryByRole('link', { name: /Open directions/i })).not.toBeInTheDocument();
    expect(within(routeTimeCard).queryByText(/Open directions/i)).not.toBeInTheDocument();

    expect(screen.queryByText('Drive time couldn’t be confirmed')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Parking and provider options are still shown. Use map directions to verify timing before you leave.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Route budget exceeded/i)).not.toBeInTheDocument();
    expect(getParkingPlanCard()).toBeInTheDocument();
  });

  test('city trip with no parking data renders empty parking plan', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendation();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getByText('General trip')).toBeInTheDocument();
    });

    const planCard = getParkingPlanCard();
    const routeTimeCard = getRouteTimeCard();
    expect(within(planCard).getByText('No bookable lots found yet')).toBeInTheDocument();
    expect(
      within(planCard).getByText('Street parking, transit, or rideshare may still be useful. Verify signs and map results.'),
    ).toBeInTheDocument();
    expect(within(planCard).queryByText('Route breakdown')).not.toBeInTheDocument();
    expect(within(routeTimeCard).queryByRole('link', { name: /Open directions/i })).not.toBeInTheDocument();
    expect(within(planCard).getByRole('link', { name: 'Open directions' })).toBeInTheDocument();
    expect(within(planCard).getByRole('link', { name: 'Search nearby parking' })).toBeInTheDocument();
  });

  test('city trip unavailable parking response renders search unavailable only when no fallback exists', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation: Recommendation = {
      ...cityTripRecommendation(),
      parkingDataStatus: 'unavailable',
      parkingDataMessage: 'Parking data unavailable right now. Try again or open directions.',
    };
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getByText('General trip')).toBeInTheDocument();
    });

    const planCard = getParkingPlanCard();
    expect(within(planCard).getByText('Parking search unavailable')).toBeInTheDocument();
    expect(within(planCard).getByText('Open map search to verify nearby parking.')).toBeInTheDocument();
    expect(within(planCard).queryByText('Parking data unavailable')).not.toBeInTheDocument();
  });

  test('city trip parking timeout keeps customer and street fallback plan', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation: Recommendation = {
      ...cityTripRecommendation(),
      parkingDataStatus: 'unavailable',
      parkingDataMessage:
        'Live parking search timed out. Use map search or street signs to verify nearby parking.',
      parkingDiscoveryStatus: 'partial_timeout',
      parkingDiscoveryMetadata: {
        status: 'partial_timeout',
        cachedCount: 0,
        liveCount: 0,
        providerErrors: ['parking fetch timed out'],
        message:
          'Live parking search timed out. Use map search or street signs to verify nearby parking.',
      },
    };
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    installResultsFetchMock(recommendation);

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          destination: 'Neighborhood Cafe, Seattle, WA',
          destinationName: 'Neighborhood Cafe',
          destinationKind: 'restaurant',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('General trip')).toBeInTheDocument();
    });

    const planCard = getParkingPlanCard();
    expect(screen.getAllByText('Check customer parking first').length).toBeGreaterThan(0);
    expect(within(planCard).getByText('No bookable lots found yet')).toBeInTheDocument();
    expect(
      within(planCard).getByText('Street parking, transit, or rideshare may still be useful. Verify signs and map results.'),
    ).toBeInTheDocument();
    expect(within(planCard).queryByText('Parking search unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing partial results/i)).not.toBeInTheDocument();
  });

  test('city parking results attempt Google place enrichment', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const recommendation = cityTripRecommendationWithParking();
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/recommendations') {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify(recommendation),
          json: async () => recommendation,
        });
      }
      if (url === '/api/google-place-match') {
        return Promise.resolve({
          ok: true,
          text: async () => '{}',
          json: async () => ({
            place: {
              googlePlaceId: 'google-test-garage-one',
              rating: 4.6,
              userRatingCount: 128,
              reviews: [],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        text: async () => '{}',
        json: async () => ({ context: 'unavailable', weatherImpact: null }),
      });
    });

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    render(<ResultsContent storedSearchParams={cityTripSearchParams()} />);

    await waitFor(() => {
      expect(screen.getByText('General trip')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input) === '/api/google-place-match'),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getAllByText('★ 4.6 · 128 reviews').length).toBeGreaterThan(0);
    });
  });
});
