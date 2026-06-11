/**
 * @jest-environment jsdom
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DestinationParkingSummary from '@/app/components/DestinationParkingSummary';
import {
  buildDestinationAccessStorageKey,
  writeDestinationAccessConfirmed,
} from '@/lib/parking/destinationParkingClassifier';

describe('DestinationParkingSummary', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('restricted parking shows warning', () => {
    render(
      <DestinationParkingSummary
        destination="PSE corporate headquarters"
        origin="Home, Bellevue, WA"
      />,
    );

    expect(screen.getByText(/Restricted parking may apply/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I have access' })).toBeInTheDocument();
  });

  test('"I have access" changes local state only', () => {
    const destination = 'Corporate office building';

    render(
      <DestinationParkingSummary destination={destination} origin="Home, Seattle, WA" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'I have access' }));

    expect(screen.getByText(/Access confirmed for this trip/)).toBeInTheDocument();
    expect(window.localStorage.getItem(buildDestinationAccessStorageKey(destination))).toBe(
      'confirmed',
    );

    writeDestinationAccessConfirmed('Different destination');
    expect(window.localStorage.getItem(buildDestinationAccessStorageKey(destination))).toBe(
      'confirmed',
    );
  });

  test('does not render for airport destinations', () => {
    const { container } = render(
      <DestinationParkingSummary
        destination="Seattle-Tacoma International Airport"
        destinationKind="airport"
        airportCode="SEA"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('shows free_likely outlook copy', () => {
    render(<DestinationParkingSummary destination="Costco Wholesale" origin="Home" />);

    expect(screen.getByText('Free customer parking likely')).toBeInTheDocument();
    expect(screen.getAllByText(/Customer parking likely available/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Verify signs')).toBeInTheDocument();
    expect(screen.getAllByText('High confidence').length).toBeGreaterThan(0);
  });

  test('shows suggest parking info CTA copy', () => {
    render(
      <DestinationParkingSummary
        destination="123 Mystery Lane"
        origin="Home, Seattle, WA"
      />,
    );

    expect(screen.getByRole('button', { name: 'Suggest parking info' })).toBeInTheDocument();
    expect(screen.getByText(/Know a better parking rule or garage/i)).toBeInTheDocument();
  });

  test('unknown destination uses helpful copy and CTAs', () => {
    render(
      <DestinationParkingSummary
        destination="123 Mystery Lane"
        origin="Home, Seattle, WA"
        onCheckNearbyParking={() => undefined}
      />,
    );

    expect(screen.getByText('Parking not confirmed yet')).toBeInTheDocument();
    expect(screen.getAllByText(/could not verify exact parking rules/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Verify posted signs and lot rules/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open directions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View parking options' })).toBeInTheDocument();
  });

  test('shows reason, source chips, and caveat above the fold', () => {
    render(
      <DestinationParkingSummary
        destination="Brighton Jones, 1st Avenue, Seattle, WA, USA"
        origin="Home, Seattle, WA"
        arrivalDate="2026-06-02"
        arrivalTime="10:00"
      />,
    );

    expect(screen.getByText('Likely paid street parking')).toBeInTheDocument();
    expect(screen.getAllByText(/during typical meter hours/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Street parking estimate based on Seattle payment hours/i).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('Seattle rule')).toBeInTheDocument();
    expect(screen.getAllByText('High confidence').length).toBeGreaterThan(0);
    expect(screen.getByText(/Verify posted signs and lot rules/)).toBeInTheDocument();
  });

  test('hides diagnostics above the fold', () => {
    const { container } = render(
      <DestinationParkingSummary destination="123 Mystery Lane" origin="Home" />,
    );

    const hero = container.querySelector('section[aria-label="Destination parking outlook"]');
    expect(hero).toBeTruthy();
    expect(hero?.textContent).not.toContain('could not infer parking rules');
    expect(screen.queryByText('Unknown confidence')).not.toBeInTheDocument();
    expect(screen.getByText('Details and evidence')).toBeInTheDocument();
  });
});
