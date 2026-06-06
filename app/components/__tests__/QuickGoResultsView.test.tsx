/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import QuickGoResultsView from '@/app/components/QuickGoResultsView';
import { buildQuickGoSearchParams } from '@/lib/trip/quickGo';
import type { Recommendation, RideshareOption, TrafficEstimate } from '@/lib/types';
import type { TripData } from '@/lib/types';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const tripData: TripData = {
  type: 'general-trip',
  origin: '123 Main Street, Example City, ST',
  destination: 'Grocery store',
  destinationName: 'Grocery store',
  destinationKind: 'general',
  arrivalDate: '2026-06-01',
  arrivalTime: '10:00',
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
  trafficEstimate: trafficEstimate({
    duration: 24,
    trustStatus: 'estimated',
  }),
} satisfies Recommendation;

function trafficEstimate(overrides: Partial<TrafficEstimate>): TrafficEstimate {
  return {
    route: 'origin-to-destination',
    duration: 24,
    congestion: 'low',
    trustStatus: 'estimated',
    sourceName: 'Test traffic',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    assumptions: [],
    ...overrides,
  };
}

function rideshareOption(overrides: Partial<RideshareOption> = {}): RideshareOption {
  return {
    id: 'rideshare',
    name: 'Rideshare',
    duration: 24,
    price: 20,
    availability: 80,
    trustStatus: 'estimated',
    sourceName: 'Test rideshare',
    lastUpdated: '2026-06-01T00:00:00.000Z',
    assumptions: [],
    ...overrides,
  };
}

