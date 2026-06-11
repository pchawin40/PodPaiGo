/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import CachedParkingNotice from '../CachedParkingNotice';
import type { ParkingOption } from '../../../lib/types';

const cachedOption = {
  id: 'destination-cache-1',
  name: 'Cached Garage',
  type: 'off-airport',
  price: 30,
  priceDisplay: 'check-live',
  distance: 5,
  availability: 50,
  trustStatus: 'estimated',
  sourceName: 'Supabase cache',
  lastUpdated: '2026-06-05T12:00:00.000Z',
  assumptions: [],
  providerSource: 'destination-cache',
  parkingDiscoveryStatus: 'cache_only_budget_limited',
} satisfies ParkingOption;

describe('CachedParkingNotice', () => {
  test('shows cached parking verification copy', () => {
    render(<CachedParkingNotice option={cachedOption} />);

    expect(screen.getByText('Cached parking option')).toBeInTheDocument();
    expect(screen.getByText('Live availability not confirmed')).toBeInTheDocument();
    expect(
      screen.getByText('Open directions/provider site to verify price and availability.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Last checked:/)).toBeInTheDocument();
  });
});
