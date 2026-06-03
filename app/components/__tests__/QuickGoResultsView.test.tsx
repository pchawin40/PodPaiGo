/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import QuickGoResultsView from '@/app/components/QuickGoResultsView';
import { buildQuickGoSearchParams } from '@/lib/trip/quickGo';
import type { Recommendation } from '@/lib/types';
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
  trafficEstimate: {
    duration: 24,
    trustStatus: 'estimated',
  },
} as Recommendation;

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

    render(
      <QuickGoResultsView
        tripData={tripData}
        recommendation={recommendation}
        rankedOptions={[
          {
            type: 'rideshare',
            option: {
              id: 'rideshare',
              name: 'Rideshare',
              duration: 24,
              price: 20,
              trustStatus: 'estimated',
            },
            score: 80,
            cost: 20,
            duration: 24,
            stressScore: 72,
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
});
