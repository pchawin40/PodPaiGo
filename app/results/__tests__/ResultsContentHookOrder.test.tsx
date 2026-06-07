/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResultsContent, { buildRecommendationRequestKey } from '../ResultsContent';
import type { OptionScoreBreakdown, Recommendation, TripData } from '@/lib/types';
import { TRAVEL_PREFERENCES_STORAGE_KEY } from '@/lib/trip/travelPreferences';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  usePathname: () => '/results',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/app/components/AuthProvider', () => ({
  useAuth: () => ({ session: null }),
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

describe('ResultsContent hook order', () => {
  const originalLiveRefresh = process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH;

  afterEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = originalLiveRefresh;
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  test('recommendation request key changes by route, sort, preference, and trip id', () => {
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
    const fastestKey = buildRecommendationRequestKey({
      tripData: baseTrip,
      searchParams: new URLSearchParams('tripId=austin&sort=fastest'),
      sort: 'fastest',
      travelPreferences: preferences,
      showParkingAnyway: false,
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

    expect(new Set([austinKey, monroeKey, fastestKey, noParkingKey]).size).toBe(4);
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

    expect(screen.getByText(/Loading options|Recalculating/)).toBeInTheDocument();

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
    expect(screen.getByText('Estimated drive time')).toBeInTheDocument();
    expect(screen.getAllByText('Drive route').length).toBeGreaterThan(0);
    expect(screen.getAllByText('28 min').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pickup wait').length).toBeGreaterThan(0);
    expect(screen.getByText('Check app')).toBeInTheDocument();
    expect(screen.queryByText('Parking filters')).not.toBeInTheDocument();
    expect(screen.queryByText('More parking options')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Garage One')).not.toBeInTheDocument();
    expect(screen.queryByText('Test Garage Two')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show parking anyway/i }));

    await waitFor(() => {
      expect(screen.getByText('Parking is visible for comparison.')).toBeInTheDocument();
      expect(screen.getByText('More parking options')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Test Garage Two').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Change preference/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Car and parking preference').length).toBeGreaterThan(0);
    });
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

  test('changing from no-parking to driving refreshes hero winner and preserves route timing', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = 'false';
    const firstRecommendation = cityTripRecommendationForPreferenceToggle();
    const unavailableRefresh = cityTripRecommendationForPreferenceToggle({
      duration: 0,
      routeUnavailable: true,
      routeUnavailableReason: 'Route budget exceeded',
      routeStatus: 'unavailable',
      routeSource: 'unavailable',
      sourceName: 'Route budget',
    });
    jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    let recommendationCalls = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/recommendations') {
        recommendationCalls += 1;
        const body = recommendationCalls === 1 ? firstRecommendation : unavailableRefresh;
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
    window.localStorage.setItem(
      TRAVEL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ businessTravelMode: 'no_parking', parkingFilters: {} }),
    );

    render(
      <ResultsContent
        storedSearchParams={cityTripSearchParams({
          destination: 'Neighborhood Cafe, Seattle, WA',
          destinationName: 'Neighborhood Cafe',
          destinationKind: 'restaurant',
          parkingPreference: 'none',
          originLat: '47.8554',
          originLng: '-121.9709',
          destinationLat: '47.6250',
          destinationLng: '-122.3450',
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Take Rideshare').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Estimated drive time')).toBeInTheDocument();
    expect(screen.getAllByText('28 min').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Change preference/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Car and parking preference').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /I’m driving \/ need parking/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Check customer parking first').length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) => String(input) === '/api/recommendations'),
      ).toHaveLength(2);
    });
    expect(screen.getAllByText('28 min').length).toBeGreaterThan(0);
    expect(screen.queryByText('Drive timing could not be confirmed for this result.')).not.toBeInTheDocument();
    expect(screen.getByText('Driving / parking preference')).toBeInTheDocument();
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
  });
});
