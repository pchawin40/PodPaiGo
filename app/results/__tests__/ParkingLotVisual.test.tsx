/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ParkingLotVisual, {
  resetParkingLotVisualPhotoCacheForTests,
} from '@/app/results/ParkingLotVisual';

describe('ParkingLotVisual attribution', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    resetParkingLotVisualPhotoCacheForTests();
  });

  test('uses Google photo metadata before provider images or illustration', async () => {
    render(
      <ParkingLotVisual
        option={{
          id: 'lot-google-first',
          name: 'Google First Lot',
          type: 'off-airport',
          googlePlaceId: 'places/abc',
          googlePhotoName: 'places/abc/photos/primary',
          imageUrl: 'https://provider.example.com/fallback.jpg',
        }}
        airportCode="SEA"
      />,
    );

    const img = screen.getByAltText('Google First Lot photo') as HTMLImageElement;
    expect(img.src).toContain('/api/google-place-photo?');
    expect(img.src).toContain(encodeURIComponent('places/abc/photos/primary'));
    expect(screen.getByText('Google photo')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
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
        photoPriority="top"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Photo courtesy of Airport Parking Co\./)).toBeInTheDocument();
    });
  });

  test('uses supplied provider image before illustration without selector request', async () => {
    render(
      <ParkingLotVisual
        option={{
          id: 'quality-provider-photo',
          name: 'Quality Inn SEA Airport Parking',
          type: 'off-airport',
          imageUrl: 'https://d2uqqhmijd5j2z.cloudfront.net/files/quality/gallery/Quality_Inn_SEA.png',
          images: [
            'https://d2uqqhmijd5j2z.cloudfront.net/files/quality/gallery/Quality_Inn_SEA.png',
            '/assets/parking/hotel-parking.svg',
          ],
          photoSource: 'provider',
          photoAttribution: 'ParkWhiz',
          bookingProvider: 'ParkWhiz',
        }}
        airportCode="SEA"
        photoPriority="visible"
      />,
    );

    const img = screen.getByAltText('Quality Inn SEA Airport Parking photo') as HTMLImageElement;
    expect(img.src).toContain('Quality_Inn_SEA.png');
    expect(screen.getByText('Lot photo')).toBeInTheDocument();
    expect(screen.getByText('ParkWhiz')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
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
        photoPriority="top"
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/parking-lot-photo?'));
    });

    const img = screen.getByAltText('Safe Mode Lot photo') as HTMLImageElement;
    expect(img.src).toContain('/assets/parking/');
    expect(img.src).not.toContain('/api/google-place-photo');
  });

  test('shows safe mode notice and Google Maps attribution for live Google photos', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        imageUrl: '/api/google-place-photo?name=places%2Fabc%2Fphotos%2F1',
        source: 'google_live',
        attribution: 'Photo © Google',
        attributionUrl: 'https://maps.google.com',
        requiresGoogleAttribution: true,
      }),
    });

    render(
      <ParkingLotVisual
        option={{ id: 'lot-3', name: 'Google Lot', type: 'off-airport' }}
        airportCode="SEA"
        photoPriority="top"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Photo © Google/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Google Maps' })).toBeInTheDocument();
    });
  });

  test('builds the Google photo proxy URL from resource names without fetching selector first', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        imageUrl: '/api/google-place-photo?name=places%2Fabc%2Fphotos%2Fprimary',
        source: 'google_live',
        attribution: 'Photo © Google',
        attributionUrl: 'https://maps.google.com',
        requiresGoogleAttribution: true,
      }),
    });

    render(
      <ParkingLotVisual
        option={{
          id: 'lot-photos',
          name: 'Photo Lot',
          type: 'off-airport',
          googlePlaceId: 'places/abc',
          googlePhotoNames: ['places/abc/photos/primary'],
        }}
        airportCode="SEA"
      />,
    );

    const img = screen.getByAltText('Photo Lot photo') as HTMLImageElement;
    expect(img.src).toContain('/api/google-place-photo?');
    expect(img.src).toContain(encodeURIComponent('places/abc/photos/primary'));
    expect(screen.getByText(/Photo © Google/)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('shows Google photos safe mode message when API returns notice', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        imageUrl: '/assets/parking/airport-parking.svg',
        source: 'placeholder',
        attribution: null,
        attributionUrl: null,
        requiresGoogleAttribution: false,
        safeModeNotice: 'Google photos unavailable in safe mode',
      }),
    });

    render(
      <ParkingLotVisual
        option={{ id: 'lot-4', name: 'Blocked Google Lot', googlePlaceId: 'place-1' }}
        airportCode="SEA"
        photoPriority="top"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Google photos unavailable in safe mode')).toBeInTheDocument();
    });
  });

  test('dedupes repeated same-lot photo requests during a page load', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        imageUrl: '/assets/parking/off-site-shuttle.svg',
        source: 'placeholder',
        attribution: null,
        attributionUrl: null,
        requiresGoogleAttribution: false,
        fallbackReason: 'live_lookup_skipped_priority',
      }),
    });

    render(
      <>
        <ParkingLotVisual
          option={{
            id: 'parkwhiz-session-a',
            name: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
            type: 'off-airport',
            bookingProvider: 'ParkWhiz',
          }}
          airportCode="SEA"
          photoPriority="top"
        />
        <ParkingLotVisual
          option={{
            id: 'parkwhiz-session-b',
            name: 'Jiffy Airport Parking Lot SEA - Self Uncovered',
            type: 'off-airport',
            bookingProvider: 'ParkWhiz',
          }}
          airportCode="SEA"
          photoPriority="top"
        />
      </>,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('priority=top');
  });

  test('visible visuals request through selector and dedupe same-lot requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        imageUrl: '/api/google-place-photo?name=places%2Fvisible%2Fphotos%2F1',
        source: 'google_live',
        attribution: 'Photo © Google',
        attributionUrl: 'https://maps.google.com',
        requiresGoogleAttribution: true,
      }),
    });

    render(
      <>
        <ParkingLotVisual
          option={{
            id: 'visible-session-a',
            name: 'Visible Airport Parking Lot SEA - Self Uncovered',
            type: 'off-airport',
            bookingProvider: 'ParkWhiz',
          }}
          airportCode="SEA"
          photoPriority="visible"
        />
        <ParkingLotVisual
          option={{
            id: 'visible-session-b',
            name: 'Visible Airport Parking Lot SEA - Self Uncovered',
            type: 'off-airport',
            bookingProvider: 'ParkWhiz',
          }}
          airportCode="SEA"
          photoPriority="visible"
        />
      </>,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('priority=visible');
    expect(screen.getAllByText('Google photo').length).toBeGreaterThan(0);
  });

  test('background visuals use local placeholder without selector request', async () => {
    render(
      <ParkingLotVisual
        option={{
          id: 'background-lot',
          name: 'Background Airport Parking Lot SEA - Self Uncovered',
          type: 'off-airport',
          bookingProvider: 'ParkWhiz',
        }}
        airportCode="SEA"
        photoPriority="background"
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText('Background Airport Parking Lot SEA - Self Uncovered photo')).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
