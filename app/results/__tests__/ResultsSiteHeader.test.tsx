/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ResultsSiteHeader from '../ResultsSiteHeader';
import { shouldShowResultsNewTripCta } from '../resultsNewTripCta';

let mockSearchParams = '';

jest.mock('next/navigation', () => ({
  usePathname: () => '/results',
  useSearchParams: () => new URLSearchParams(mockSearchParams),
}));

jest.mock('@/app/components/AuthProvider', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    loading: false,
    configured: true,
    signOut: jest.fn(),
  }),
}));

jest.mock('@/app/components/useAdminStatus', () => ({
  useAdminStatus: () => ({
    configured: true,
    loading: false,
    signedIn: false,
    isAdmin: false,
    accessToken: null,
    statusCode: 403,
  }),
}));

jest.mock('@/app/components/ThemeToggle', () => ({
  __esModule: true,
  default: () => <button type="button">Theme</button>,
}));

describe('ResultsSiteHeader', () => {
  beforeEach(() => {
    mockSearchParams = '';
  });

  test('detects airport result params for the New trip CTA', () => {
    expect(
      shouldShowResultsNewTripCta(
        new URLSearchParams('type=one-way-departure&destination=Seattle-Tacoma+International+Airport'),
      ),
    ).toBe(true);
    expect(
      shouldShowResultsNewTripCta(new URLSearchParams('type=quick-go&destinationKind=airport')),
    ).toBe(true);
    expect(
      shouldShowResultsNewTripCta(new URLSearchParams('type=general-trip&airportCode=SEA')),
    ).toBe(true);
  });

  test('hides New trip for general point A to B results', () => {
    mockSearchParams = 'type=general-trip&origin=Monroe&destination=Pike+Place+Market';

    render(<ResultsSiteHeader />);

    expect(screen.queryByRole('link', { name: 'New trip' })).not.toBeInTheDocument();
  });

  test('shows New trip for airport results', () => {
    mockSearchParams =
      'type=airport-departure&origin=Monroe&destination=Seattle-Tacoma+International+Airport&airportCode=SEA';

    render(<ResultsSiteHeader />);

    expect(screen.getByRole('link', { name: 'New trip' })).toHaveAttribute('href', '/trip');
  });

  test('uses stored saved-trip params before ResultsContent parses the trip', () => {
    render(
      <ResultsSiteHeader storedSearchParams="type=point-to-point&origin=Monroe&destination=Seattle" />,
    );

    expect(screen.queryByRole('link', { name: 'New trip' })).not.toBeInTheDocument();
  });
});
