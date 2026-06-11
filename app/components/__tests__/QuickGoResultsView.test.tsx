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

function trafficEstimate(
  overrides: Partial<TrafficEstimate> & {
    routeStatus?: TrafficEstimate['routeStatus'];
    routeSource?: TrafficEstimate['routeSource'];
  },
): TrafficEstimate {
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

  test('Pike Place Sunday evening shows time-aware Seattle street parking copy', () => {
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
          arrivalDate: '2026-06-07',
          arrivalTime: '19:30',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({ duration: 18, trustStatus: 'estimated' }),
        }}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Likely free street parking')).toBeInTheDocument();
    expect(screen.queryByText('Likely paid street parking')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Seattle street parking is generally free on Sundays/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Street parking estimate based on Seattle payment hours/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText('High confidence').length).toBeGreaterThan(0);
  });

  test('non-Seattle U.S. city Sunday street parking stays check-signs', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Downtown Manhattan, New York, NY',
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
          destination: 'Downtown Manhattan, New York, NY',
          destinationName: 'Downtown Manhattan',
          destinationKind: 'downtown',
          arrivalDate: '2026-06-07',
          arrivalTime: '14:00',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({ duration: 18, trustStatus: 'estimated' }),
        }}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Check signs / special rules possible')).toBeInTheDocument();
    expect(screen.queryByText('Likely free street parking')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Sunday street parking payment rules vary by U\.S\. city/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Street parking estimate based on Seattle payment hours/i),
    ).not.toBeInTheDocument();
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
        routeHydrationState="final_unavailable"
      />,
    );

    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
    expect(screen.getByText('Drive time unavailable')).toBeInTheDocument();
    expect(screen.getByText('Open directions to confirm drive time.')).toBeInTheDocument();
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
        routeHydrationState="final_unavailable"
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
    expect(screen.getByText('Estimated total: ~12 min')).toBeInTheDocument();
    expect(screen.getByText('~4 min drive + ~8 min parking/walk')).toBeInTheDocument();
    expect(screen.queryByText(/0 min drive/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Recommended option/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Best choice/i)).not.toBeInTheDocument();
  });

  test('local cafe uses route drive time instead of parking-lot drive in total breakdown', () => {
    const params = buildQuickGoSearchParams({
      destinationText: "Jeno's Cafe, Monroe, WA",
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
          destination: "Jeno's Cafe, Monroe, WA",
          destinationName: "Jeno's Cafe",
          destinationKind: 'restaurant',
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
              name: 'Parking near destination',
              type: 'off-airport',
              price: 0,
              distance: 1,
              availability: 80,
              trustStatus: 'estimated',
              sourceName: 'Test parking',
              lastUpdated: '2026-06-01T00:00:00.000Z',
              assumptions: [],
              parkingBufferMinutes: 8,
              transferToTerminalMinutes: 8,
              walkingMinutes: 0,
              transferType: 'walk',
            },
            score: 90,
            cost: 0,
            duration: 16,
            stressScore: 70,
            reasons: [],
          },
        ]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Estimated total: ~8 min')).toBeInTheDocument();
    expect(screen.getByText('~4 min drive + ~4 min parking/walk')).toBeInTheDocument();
    expect(
      screen.getByText('Free/customer parking likely. Small parking/walk buffer added.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/0 min drive/i)).not.toBeInTheDocument();
    expect(screen.queryByText('16 min')).not.toBeInTheDocument();
  });

  test('overrides stale server unavailable while route refresh is pending', () => {
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
          trafficEstimate: trafficEstimate({
            duration: 0,
            routeUnavailable: true,
            routeStatus: 'unavailable',
            trustStatus: 'fallback',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        routeLoading
      />,
    );

    expect(screen.getByText('Calculating drive time…')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('Calculating…')).toBeInTheDocument();
  });

  test('shows calculating drive time while route is loading', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Grocery store',
      origin: {
        origin: '123 Main Street, Example City, ST',
        originLabel: '123 Main Street, Example City, ST',
        originSource: 'manual',
      },
    });

    render(
      <QuickGoResultsView
        tripData={tripData}
        recommendation={{
          ...recommendation,
          trafficEstimate: undefined,
        }}
        rankedOptions={[]}
        searchParams={params}
        routeLoading
      />,
    );

    expect(screen.getByText('Calculating drive time…')).toBeInTheDocument();
    expect(screen.getByText('Finding your start and destination…')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('Calculating…')).toBeInTheDocument();
    expect(screen.getByText('Drive time')).toBeInTheDocument();
  });

  test('keeps prior drive time visible while refreshing', () => {
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
          trafficEstimate: trafficEstimate({
            duration: 4,
            trustStatus: 'live',
            sourceName: 'Google Routes API',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        routeRefreshing
        priorDriveMinutes={4}
      />,
    );

    expect(screen.getByText('Refreshing…')).toBeInTheDocument();
    expect(screen.getByText('Previous estimate: 4 min')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('marks drive time card as busy while loading', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Pike Place Market, Seattle, WA',
      origin: {
        origin: '123 Main Street, Example City, ST',
        originLabel: '123 Main Street, Example City, ST',
        originSource: 'manual',
      },
    });

    const { container } = render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Pike Place Market, Seattle, WA',
          destinationName: 'Pike Place Market',
          destinationKind: 'downtown',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({
            duration: 4,
            trustStatus: 'live',
            sourceName: 'Mapbox Directions',
            routeSource: 'mapbox',
            routeStatus: 'ready',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        routeLoading
      />,
    );

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
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

  test('suppresses initial stale unavailable via clientRouteRefreshPending', () => {
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
          trafficEstimate: trafficEstimate({
            duration: 0,
            routeUnavailable: true,
            routeStatus: 'unavailable',
            trustStatus: 'fallback',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        clientRouteRefreshPending
      />,
    );

    expect(screen.getByText('Calculating drive time…')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('routable Quick Go with stale server unavailable starts as calculating before hydration', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Dairy Queen, Monroe, WA',
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
          destination: 'Dairy Queen, Monroe, WA',
          destinationName: 'Dairy Queen',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({
            duration: 0,
            routeUnavailable: true,
            routeStatus: 'unavailable',
            trustStatus: 'fallback',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        routeHydrationState="not_started"
      />,
    );

    expect(screen.getByText('Calculating drive time…')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('routable Quick Go stays calculating while route hydration is resolving', () => {
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
          trafficEstimate: trafficEstimate({
            duration: 0,
            routeUnavailable: true,
            routeStatus: 'unavailable',
            trustStatus: 'fallback',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        routeHydrationState="resolving"
      />,
    );

    expect(screen.getByText('Calculating drive time…')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('final ready hydration shows Mapbox result even after stale unavailable server state', () => {
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
          trafficEstimate: trafficEstimate({
            duration: 4,
            routeUnavailable: true,
            routeStatus: 'ready',
            routeSource: 'mapbox',
            trustStatus: 'live',
            sourceName: 'Mapbox Directions',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        routeHydrationState="final_ready"
      />,
    );

    expect(screen.getByText('Estimated drive time: ~4 min')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('missing destination coords but geocodable destination remains calculating', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Dairy Queen, Monroe, WA',
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
          destination: 'Dairy Queen, Monroe, WA',
          destinationName: 'Dairy Queen',
          destinationLat: undefined,
          destinationLng: undefined,
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({
            duration: 0,
            routeUnavailable: true,
            routeStatus: 'unavailable',
            trustStatus: 'fallback',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        routeHydrationState="not_started"
      />,
    );

    expect(screen.getByText('Calculating drive time…')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('missing origin renders unavailable only as an unroutable final state', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Dairy Queen, Monroe, WA',
      origin: {
        origin: '',
        originLabel: '',
        originSource: 'manual',
      },
    });

    render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          origin: '',
          destination: 'Dairy Queen, Monroe, WA',
          destinationName: 'Dairy Queen',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({
            duration: 0,
            routeUnavailable: true,
            routeStatus: 'unavailable',
            trustStatus: 'fallback',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        routeHydrationState="final_unavailable"
      />,
    );

    expect(screen.getByText('Drive time unavailable')).toBeInTheDocument();
  });

  test('shows mapbox loading body during google to mapbox transition', () => {
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
          trafficEstimate: trafficEstimate({
            duration: 0,
            routeUnavailable: true,
            routeStatus: 'mapbox_loading',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
        routeLoading
      />,
    );

    expect(screen.getByText('Trying backup route timing…')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('rapid route changes do not flash unavailable between pending states', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
      origin: {
        origin: '13907 Chain Lake Rd, Monroe, WA 98272',
        originLabel: '13907 Chain Lake Rd, Monroe, WA 98272',
        originSource: 'manual',
      },
    });

    const staleUnavailable = trafficEstimate({
      duration: 0,
      routeUnavailable: true,
      routeStatus: 'unavailable',
      trustStatus: 'fallback',
    });

    const { rerender } = render(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
          destinationName: 'Fred Meyer',
        }}
        recommendation={{ ...recommendation, trafficEstimate: staleUnavailable }}
        rankedOptions={[]}
        searchParams={params}
        routeLoading
        clientRouteRefreshPending
      />,
    );

    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();

    rerender(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
          destinationName: 'Fred Meyer',
        }}
        recommendation={{ ...recommendation, trafficEstimate: staleUnavailable }}
        rankedOptions={[]}
        searchParams={params}
        routeRefreshing
        priorDriveMinutes={4}
        clientRouteRefreshPending
      />,
    );

    expect(screen.getByText('Refreshing…')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();

    rerender(
      <QuickGoResultsView
        tripData={{
          ...tripData,
          destination: 'Fred Meyer, 18805 US-2, Monroe, WA 98272',
          destinationName: 'Fred Meyer',
        }}
        recommendation={{
          ...recommendation,
          trafficEstimate: trafficEstimate({
            duration: 4,
            trustStatus: 'live',
            sourceName: 'Mapbox Directions',
            routeSource: 'mapbox',
            routeStatus: 'ready',
          }),
        }}
        rankedOptions={[]}
        searchParams={params}
      />,
    );

    expect(screen.getByText('Estimated drive time: ~4 min')).toBeInTheDocument();
    expect(screen.queryByText('Drive time unavailable')).not.toBeInTheDocument();
  });

  test('best way to go shows parking price and provider CTA beside Open directions', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
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
          destination: 'Brighton Jones, 1st Avenue, Seattle, WA, USA',
          destinationName: 'Brighton Jones',
        }}
        recommendation={recommendation}
        rankedOptions={[
          {
            type: 'parking',
            option: {
              id: 'lot-2120',
              name: '2120 5th Ave. Lot',
              type: 'off-airport',
              price: 18,
              priceDisplay: 'live',
              pricingConfidence: 'live',
              priceSource: 'parkwhiz-live',
              bookingProvider: 'ParkWhiz',
              sourceName: 'ParkWhiz',
              sourceLink: 'https://www.parkwhiz.com/lot/2120',
              searchQuery: '2120 5th Ave parking Seattle',
              availability: 80,
              trustStatus: 'live',
              lastUpdated: '2026-06-01T00:00:00.000Z',
              assumptions: [],
            },
            score: 90,
            cost: 18,
            duration: 24,
            stressScore: 55,
            reasons: [],
          },
        ]}
        searchParams={params}
      />,
    );

    expect(
      screen.getByText('Drive + park · 2120 5th Ave. Lot · $18'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open directions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reserve parking' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
  });

  test('hides provider CTA when selected parking option has no source link', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Neighborhood Cafe, Seattle, WA',
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
          destination: 'Neighborhood Cafe, Seattle, WA',
          destinationName: 'Neighborhood Cafe',
        }}
        recommendation={recommendation}
        rankedOptions={[
          {
            type: 'parking',
            option: {
              id: 'lot-local',
              name: 'Centennial Garage',
              type: 'off-airport',
              price: 18,
              priceDisplay: 'estimated',
              priceSource: 'google-places',
              sourceName: 'Google Places',
              availability: 70,
              trustStatus: 'estimated',
              lastUpdated: '2026-06-01T00:00:00.000Z',
              assumptions: [],
            },
            score: 88,
            cost: 18,
            duration: 22,
            stressScore: 50,
            reasons: [],
          },
        ]}
        searchParams={params}
      />,
    );

    expect(
      screen.getByText('Drive + park · Centennial Garage · ~$18 est.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open directions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reserve parking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check provider' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compare parking' })).not.toBeInTheDocument();
  });

  test('shows Compare parking CTA for SpotHero parking winner', () => {
    const params = buildQuickGoSearchParams({
      destinationText: 'Downtown Seattle, WA',
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
          destination: 'Downtown Seattle, WA',
          destinationName: 'Downtown Seattle',
        }}
        recommendation={recommendation}
        rankedOptions={[
          {
            type: 'parking',
            option: {
              id: 'sh-lot',
              name: 'Nearby Garage',
              type: 'off-airport',
              price: 24,
              priceDisplay: 'check-live',
              bookingProvider: 'SpotHero',
              sourceName: 'SpotHero',
              sourceLink: 'https://spothero.com/search?search=Seattle',
              searchQuery: 'Seattle parking',
              availability: 75,
              trustStatus: 'estimated',
              lastUpdated: '2026-06-01T00:00:00.000Z',
              assumptions: [],
            },
            score: 85,
            cost: 24,
            duration: 20,
            stressScore: 48,
            reasons: [],
          },
        ]}
        searchParams={params}
      />,
    );

    expect(
      screen.getByText('Drive + park · Nearby Garage · Check live price'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare parking' })).toBeInTheDocument();
  });
});
