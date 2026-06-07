/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResultsContent from '../ResultsContent';
import type { Recommendation } from '@/lib/types';

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

describe('ResultsContent hook order', () => {
  const originalLiveRefresh = process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH;

  afterEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_PARKING_LIVE_REFRESH = originalLiveRefresh;
    jest.restoreAllMocks();
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
    expect(screen.getByText('Drive route')).toBeInTheDocument();
    expect(screen.getAllByText('28 min').length).toBeGreaterThan(0);
    expect(screen.getByText('Pickup wait')).toBeInTheDocument();
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
});