describe('QuickGoResultsView', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  test('renders simplified quick go card without airport companion copy', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Grocery store',
      origin: {
        origin: '123 Main Street, Example City, ST',
        originLabel: '123 Main Street, Example City, ST',
        originSource: 'manual',
      },
    });
    params.set('airport', 'SEA');
    params.set('airportCode', 'SEA');

    render(
      <QuickGoResultsView
        tripData={tripData}
        recommendation={recommendation}
        rankedOptions={[
          {
            type: 'rideshare',
            option: rideshareOption(),
            score: 80,
            cost: 20,
            duration: 24,
            stressScore: 72,
            reasons: [],
          },
        ]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Best way to go')).toBeInTheDocument();
    expect(screen.getByText('Parking expectation')).toBeInTheDocument();
    expect(
      screen.getByText('From typed origin: 123 Main Street, Example City, ST · timing set to now'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open directions' })).toBeInTheDocument();
    expect(screen.queryByText(/Terminal companion/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/TSA/i)).not.toBeInTheDocument();
    expect(screen.queryByText('SEA')).not.toBeInTheDocument();
  });

  test('shows saved-origin debug label on results card', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Coffee shop',
      origin: {
        origin: '456 Oak Avenue, Sample Town, ST',
        originLabel: '456 Oak Avenue, Sample Town, ST',
        originSource: 'saved',
      },
    });

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          origin: '456 Oak Avenue, Sample Town, ST',
          destination: 'Coffee shop',
          destinationName: 'Coffee shop',
        }}
        recommendation={recommendation}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(
      screen.getByText('From saved origin: 456 Oak Avenue, Sample Town, ST · timing set to now'),
    ).toBeInTheDocument();
  });

  test('Fred Meyer retail shows Drive and free customer parking', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Fred Meyer, U.S. 2, Monroe, WA, USA',
      origin: {
        origin: '123 Main Street, Example City, ST',
        originLabel: '123 Main Street, Example City, ST',
        originSource: 'manual',
      },
    });

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Fred Meyer, U.S. 2, Monroe, WA, USA',
          destinationName: 'Fred Meyer, U.S. 2, Monroe, WA, USA',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({ duration: 12, trustStatus: 'estimated' }),
        }}
        rankedOptions={[
          {
            type: 'rideshare',
            option: rideshareOption({ duration: 14, price: 18 }),
            score: 85,
            cost: 18,
            duration: 14,
            stressScore: 68,
            reasons: [],
          },
        ]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Drive')).toBeInTheDocument();
    expect(screen.getByText('Free customer parking likely')).toBeInTheDocument();
    expect(screen.getByText('High confidence')).toBeInTheDocument();
    expect(screen.getByText('Rideshare / taxi')).toBeInTheDocument();
  });

  test('shows airport planner prompt when airport was detected', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'SEA Airport',
      origin: {
        origin: '123 Main Street, Example City, ST',
        originLabel: '123 Main Street, Example City, ST',
        originSource: 'manual',
      },
    });
    params.set('detectedAirportCode', 'SEA');
    params.set('detectedAirport', '1');

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'SEA Airport',
          destinationName: 'SEA Airport',
        }}
        recommendation={recommendation}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(
      screen.getByText('This looks like an airport trip. Want to use the full airport planner?'),
    ).toBeInTheDocument();
  });

  test('does not show "0 min" when the route is unavailable', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Costco, Everett, WA',
      origin: {
        origin: '123 Main Street, Example City, ST',
        originLabel: '123 Main Street, Example City, ST',
        originSource: 'manual',
      },
    });

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Costco, Everett, WA',
          destinationName: 'Costco, Everett, WA',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({
            duration: 0,
            routeUnavailable: true,
            trustStatus: 'fallback',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
    expect(screen.getByText('Drive time unavailable')).toBeInTheDocument();
    expect(screen.getByText('Open directions to confirm drive time')).toBeInTheDocument();
  });

  test('shows fallback text when a fallback estimate returns 0 duration', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Costco, Everett, WA',
      origin: {
        origin: '123 Main Street, Example City, ST',
        originLabel: '123 Main Street, Example City, ST',
        originSource: 'manual',
      },
    });

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Costco, Everett, WA',
          destinationName: 'Costco, Everett, WA',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({ duration: 0, trustStatus: 'fallback' }),
        }}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
    expect(screen.getByText('Drive time unavailable')).toBeInTheDocument();
  });

  test('shows estimated drive time for coordinate fallback', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
      origin: {
        origin: '47.855,-121.97',
        originLabel: 'Current location',
        originSource: 'geolocation',
        originLat: 47.855,
        originLng: -121.97,
      },
      destination: {
        destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
        destinationLabel: 'Brighton Jones',
        destinationAddress: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
        destinationSource: 'google',
        destinationLat: 47.6062,
        destinationLng: -122.3377,
      },
    });

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          origin: '47.855,-121.97',
          originLat: 47.855,
          originLng: -121.97,
          destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
          destinationName: 'Brighton Jones',
          destinationLat: 47.6062,
          destinationLng: -122.3377,
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: {
            ...trafficEstimate({
              duration: 34,
              trustStatus: 'estimated',
              sourceName: 'Estimated from coordinates',
            }),
          },
        }}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Straight-line fallback estimate: ~34 min')).toBeInTheDocument();
    expect(screen.getByText('Open directions to confirm.')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('shows live drive time for Google Routes estimates', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Costco, Everett, WA',
      origin: {
        origin: '123 Main Street, Example City, ST',
        originLabel: '123 Main Street, Example City, ST',
        originSource: 'manual',
      },
    });

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Costco, Everett, WA',
          destinationName: 'Costco, Everett, WA',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: {
            ...trafficEstimate({
              duration: 18,
              trustStatus: 'live',
              sourceName: 'Google Routes API',
            }),
          },
        }}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Live drive time: 18 min')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('keeps route drive time separate from explicit parking buffer total', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Pike Place Market, Seattle, WA',
      origin: {
        origin: '123 Main Street, Example City, ST',
        originLabel: '123 Main Street, Example City, ST',
        originSource: 'manual',
      },
    });

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Pike Place Market, Seattle, WA',
          destinationName: 'Pike Place Market',
          destinationKind: 'downtown',
          parkingDuration: 3 * 60,
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: {
            ...trafficEstimate({
              duration: 4,
              trustStatus: 'live',
              sourceName: 'Google Routes API',
            }),
          },
        }}
        rankedOptions={[
          {
            type: 'parking',
            option: {
              id: 'destination-parking',
              name: 'Destination Garage',
              type: 'official',
              price: 18,
              distance: 1,
              availability: 80,
              trustStatus: 'live',
              sourceName: 'Test parking',
              lastUpdated: '2026-06-01T00:00:00.000Z',
              assumptions: [],
              originToParkingMinutes: 4,
              parkingBufferMinutes: 4,
              transferToTerminalMinutes: 0,
              walkingMinutes: 0,
              transferType: 'walk',
            },
            score: 90,
            cost: 18,
            duration: 4,
            stressScore: 70,
            reasons: [],
          },
        ]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Live drive time: 4 min')).toBeInTheDocument();
    expect(screen.getByText('Total trip time')).toBeInTheDocument();
    expect(screen.getByText('4 min drive + 12 min parking/walk buffer')).toBeInTheDocument();
    expect(screen.queryByText(/Recommended option/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Best choice/i)).not.toBeInTheDocument();
  });

  test('shows backup route estimate label without foregrounding Mapbox', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
      origin: {
        origin: '13907 Chain Lake Rd, Monroe, WA 98272',
        originLabel: '13907 Chain Lake Rd, Monroe, WA 98272',
        originSource: 'manual',
      },
    });

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
          destinationName: 'Fred Meyer',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: {
            ...trafficEstimate({
              duration: 4,
              trustStatus: 'live',
              sourceName: 'Mapbox Directions',
            }),
          },
        }}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Estimated drive time: ~4 min')).toBeInTheDocument();
    expect(screen.getByText('Backup routing source used. Open directions to confirm.')).toBeInTheDocument();
    expect(screen.queryByText(/Mapbox route estimate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Straight-line fallback/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
    // Google Maps remains the user-facing directions link.
    expect(screen.getByRole('link', { name: 'Open directions' })).toBeInTheDocument();
  });
});
