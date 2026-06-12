/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { StoredTripFallback } from '../[tripId]/page';

jest.mock('next/navigation', () => ({
  useParams: () => ({ tripId: 'missing-trip' }),
  usePathname: () => '/results/missing-trip',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('../ResultsContent', () => ({
  __esModule: true,
  default: () => <div>Results content</div>,
}));

describe('StoredResultsPage fallback', () => {
  test('keeps Start a new trip recovery action for missing saved trips', () => {
    render(<StoredTripFallback kind="missing" />);

    expect(screen.getByRole('heading', { name: 'Trip details not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start a new trip' })).toHaveAttribute(
      'href',
      '/trip',
    );
  });
});
