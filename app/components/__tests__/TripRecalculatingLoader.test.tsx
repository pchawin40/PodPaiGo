/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import TripRecalculatingLoader from '../TripRecalculatingLoader';

describe('TripRecalculatingLoader', () => {
  test('renders the friendly recalculating copy instead of plain technical copy', () => {
    render(<TripRecalculatingLoader />);

    expect(screen.getByText('Finding the best way to go…')).toBeInTheDocument();
    expect(screen.queryByText('Recalculating…')).not.toBeInTheDocument();
    expect(screen.getByText('Checking route time…')).toBeInTheDocument();
    expect(screen.getByText('Comparing parking…')).toBeInTheDocument();
    expect(screen.getByText('Looking at transit and rideshare…')).toBeInTheDocument();
  });

  test('marks the animation as reduced-motion safe', () => {
<<<<<<< HEAD
    const { container } = render(<TripRecalculatingLoader />);
    const panel = screen.getByText('Finding the best way to go…').closest('section');

    expect(panel).toHaveAttribute('aria-busy', 'true');
    expect(panel).toHaveAttribute('aria-live', 'polite');
=======
    render(<TripRecalculatingLoader />);

>>>>>>> main
    expect(screen.getByTestId('podpaigo-route-loader')).toHaveAttribute(
      'data-reduced-motion-safe',
      'true',
    );
<<<<<<< HEAD
    expect(container.querySelector('style')?.textContent).toContain(
      'prefers-reduced-motion: reduce',
    );
=======
    expect(screen.getByLabelText('Finding the best way to go…').closest('section')).toBeNull();
>>>>>>> main
  });

  test('supports static custom loading copy for city parking searches', () => {
    render(
      <TripRecalculatingLoader
        title="Finding nearby parking…"
        statusMessages={['Checking garages, lots, and street rules.']}
      />,
    );

    expect(screen.getByText('Finding nearby parking…')).toBeInTheDocument();
    expect(screen.getByText('Checking garages, lots, and street rules.')).toBeInTheDocument();
  });
});
