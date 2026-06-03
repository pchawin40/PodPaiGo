/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ParkingLotVisual from '@/app/results/ParkingLotVisual';

describe('ParkingLotVisual attribution', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test('renders attribution when provider photo requires it', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        imageUrl: 'https://provider.example.com/lot.jpg',
        source: 'provider',
        attribution: 'Photo courtesy of Airport Parking Co.',
        attributionUrl: 'https://provider.example.com/license',
        requiresGoogleAttribution: false,
      }),
    });

    render(
      <ParkingLotVisual
        option={{ id: 'lot-1', name: 'Provider Lot', type: 'off-airport' }}
        airportCode="SEA"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Photo courtesy of Airport Parking Co\./)).toBeInTheDocument();
    });
  });

  test('does not call google photo proxy when disabled response returns placeholder', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        imageUrl: '/assets/parking/airport-parking.svg',
        source: 'placeholder',
        attribution: null,
        attributionUrl: null,
        requiresGoogleAttribution: false,
      }),
    });

    render(
      <ParkingLotVisual
        option={{
          id: 'lot-2',
          name: 'Safe Mode Lot',
          imageUrl: '/api/google-place-photo?name=places%2Fabc%2Fphotos%2F1',
        }}
        airportCode="SEA"
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/parking-lot-photo?'));
    });

    const img = screen.getByAltText('Safe Mode Lot photo') as HTMLImageElement;
    expect(img.src).toContain('/assets/parking/');
    expect(img.src).not.toContain('/api/google-place-photo');
  });
});
