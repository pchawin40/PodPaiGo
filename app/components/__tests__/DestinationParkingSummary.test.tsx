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

    expect(screen.getByText('Restricted parking may apply')).toBeInTheDocument();
    expect(screen.getByText(/Restricted parking may apply\./)).toBeInTheDocument();
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

    expect(screen.getByText('Parking likely free at destination')).toBeInTheDocument();
    expect(
      screen.getByText(/Destination appears to have customer parking/),
    ).toBeInTheDocument();
  });
});
