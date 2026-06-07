/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ParkingCheckInTimingBanner from '@/app/results/ParkingCheckInTimingBanner';
import type { ParkingCheckInTimingMessage } from '@/lib/airports/airportLeaveBy';

function renderBanner(overrides: Partial<ParkingCheckInTimingMessage>) {
  const message: ParkingCheckInTimingMessage = {
    status: 'good',
    title: 'Parking time looks good',
    body: 'Your parking check-in lines up with your flight timing and airport buffer.',
    basis: '',
    deltaMinutes: 0,
    absoluteDeltaLabel: '0 min',
    recommendedCheckInTime: '08:00',
    selectedCheckInTime: '08:00',
    ...overrides,
  };

  return render(<ParkingCheckInTimingBanner message={message} />);
}

describe('ParkingCheckInTimingBanner', () => {
  test('shows early cushion duration in the title', () => {
    renderBanner({
      status: 'early',
      title: 'You have 1h 30m extra airport cushion',
      body: "Your 6:30 AM parking check-in is earlier than PodPaiGo estimates you need. That's okay if you want a relaxed airport arrival.",
      basis: 'Based on your selected parking check-in.',
      deltaMinutes: 90,
      absoluteDeltaLabel: '1h 30m',
      selectedCheckInTime: '06:30',
    });

    expect(screen.getByText('You have 1h 30m extra airport cushion')).toBeInTheDocument();
    expect(screen.getByText(/6:30 AM parking check-in/)).toBeInTheDocument();
    expect(screen.getByText('Based on your selected parking check-in.')).toBeInTheDocument();
  });

  test('shows late tightness duration in the title', () => {
    renderBanner({
      status: 'late',
      title: 'Parking check-in may be tight by 20 min',
      body: 'Your selected parking check-in may leave less time than recommended for parking, shuttle/walk, security, and boarding.',
      basis: 'Consider moving check-in earlier or choosing a faster parking option.',
      deltaMinutes: -20,
      absoluteDeltaLabel: '20 min',
      selectedCheckInTime: '08:20',
    });

    expect(screen.getByText('Parking check-in may be tight by 20 min')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Consider moving check-in earlier or choosing a faster parking option.',
      ),
    ).toBeInTheDocument();
  });

  test('shows good timing without subtext', () => {
    renderBanner({
      status: 'good',
      title: 'Parking time looks good',
      deltaMinutes: 10,
      absoluteDeltaLabel: '10 min',
      selectedCheckInTime: '07:50',
    });

    expect(screen.getByText('Parking time looks good')).toBeInTheDocument();
    expect(
      screen.queryByText('Based on your selected parking check-in.'),
    ).not.toBeInTheDocument();
  });

  test('shows unknown timing without duration copy', () => {
    renderBanner({
      status: 'unknown',
      title: 'Parking check-in timing unavailable',
      body: 'PodPaiGo could not compare your parking check-in to a recommended time yet.',
      basis: '',
      deltaMinutes: null,
      absoluteDeltaLabel: null,
      recommendedCheckInTime: null,
      selectedCheckInTime: '06:00',
    });

    expect(screen.getByText('Parking check-in timing unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\s*min/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+h/)).not.toBeInTheDocument();
  });
});
