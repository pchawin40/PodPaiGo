/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TripFlow from '../TripFlow';

const pushMock = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

jest.mock('@/lib/analytics/trackEvent', () => ({
  trackEvent: jest.fn(),
}));

function mockFetch() {
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    writable: true,
    value: jest.fn(async () => ({
      ok: true,
      json: async () => ({
        airportCode: 'SEA',
        sourceName: 'test',
        trustStatus: 'estimated',
        lanes: {},
      }),
    })),
  });
}

function readStoredTripParams(): URLSearchParams {
  const storedKey = Object.keys(window.localStorage).find((key) =>
    key.startsWith('podpaigo-trip-'),
  );
  expect(storedKey).toBeTruthy();

  const payload = JSON.parse(window.localStorage.getItem(storedKey!) || '{}') as {
    query?: string;
  };
  return new URLSearchParams(payload.query || '');
}

describe('TripFlow general parking window', () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.localStorage.clear();
    mockFetch();
  });

  test('submits arrival time plus duration as derived check-in/out search params', async () => {
    render(<TripFlow />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByPlaceholderText('Office, stadium, restaurant, hotel, hospital, or address'), {
      target: { value: 'Pike Place Market' },
    });
    fireEvent.change(screen.getByPlaceholderText('Start typing your address'), {
      target: { value: 'Monroe, WA' },
    });
    fireEvent.change(screen.getByLabelText('Trip date'), {
      target: { value: '2026-11-13' },
    });
    fireEvent.change(document.querySelector('input[type="time"]')!, {
      target: { value: '09:00' },
    });
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '8' },
    });

    expect(screen.getByText('Parking: 9:00 AM-5:00 PM (8 hours)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'See options' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(1);
    });

    const params = readStoredTripParams();
    expect(params.get('parkingCheckInDate')).toBe('2026-11-13');
    expect(params.get('parkingCheckInTime')).toBe('09:00');
    expect(params.get('parkingCheckOutDate')).toBe('2026-11-13');
    expect(params.get('parkingCheckOutTime')).toBe('17:00');
    expect(params.get('parkingDuration')).toBe('480');
  });

  test('submits manually typed MM/DD/YYYY trip date as normalized search params', async () => {
    render(<TripFlow />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByPlaceholderText('Office, stadium, restaurant, hotel, hospital, or address'), {
      target: { value: 'Pike Place Market' },
    });
    fireEvent.change(screen.getByPlaceholderText('Start typing your address'), {
      target: { value: 'Monroe, WA' },
    });
    fireEvent.change(screen.getByLabelText('Trip date'), {
      target: { value: '11/13/2026' },
    });
    fireEvent.change(document.querySelector('input[type="time"]')!, {
      target: { value: '09:00' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'See options' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(1);
    });

    const params = readStoredTripParams();
    expect(params.get('arrivalDate')).toBe('2026-11-13');
    expect(params.get('parkingCheckInDate')).toBe('2026-11-13');
    expect(params.get('parkingCheckOutDate')).toBe('2026-11-13');
  });
});
