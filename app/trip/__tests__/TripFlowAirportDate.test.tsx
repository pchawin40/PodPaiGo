/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TripFlow, { resolveAirportTripDate } from '../TripFlow';
import { calculateLeaveByTime } from '../../../lib/domain';
import type { TripData } from '../../../lib/types';
import { parseTripDataFromSearchParams } from '../../../lib/trip/searchParams';

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

async function openAirportTripForm() {
  render(<TripFlow />);
  fireEvent.click(screen.getByRole('button', { name: /Airport trip/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

async function fillAirportTripBasics() {
  fireEvent.change(screen.getByPlaceholderText('Start typing your address'), {
    target: { value: 'Monroe, WA' },
  });
  fireEvent.change(screen.getByLabelText('Parking check-in date'), {
    target: { value: '2026-11-13' },
  });
  fireEvent.change(screen.getByLabelText('Departure time'), {
    target: { value: '09:00' },
  });
}

describe('resolveAirportTripDate', () => {
  test('prefers parking check-in date over legacy trip date', () => {
    expect(
      resolveAirportTripDate({
        date: '2026-06-01',
        parkingCheckInDate: '2026-11-13',
      }),
    ).toBe('2026-11-13');
  });

  test('falls back to legacy trip date when parking check-in is blank', () => {
    expect(
      resolveAirportTripDate({
        date: '2026-06-01',
        parkingCheckInDate: '',
      }),
    ).toBe('2026-06-01');
  });
});

describe('TripFlow airport parking date UX', () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.localStorage.clear();
    mockFetch();
  });

  test('hides the separate flight/airport date field for airport trips', async () => {
    await openAirportTripForm();

    expect(screen.queryByText('Flight / airport date')).not.toBeInTheDocument();
    expect(screen.getByText('Flight departure')).toBeInTheDocument();
    expect(screen.getByLabelText('Parking check-in date')).toBeInTheDocument();
    expect(screen.getByLabelText('Departure time')).toBeInTheDocument();
  });

  test('submits parking check-in date as departureDate and flightDate', async () => {
    await openAirportTripForm();
    await fillAirportTripBasics();

    fireEvent.click(screen.getByRole('button', { name: 'See options' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(1);
    });

    const params = readStoredTripParams();
    expect(params.get('departureDate')).toBe('2026-11-13');
    expect(params.get('flightDate')).toBe('2026-11-13');
    expect(params.get('departureTime')).toBe('09:00');
    expect(params.get('parkingCheckInDate')).toBe('2026-11-13');
  });

  test('accepts manually typed MM/DD/YYYY parking check-in date', async () => {
    await openAirportTripForm();
    await fillAirportTripBasics();

    const input = screen.getByLabelText('Parking check-in date') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '11/15/2026' } });
    fireEvent.blur(input);

    expect(input.value).toBe('2026-11-15');

    fireEvent.click(screen.getByRole('button', { name: 'See options' }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledTimes(1);
    });

    const params = readStoredTripParams();
    expect(params.get('departureDate')).toBe('2026-11-15');
    expect(params.get('parkingCheckInDate')).toBe('2026-11-15');
  });

  test('parses legacy flightDate search params', () => {
    const params = new URLSearchParams({
      type: 'one-way-departure',
      intent: 'flying-out',
      origin: 'Monroe, WA',
      destination: 'SEA Airport',
      airportCode: 'SEA',
      flightDate: '2026-06-02',
      departureTime: '10:30',
    });

    const tripData = parseTripDataFromSearchParams(params);

    expect(tripData).not.toBeNull();
    if (tripData?.type === 'one-way-departure') {
      expect(tripData.departureDate).toBe('2026-06-02');
      expect(tripData.parkingCheckInDate).toBe('2026-06-02');
    }
  });

  test('leave-time uses parsed departure date from flightDate fallback', () => {
    const params = new URLSearchParams({
      type: 'one-way-departure',
      intent: 'flying-out',
      origin: 'Monroe, WA',
      destination: '17801 International Blvd, Seattle, WA 98158',
      airportCode: 'SEA',
      flightDate: '2026-11-13',
      departureTime: '12:00',
    });

    const tripData = parseTripDataFromSearchParams(params);
    expect(tripData).not.toBeNull();

    const leaveBy = calculateLeaveByTime(
      tripData as TripData,
      { waitTime: 20, source: 'estimated' },
      45,
      30,
    );

    expect(leaveBy).toBe('10:25');
  });
});
