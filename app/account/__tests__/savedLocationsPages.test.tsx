/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SavedDestinationsPage from '@/app/account/destinations/page';
import SavedParkingLotsPage from '@/app/account/parking-lots/page';

jest.mock('next/navigation', () => ({
  usePathname: () => '/account/destinations',
}));

jest.mock('@/app/components/SiteHeader', () => ({
  __esModule: true,
  default: () => <div data-testid="site-header" />,
}));

jest.mock('@/lib/analytics/trackEvent', () => ({
  trackEvent: jest.fn(),
}));

describe('account saved destinations page', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('saved destination appears in account', () => {
    render(<SavedDestinationsPage />);

    fireEvent.change(screen.getByPlaceholderText('Fred Meyer Monroe'), {
      target: { value: 'Grocery store' },
    });
    fireEvent.change(screen.getByPlaceholderText('19500 Hwy 2, Monroe, WA'), {
      target: { value: '123 Main Street, Example City, ST' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save destination' }));

    expect(screen.getByText('Grocery store')).toBeInTheDocument();
    expect(screen.getByText('123 Main Street, Example City, ST')).toBeInTheDocument();
  });
});

describe('account saved parking lots page', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('saved parking lot appears in account', () => {
    render(<SavedParkingLotsPage />);

    fireEvent.change(screen.getByPlaceholderText('Pacific Place Garage'), {
      target: { value: 'Pacific Place Garage' },
    });
    fireEvent.change(screen.getByPlaceholderText('600 Pine St, Seattle, WA'), {
      target: { value: '600 Pine St, Seattle, WA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save parking lot' }));

    expect(screen.getAllByText('Pacific Place Garage').length).toBeGreaterThan(0);
    expect(screen.getByText('600 Pine St, Seattle, WA')).toBeInTheDocument();
  });
});
