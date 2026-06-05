/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { EditTripForm } from '../ResultsContent';
import type { TripData } from '@/lib/types';

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/app/components/AuthProvider', () => ({
  useAuth: () => ({ session: null }),
}));

const initialData: TripData = {
  type: 'general-trip',
  origin: 'Monroe, WA',
  destination: 'Pike Place Market',
  destinationName: 'Pike Place Market',
  destinationKind: 'general',
  arrivalDate: '2026-11-13',
  arrivalTime: '09:00',
  parkingDuration: 8 * 60,
  parkingCheckInDate: '2026-11-13',
  parkingCheckInTime: '09:00',
  parkingCheckOutDate: '2026-11-13',
  parkingCheckOutTime: '17:00',
  transportAvailability: 'car',
  parkingPreference: 'nearby',
};

describe('EditTripForm general parking window', () => {
  beforeEach(() => {
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn(async () => ({ ok: true, json: async () => ({ predictions: [] }) })),
    });
  });

  test('shows derived summary, preserves custom override, and resets to default', () => {
    render(
      <EditTripForm
        initialData={initialData}
        onSubmit={() => undefined}
        onCancel={() => undefined}
        intent="general-trip"
        airportCode="SEA"
      />,
    );

    expect(screen.getByText('Parking: 9:00 AM-5:00 PM (8 hours)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Advanced parking time' }));
    fireEvent.change(screen.getByLabelText('Park until time'), {
      target: { value: '18:00' },
    });

    expect(screen.getByText('Using custom parking window')).toBeInTheDocument();
    expect(screen.getByText('Parking: 9:00 AM-6:00 PM (9 hours)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reset to arrival + duration' }));

    expect(screen.queryByText('Using custom parking window')).not.toBeInTheDocument();
    expect(screen.getByText('Parking: 9:00 AM-5:00 PM (8 hours)')).toBeInTheDocument();
  });
});
